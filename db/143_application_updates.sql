-- Issue #143: KU coordinator sends application updates.
-- Run once in the Supabase SQL editor on the existing database. It changes no existing
-- application data; schema.sql already contains the same result for a full rebuild.

BEGIN;

-- 1. Updates keep the moment they were sent with its time zone, so Kuwait sees the right hour.
ALTER TABLE public.updates
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT now();

-- 2. Each update points at its application, so one application can hold many updates.
ALTER TABLE public.updates
    ADD COLUMN IF NOT EXISTS inbound_application_id INT,
    ADD COLUMN IF NOT EXISTS outbound_application_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'updates_inbound_application_id_fkey') THEN
        ALTER TABLE public.updates
            ADD CONSTRAINT updates_inbound_application_id_fkey
            FOREIGN KEY (inbound_application_id)
            REFERENCES public.inboundapplication(application_id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'updates_outbound_application_id_fkey') THEN
        ALTER TABLE public.updates
            ADD CONSTRAINT updates_outbound_application_id_fkey
            FOREIGN KEY (outbound_application_id)
            REFERENCES public.outboundapplication(application_id) ON DELETE CASCADE;
    END IF;
END;
$$;

-- Updates already linked through an application's update_id keep that link.
UPDATE public.updates AS updates
SET inbound_application_id = application.application_id
FROM public.inboundapplication AS application
WHERE application.update_id = updates.id
  AND updates.inbound_application_id IS NULL
  AND updates.outbound_application_id IS NULL;

UPDATE public.updates AS updates
SET outbound_application_id = application.application_id
FROM public.outboundapplication AS application
WHERE application.update_id = updates.id
  AND updates.inbound_application_id IS NULL
  AND updates.outbound_application_id IS NULL;

-- NOT VALID keeps any old update that was never linked to an application, while every new
-- update must name exactly one.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'updates_one_application') THEN
        ALTER TABLE public.updates
            ADD CONSTRAINT updates_one_application
            CHECK (num_nonnulls(inbound_application_id, outbound_application_id) = 1) NOT VALID;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS updates_inbound_application_idx ON public.updates (inbound_application_id, created_at);
CREATE INDEX IF NOT EXISTS updates_outbound_application_idx ON public.updates (outbound_application_id, created_at);

-- 3. Students read the updates on their own applications only.
DROP POLICY IF EXISTS "Students can read updates on their own applications" ON public.updates;
CREATE POLICY "Students can read updates on their own applications"
ON public.updates
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.inboundapplication AS application
        JOIN public.incomingstudentauth AS student ON student.student_id = application.student_id
        WHERE application.application_id = updates.inbound_application_id
          AND student.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1
        FROM public.outboundapplication AS application
        JOIN public.kustudentauth AS student ON student.student_id = application.student_id
        WHERE application.application_id = updates.outbound_application_id
          AND student.user_id = (SELECT auth.uid())
    )
);

-- 4. Accepting or rejecting always leaves an update for the student.
CREATE OR REPLACE FUNCTION public.default_decision_update(accepted BOOLEAN)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE WHEN accepted
        THEN 'Congratulations on being accepted! You will receive an acceptance letter shortly.'
        ELSE 'You currently do not meet one of the general requirements for the student exchange program at KU. We encourage you to apply later.'
    END;
$$;

DROP FUNCTION IF EXISTS public.review_outbound_application(BIGINT, BOOLEAN);

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

    SELECT * INTO application_row
    FROM public.outboundapplication
    WHERE application_id = requested_application_id
      AND application_status IN ('Submitted', 'In Review', 'Pending Interview', 'Modified')
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

DROP FUNCTION IF EXISTS public.review_inbound_application(INT, BOOLEAN);

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

    SELECT * INTO application_row
    FROM public.inboundapplication
    WHERE application_id = requested_application_id
      AND application_status IN ('Submitted', 'In Review', 'Pending Interview', 'Modified')
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

-- PostgREST caches function signatures; this makes the new third argument visible at once.
NOTIFY pgrst, 'reload schema';

COMMIT;
