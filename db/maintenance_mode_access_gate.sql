BEGIN;

ALTER FUNCTION public.set_maintenance_mode(BOOLEAN) SECURITY DEFINER;
ALTER FUNCTION public.set_maintenance_mode(BOOLEAN) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.is_testing_mode_enabled()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF public.get_maintenance_mode() IS DISTINCT FROM FALSE THEN
        RETURN NULL;
    END IF;

    RETURN (SELECT enabled FROM public.testing WHERE id = 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_testing_user()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.get_maintenance_mode() IS FALSE
       AND auth.uid() IS NOT NULL
       AND (
            EXISTS (
                SELECT 1
                FROM public.testing AS testing
                JOIN public.kustudentauth AS student
                  ON student.student_id = testing.kustudentauth_student_id
                WHERE student.user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1
                FROM public.testing AS testing
                JOIN public.incomingstudentauth AS student
                  ON student.student_id = testing.incomingstudentauth_student_id
                WHERE student.user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1
                FROM public.testing AS testing
                JOIN public.coordinator AS coordinator
                  ON coordinator.coordinator_id = testing.coordinator_coordinator_id
                WHERE coordinator.user_id = auth.uid()
            )
        );
$$;

CREATE OR REPLACE FUNCTION public.is_testing_record(
    requested_table TEXT,
    requested_id TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.get_maintenance_mode() IS FALSE
       AND CASE requested_table
        WHEN 'updates' THEN EXISTS (SELECT 1 FROM public.testing WHERE update_id::TEXT = requested_id)
        WHEN 'country' THEN EXISTS (SELECT 1 FROM public.testing WHERE country_id::TEXT = requested_id)
        WHEN 'exchange_cycle' THEN EXISTS (SELECT 1 FROM public.testing WHERE exchange_cycle_id::TEXT = requested_id)
        WHEN 'kustudentauth' THEN EXISTS (SELECT 1 FROM public.testing WHERE kustudentauth_student_id::TEXT = requested_id)
        WHEN 'incomingstudentauth' THEN EXISTS (SELECT 1 FROM public.testing WHERE incomingstudentauth_student_id::TEXT = requested_id)
        WHEN 'emergency_contact' THEN EXISTS (SELECT 1 FROM public.testing WHERE emergency_contact_id::TEXT = requested_id)
        WHEN 'partneruniversity' THEN EXISTS (SELECT 1 FROM public.testing WHERE partneruniversity_university_id::TEXT = requested_id)
        WHEN 'coordinator' THEN EXISTS (SELECT 1 FROM public.testing WHERE coordinator_coordinator_id::TEXT = requested_id)
        WHEN 'studentnominations' THEN EXISTS (SELECT 1 FROM public.testing WHERE studentnominations_id::TEXT = requested_id)
        WHEN 'inboundapplication' THEN EXISTS (SELECT 1 FROM public.testing WHERE inboundapplication_application_id::TEXT = requested_id)
        WHEN 'outboundapplication' THEN EXISTS (SELECT 1 FROM public.testing WHERE outboundapplication_application_id::TEXT = requested_id)
        WHEN 'application_status_log' THEN EXISTS (SELECT 1 FROM public.testing WHERE application_status_log_id::TEXT = requested_id)
        WHEN 'feedback' THEN EXISTS (SELECT 1 FROM public.testing WHERE feedback_id::TEXT = requested_id)
        WHEN 'storage.objects' THEN EXISTS (SELECT 1 FROM public.testing WHERE storage_object_id::TEXT = requested_id)
        ELSE FALSE
    END;
$$;

CREATE OR REPLACE FUNCTION public.has_inbound_application_for_student(requested_student_id INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF public.get_maintenance_mode() IS DISTINCT FROM FALSE
       OR NOT public.is_ku_coordinator() THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.inboundapplication AS application
        WHERE application.student_id = requested_student_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_outbound_application_for_student(requested_student_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF public.get_maintenance_mode() IS DISTINCT FROM FALSE
       OR NOT public.is_ku_coordinator() THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.outboundapplication AS application
        WHERE application.student_id = requested_student_id
          AND application.application_status <> 'Draft'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_feedback_author(
    inbound_application_id INT,
    outbound_application_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.get_maintenance_mode() IS FALSE AND ((
        inbound_application_id IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public.inboundapplication AS application
            JOIN public.incomingstudentauth AS student
              ON student.student_id = application.student_id
            WHERE application.application_id = inbound_application_id
              AND student.user_id = auth.uid()
        )
    ) OR (
        outbound_application_id IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public.outboundapplication AS application
            JOIN public.kustudentauth AS student
              ON student.student_id = application.student_id
            WHERE application.application_id = outbound_application_id
              AND student.user_id = auth.uid()
        )
    ));
$$;

CREATE OR REPLACE FUNCTION public.get_testing_storage_objects()
RETURNS TABLE(bucket_id TEXT, object_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_ku_coordinator() THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Only KU coordinators can list testing files for cleanup';
    END IF;

    IF public.get_maintenance_mode() IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'Testing files cannot be listed during maintenance';
    END IF;

    RETURN QUERY
    SELECT objects.bucket_id, objects.name
    FROM storage.objects AS objects
    JOIN public.testing AS testing
      ON testing.storage_object_id = objects.id
    WHERE testing.id <> 1
    ORDER BY objects.bucket_id, objects.name;
END;
$$;

DROP POLICY IF EXISTS "Maintenance blocks country reads" ON public.country;
CREATE POLICY "Maintenance blocks country reads"
ON public.country AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

DROP POLICY IF EXISTS "Maintenance blocks exchange cycle reads" ON public.exchange_cycle;
CREATE POLICY "Maintenance blocks exchange cycle reads"
ON public.exchange_cycle AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

DROP POLICY IF EXISTS "Maintenance blocks KU student reads" ON public.kustudentauth;
CREATE POLICY "Maintenance blocks KU student reads"
ON public.kustudentauth AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

DROP POLICY IF EXISTS "Maintenance blocks incoming student reads" ON public.incomingstudentauth;
CREATE POLICY "Maintenance blocks incoming student reads"
ON public.incomingstudentauth AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

DROP POLICY IF EXISTS "Maintenance blocks emergency contact reads" ON public.emergency_contact;
CREATE POLICY "Maintenance blocks emergency contact reads"
ON public.emergency_contact AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

DROP POLICY IF EXISTS "Maintenance blocks partner university reads" ON public.partneruniversity;
CREATE POLICY "Maintenance blocks partner university reads"
ON public.partneruniversity AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

DROP POLICY IF EXISTS "Maintenance limits coordinator profile reads" ON public.coordinator;
CREATE POLICY "Maintenance limits coordinator profile reads"
ON public.coordinator AS RESTRICTIVE FOR SELECT TO authenticated
USING (
    public.get_maintenance_mode() IS FALSE
    OR (
        public.get_maintenance_mode() IS TRUE
        AND user_id = auth.uid()
        AND public.is_ku_coordinator()
    )
);

DROP POLICY IF EXISTS "Maintenance blocks nomination reads" ON public.studentnominations;
CREATE POLICY "Maintenance blocks nomination reads"
ON public.studentnominations AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

DROP POLICY IF EXISTS "Maintenance blocks inbound application reads" ON public.inboundapplication;
CREATE POLICY "Maintenance blocks inbound application reads"
ON public.inboundapplication AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

DROP POLICY IF EXISTS "Maintenance blocks outbound application reads" ON public.outboundapplication;
CREATE POLICY "Maintenance blocks outbound application reads"
ON public.outboundapplication AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

DROP POLICY IF EXISTS "Maintenance blocks status log reads" ON public.application_status_log;
CREATE POLICY "Maintenance blocks status log reads"
ON public.application_status_log AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

DROP POLICY IF EXISTS "Maintenance blocks update reads" ON public.updates;
CREATE POLICY "Maintenance blocks update reads"
ON public.updates AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

DROP POLICY IF EXISTS "Maintenance blocks feedback reads" ON public.feedback;
CREATE POLICY "Maintenance blocks feedback reads"
ON public.feedback AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

DROP POLICY IF EXISTS "Maintenance blocks testing data reads" ON public.testing;
CREATE POLICY "Maintenance blocks testing data reads"
ON public.testing AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

DROP POLICY IF EXISTS "Maintenance blocks storage object reads" ON storage.objects;
CREATE POLICY "Maintenance blocks storage object reads"
ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.get_maintenance_mode() IS FALSE);

COMMIT;
