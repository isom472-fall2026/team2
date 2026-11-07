-- Issue #144: KU coordinators and students edit inbound and outbound applications before a
-- decision.
-- Run once in the Supabase SQL editor, after db/143_application_updates.sql. It changes no
-- existing application; schema.sql already contains the same result for a full rebuild.

BEGIN;

-- 1. Every edited copy points at the first version of its application.
ALTER TABLE public.inboundapplication
    ADD COLUMN IF NOT EXISTS original_application_id INT;
ALTER TABLE public.outboundapplication
    ADD COLUMN IF NOT EXISTS original_application_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inboundapplication_original_application_id_fkey') THEN
        ALTER TABLE public.inboundapplication
            ADD CONSTRAINT inboundapplication_original_application_id_fkey
            FOREIGN KEY (original_application_id)
            REFERENCES public.inboundapplication(application_id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outboundapplication_original_application_id_fkey') THEN
        ALTER TABLE public.outboundapplication
            ADD CONSTRAINT outboundapplication_original_application_id_fkey
            FOREIGN KEY (original_application_id)
            REFERENCES public.outboundapplication(application_id) ON DELETE SET NULL;
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

DROP INDEX IF EXISTS public.outboundapplication_student_cycle_unique;
CREATE UNIQUE INDEX outboundapplication_student_cycle_unique
ON public.outboundapplication (student_id, semester_applied_for)
WHERE application_status NOT IN ('Rejected', 'Modified');

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
    -- The nomination, the semester and the owner stay with the application. Documents can be
    -- replaced but are checked separately below.
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
    file_fields CONSTANT TEXT[] := ARRAY['passport_copy', 'transcript', 'profile_photo'];
    file_field TEXT;
    file_path TEXT;
    file_prefix TEXT;
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

    -- A new document must already be uploaded into this version's own folder; otherwise any
    -- path, including another student's file, could be attached to the application.
    FOREACH file_field IN ARRAY file_fields LOOP
        file_path := requested_changes ->> file_field;
        CONTINUE WHEN file_path IS NULL OR file_path IS NOT DISTINCT FROM (to_jsonb(old_row) ->> file_field);
        file_prefix := old_row.student_id::TEXT || '/' || old_row.application_id::TEXT || '/' || file_field || '/';
        IF left(file_path, length(file_prefix)) <> file_prefix
           OR NOT EXISTS (
                SELECT 1 FROM storage.objects
                WHERE bucket_id = 'inbound-application-files' AND name = file_path
            ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '22023',
                MESSAGE = format('The new %s was not uploaded for this application', replace(file_field, '_', ' '));
        END IF;
        allowed_changes := allowed_changes || jsonb_build_object(file_field, file_path);
    END LOOP;

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

-- The outbound twin of modify_inbound_application(); see the reasons there.
CREATE OR REPLACE FUNCTION public.modify_outbound_application(
    requested_application_id BIGINT,
    requested_changes JSONB
)
RETURNS public.outboundapplication
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Only the owner stays with the application. Documents, the semester and the preferred
    -- university are checked separately below.
    editable_fields CONSTANT TEXT[] := ARRAY[
        'first_name', 'middle_name', 'last_name', 'gender', 'birthdate',
        'nationality', 'passport_issuing_country', 'passport_number', 'passport_expiry_date',
        'civil_id_number', 'civil_id_expiry', 'phone_number', 'is_whatsapp_available',
        'major', 'current_year_of_study', 'gpa', 'credits_passed', 'expected_graduation_semester',
        'university_id', 'semester_applied_for'
    ];
    old_row public.outboundapplication;
    new_row public.outboundapplication;
    allowed_changes JSONB;
    new_application_id BIGINT;
    file_fields CONSTANT TEXT[] := ARRAY['civil_id_copy', 'passport_copy', 'transcript', 'profile_photo'];
    file_field TEXT;
    file_path TEXT;
    file_prefix TEXT;
    editor_is_coordinator BOOLEAN := public.is_ku_coordinator();
BEGIN
    IF public.get_maintenance_mode() IS DISTINCT FROM FALSE
       OR (
            public.is_testing_mode_enabled() IS TRUE
            AND NOT public.is_testing_record('outboundapplication', requested_application_id::TEXT)
        ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'This application cannot be changed in the current mode';
    END IF;

    SELECT * INTO old_row
    FROM public.outboundapplication
    WHERE application_id = requested_application_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application not found';
    END IF;

    IF NOT editor_is_coordinator AND NOT EXISTS (
        SELECT 1
        FROM public.kustudentauth AS student
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

    -- A new document must already be uploaded into this version's own folder; otherwise any
    -- path, including another student's file, could be attached to the application.
    FOREACH file_field IN ARRAY file_fields LOOP
        file_path := requested_changes ->> file_field;
        CONTINUE WHEN file_path IS NULL OR file_path IS NOT DISTINCT FROM (to_jsonb(old_row) ->> file_field);
        file_prefix := old_row.student_id::TEXT || '/' || old_row.application_id::TEXT || '/' || file_field || '/';
        IF left(file_path, length(file_prefix)) <> file_prefix
           OR NOT EXISTS (
                SELECT 1 FROM storage.objects
                WHERE bucket_id = 'outbound-application-files' AND name = file_path
            ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '22023',
                MESSAGE = format('The new %s was not uploaded for this application', replace(file_field, '_', ' '));
        END IF;
        allowed_changes := allowed_changes || jsonb_build_object(file_field, file_path);
    END LOOP;

    -- Same shape as the ids the student portal creates: milliseconds followed by three digits.
    LOOP
        new_application_id := floor(extract(epoch FROM clock_timestamp()) * 1000)::BIGINT * 1000
            + 100 + floor(random() * 900)::BIGINT;
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.outboundapplication WHERE application_id = new_application_id
        );
    END LOOP;

    new_row := jsonb_populate_record(old_row, allowed_changes);

    -- The same rules a new application meets: a semester still taking applications and a
    -- partner university that is available. Keeping the current choice is always allowed.
    IF new_row.semester_applied_for IS DISTINCT FROM old_row.semester_applied_for
       AND NOT EXISTS (
            SELECT 1 FROM public.exchange_cycle AS cycle
            WHERE cycle.id = new_row.semester_applied_for
              AND cycle.application_c >= now()
        ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Choose a KU semester that is still accepting applications';
    END IF;
    IF new_row.university_id IS DISTINCT FROM old_row.university_id
       AND NOT EXISTS (
            SELECT 1 FROM public.partneruniversity AS university
            WHERE university.university_id = new_row.university_id
              AND university.available IS TRUE
        ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Choose an available partner university';
    END IF;
    new_row.application_id := new_application_id;
    new_row.original_application_id := COALESCE(old_row.original_application_id, old_row.application_id);
    new_row.status_updated_at := now();

    -- The old row leaves the one-application-per-nomination indexes before its copy enters them.
    PERFORM set_config('app.application_review', 'true', true);
    UPDATE public.outboundapplication
    SET application_status = 'Modified', status_updated_at = now()
    WHERE application_id = old_row.application_id;

    INSERT INTO public.outboundapplication
    SELECT (new_row).*
    RETURNING * INTO new_row;

    -- The student's inbox and the coordinator's history follow the current version.
    UPDATE public.updates
    SET outbound_application_id = new_row.application_id
    WHERE outbound_application_id = old_row.application_id;

    INSERT INTO public.application_status_log(application_id, old_status, new_status, reason)
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

REVOKE ALL ON FUNCTION public.modify_outbound_application(BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.modify_outbound_application(BIGINT, JSONB) TO authenticated;

-- 5. Documents can be replaced while an application is pending, by its student or a KU
-- coordinator; the files go into the edited version's folder.
DROP POLICY IF EXISTS "Incoming students can upload inbound application files" ON storage.objects;
CREATE POLICY "Incoming students can upload inbound application files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'inbound-application-files'
    AND EXISTS (
        SELECT 1
        FROM public.incomingstudentauth AS student
        JOIN public.inboundapplication AS application
          ON application.student_id = student.student_id
        WHERE student.user_id = (SELECT auth.uid())
          -- A pending application takes new files only through an edit, which saves them on
          -- an edited copy; the submitted version keeps the files it was sent with.
          AND application.application_status IN ('Draft', 'Submitted', 'In Review', 'Pending Interview')
          AND student.student_id::TEXT = (storage.foldername(storage.objects.name))[1]
          AND application.application_id::TEXT = (storage.foldername(storage.objects.name))[2]
    )
);

DROP POLICY IF EXISTS "KU coordinators can upload inbound application files" ON storage.objects;
DROP POLICY IF EXISTS "KU coordinators can upload outbound application files" ON storage.objects;
-- A KU coordinator editing a pending application may replace its documents.
CREATE POLICY "KU coordinators can upload inbound application files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'inbound-application-files'
    AND (SELECT public.is_ku_coordinator())
    AND EXISTS (
        SELECT 1
        FROM public.inboundapplication AS application
        WHERE application.application_status IN ('Submitted', 'In Review', 'Pending Interview')
          AND application.student_id::TEXT = (storage.foldername(storage.objects.name))[1]
          AND application.application_id::TEXT = (storage.foldername(storage.objects.name))[2]
    )
);

CREATE POLICY "KU coordinators can upload outbound application files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'outbound-application-files'
    AND (SELECT public.is_ku_coordinator())
    AND EXISTS (
        SELECT 1
        FROM public.outboundapplication AS application
        WHERE application.application_status IN ('Submitted', 'In Review', 'Pending Interview')
          AND application.student_id::TEXT = (storage.foldername(storage.objects.name))[1]
          AND application.application_id::TEXT = (storage.foldername(storage.objects.name))[2]
    )
);

NOTIFY pgrst, 'reload schema';

COMMIT;
