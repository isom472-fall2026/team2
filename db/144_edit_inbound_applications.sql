-- Issue #144: KU coordinators and incoming students edit applications before a decision.
-- Run once in the Supabase SQL editor, after db/143_application_updates.sql. It changes no
-- existing application; schema.sql already contains the same result for a full rebuild.

BEGIN;

-- 1. Every edited copy points at the first version of its application.
ALTER TABLE public.inboundapplication
    ADD COLUMN IF NOT EXISTS original_application_id INT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inboundapplication_original_application_id_fkey') THEN
        ALTER TABLE public.inboundapplication
            ADD CONSTRAINT inboundapplication_original_application_id_fkey
            FOREIGN KEY (original_application_id)
            REFERENCES public.inboundapplication(application_id) ON DELETE SET NULL;
    END IF;
END;
$$;

-- 2. A modified application is an old version kept beside its copy, so it no longer counts
-- as the student's one application for the semester or the nomination.
DROP INDEX IF EXISTS public.inboundapplication_one_per_student_cycle;
CREATE UNIQUE INDEX inboundapplication_one_per_student_cycle
ON public.inboundapplication (student_id, semester_applied_for)
WHERE student_id IS NOT NULL AND application_status NOT IN ('Rejected', 'Modified');

DROP INDEX IF EXISTS public.inboundapplication_one_per_nomination;
CREATE UNIQUE INDEX inboundapplication_one_per_nomination
ON public.inboundapplication (nomination_id)
WHERE nomination_id IS NOT NULL AND application_status NOT IN ('Rejected', 'Modified');

-- 3. An old version cannot be accepted or rejected; only its current copy can.
CREATE OR REPLACE FUNCTION public.review_outbound_application(
    requested_application_id BIGINT,
    accept_application BOOLEAN,
    update_details TEXT DEFAULT NULL
)
RETURNS public.outboundapplication
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    application_row public.outboundapplication;
    previous_status VARCHAR(20);
    next_status VARCHAR(20);
BEGIN
    IF NOT public.is_ku_coordinator() THEN
        RAISE EXCEPTION 'Only a KU coordinator can review applications';
    END IF;
    IF public.get_maintenance_mode() IS DISTINCT FROM FALSE
       OR (
            public.is_testing_mode_enabled() IS TRUE
            AND NOT public.is_testing_record('outboundapplication', requested_application_id::TEXT)
        ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'This application cannot be changed in the current mode';
    END IF;

    -- Drafts are not the student's final answers, and a decided or withdrawn application
    -- has already been settled, so only applications waiting on the coordinator qualify.
    SELECT * INTO application_row
    FROM public.outboundapplication
    WHERE application_id = requested_application_id
      AND application_status IN ('Submitted', 'In Review', 'Pending Interview')
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This application is not waiting for a decision';
    END IF;

    previous_status := application_row.application_status;
    next_status := CASE WHEN accept_application THEN 'Accepted' ELSE 'Rejected' END;
    PERFORM set_config('app.application_review', 'true', true);
    UPDATE public.outboundapplication
    SET application_status = next_status, status_updated_at = now()
    WHERE application_id = requested_application_id
    RETURNING * INTO application_row;

    INSERT INTO public.application_status_log(application_id, old_status, new_status)
    VALUES (requested_application_id, previous_status, next_status);

    -- Every decision reaches the student's inbox, so a blank message falls back to the
    -- programme's standard wording.
    INSERT INTO public.updates(outbound_application_id, details)
    VALUES (
        requested_application_id,
        COALESCE(NULLIF(btrim(update_details), ''), public.default_decision_update(accept_application))
    );
    RETURN application_row;
END;
$$;

REVOKE ALL ON FUNCTION public.review_outbound_application(BIGINT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_outbound_application(BIGINT, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_inbound_application(
    requested_application_id INT,
    accept_application BOOLEAN,
    update_details TEXT DEFAULT NULL
)
RETURNS public.inboundapplication
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    application_row public.inboundapplication;
    previous_status VARCHAR(20);
    next_status VARCHAR(20);
BEGIN
    IF NOT public.is_ku_coordinator() THEN
        RAISE EXCEPTION 'Only a KU coordinator can review applications';
    END IF;
    IF public.get_maintenance_mode() IS DISTINCT FROM FALSE
       OR (
            public.is_testing_mode_enabled() IS TRUE
            AND NOT public.is_testing_record('inboundapplication', requested_application_id::TEXT)
        ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'This application cannot be changed in the current mode';
    END IF;

    -- Drafts are not the student's final answers, and a decided or withdrawn application
    -- has already been settled, so only applications waiting on the coordinator qualify.
    SELECT * INTO application_row
    FROM public.inboundapplication
    WHERE application_id = requested_application_id
      AND application_status IN ('Submitted', 'In Review', 'Pending Interview')
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This application is not waiting for a decision';
    END IF;

    previous_status := application_row.application_status;
    next_status := CASE WHEN accept_application THEN 'Accepted' ELSE 'Rejected' END;
    PERFORM set_config('app.application_review', 'true', true);
    UPDATE public.inboundapplication
    SET application_status = next_status, status_updated_at = now()
    WHERE application_id = requested_application_id
    RETURNING * INTO application_row;

    INSERT INTO public.application_status_log(inbound_application_id, old_status, new_status)
    VALUES (requested_application_id, previous_status, next_status);

    INSERT INTO public.updates(inbound_application_id, details)
    VALUES (
        requested_application_id,
        COALESCE(NULLIF(btrim(update_details), ''), public.default_decision_update(accept_application))
    );
    RETURN application_row;
END;
$$;

REVOKE ALL ON FUNCTION public.review_inbound_application(INT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_inbound_application(INT, BOOLEAN, TEXT) TO authenticated;

-- 4. Editing creates the copy and marks the old version 'Modified'.
-- Editing never overwrites a submitted application: the edit becomes a new copy and the old
-- row is kept as 'Modified', so the coordinator can still see what the student first sent.
CREATE OR REPLACE FUNCTION public.modify_inbound_application(
    requested_application_id INT,
    requested_changes JSONB
)
RETURNS public.inboundapplication
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Files, the nomination, the semester and the owner stay with the application; only the
    -- details the student typed can change.
    editable_fields CONSTANT TEXT[] := ARRAY[
        'first_name', 'middle_name', 'last_name', 'gender', 'birthdate',
        'country_of_residence', 'nationality', 'passport_issuing_country',
        'passport_number', 'passport_expiry_date', 'phone_number', 'is_whatsapp_available',
        'major', 'current_year_of_study', 'gpa', 'max_gpa', 'credits_passed', 'max_credits',
        'expected_graduation_date'
    ];
    old_row public.inboundapplication;
    new_row public.inboundapplication;
    allowed_changes JSONB;
    new_application_id INT;
    editor_is_coordinator BOOLEAN := public.is_ku_coordinator();
BEGIN
    IF public.get_maintenance_mode() IS DISTINCT FROM FALSE
       OR (
            public.is_testing_mode_enabled() IS TRUE
            AND NOT public.is_testing_record('inboundapplication', requested_application_id::TEXT)
        ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'This application cannot be changed in the current mode';
    END IF;

    SELECT * INTO old_row
    FROM public.inboundapplication
    WHERE application_id = requested_application_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application not found';
    END IF;

    IF NOT editor_is_coordinator AND NOT EXISTS (
        SELECT 1
        FROM public.incomingstudentauth AS student
        WHERE student.student_id = old_row.student_id
          AND student.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Only the student who applied or a KU coordinator can edit this application';
    END IF;

    IF old_row.application_status NOT IN ('Submitted', 'In Review', 'Pending Interview') THEN
        RAISE EXCEPTION 'Only an application awaiting a decision can be edited';
    END IF;

    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::JSONB)
    INTO allowed_changes
    FROM jsonb_each(COALESCE(requested_changes, '{}'::JSONB))
    WHERE key = ANY(editable_fields);

    LOOP
        new_application_id := 100000000 + floor(random() * 2000000000)::INT;
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.inboundapplication WHERE application_id = new_application_id
        );
    END LOOP;

    new_row := jsonb_populate_record(old_row, allowed_changes);
    new_row.application_id := new_application_id;
    new_row.original_application_id := COALESCE(old_row.original_application_id, old_row.application_id);
    new_row.status_updated_at := now();

    -- The old row leaves the one-application-per-nomination indexes before its copy enters them.
    PERFORM set_config('app.application_review', 'true', true);
    UPDATE public.inboundapplication
    SET application_status = 'Modified', status_updated_at = now()
    WHERE application_id = old_row.application_id;

    INSERT INTO public.inboundapplication
    SELECT (new_row).*
    RETURNING * INTO new_row;

    -- The student's inbox and the coordinator's history follow the current version.
    UPDATE public.updates
    SET inbound_application_id = new_row.application_id
    WHERE inbound_application_id = old_row.application_id;

    INSERT INTO public.application_status_log(inbound_application_id, old_status, new_status, reason)
    VALUES (
        old_row.application_id,
        old_row.application_status,
        'Modified',
        format('Edited by %s; replaced by application %s',
            CASE WHEN editor_is_coordinator THEN 'a KU coordinator' ELSE 'the student' END,
            new_row.application_id)
    );

    RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.modify_inbound_application(INT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.modify_inbound_application(INT, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
