-- Issue #172. Apply to the existing database; schema.sql remains the fresh-build definition.

BEGIN;

ALTER TABLE public.inboundapplication
    ADD COLUMN cv VARCHAR(255) CHECK (cv IS NULL OR length(btrim(cv)) > 0),
    ADD COLUMN english_evidence_type VARCHAR(20) CHECK (english_evidence_type IS NULL OR english_evidence_type IN ('IELTS', 'TOEFL', 'University letter')),
    ADD COLUMN english_evidence VARCHAR(255) CHECK (english_evidence IS NULL OR length(btrim(english_evidence)) > 0),
    ADD COLUMN criminal_record_certificate VARCHAR(255) CHECK (criminal_record_certificate IS NULL OR length(btrim(criminal_record_certificate)) > 0),
    ADD COLUMN approval_type VARCHAR(13) CHECK (approval_type IN ('Conditional', 'Unconditional')),
    ADD CONSTRAINT inbound_approval_type_status CHECK (approval_type IS NULL OR application_status IN ('Accepted', 'Approved', 'Modified')),
    ADD CONSTRAINT inbound_unconditional_certificate CHECK (approval_type IS DISTINCT FROM 'Unconditional' OR criminal_record_certificate IS NOT NULL);

ALTER TABLE public.outboundapplication
    ADD COLUMN cv VARCHAR(255) CHECK (cv IS NULL OR length(btrim(cv)) > 0);

DROP FUNCTION IF EXISTS public.review_inbound_application(INT, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION public.review_inbound_application(
    requested_application_id INT,
    accept_application BOOLEAN,
    update_details TEXT DEFAULT NULL,
    unconditional_approval BOOLEAN DEFAULT FALSE,
    certificate_stamped BOOLEAN DEFAULT FALSE
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

    IF accept_application IS NULL OR unconditional_approval IS NULL OR certificate_stamped IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose an approval or rejection decision';
    END IF;

    SELECT * INTO application_row
    FROM public.inboundapplication
    WHERE application_id = requested_application_id
      AND (
          application_status IN ('Submitted', 'In Review', 'Pending Interview')
          OR (accept_application AND unconditional_approval
              AND application_status IN ('Accepted', 'Approved')
              AND approval_type IS DISTINCT FROM 'Unconditional')
      )
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This application is not waiting for a decision';
    END IF;

    previous_status := application_row.application_status;
    IF unconditional_approval AND (
        NOT accept_application OR NOT certificate_stamped
        OR application_row.criminal_record_certificate IS NULL
        OR split_part(application_row.criminal_record_certificate, '/', 1) IS DISTINCT FROM application_row.student_id::TEXT
        OR NOT EXISTS (
            SELECT 1 FROM storage.objects
            WHERE bucket_id = 'inbound-application-files' AND name = application_row.criminal_record_certificate
        )
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Verify the uploaded criminal-record certificate has a Kuwaiti embassy stamp before granting unconditional approval';
    END IF;
    next_status := CASE WHEN NOT accept_application THEN 'Rejected'
        WHEN unconditional_approval THEN 'Approved' ELSE 'Accepted' END;
    PERFORM set_config('app.application_review', 'true', true);
    UPDATE public.inboundapplication
    SET application_status = next_status,
        approval_type = CASE WHEN NOT accept_application THEN NULL
            WHEN unconditional_approval THEN 'Unconditional' ELSE 'Conditional' END,
        status_updated_at = now()
    WHERE application_id = requested_application_id
    RETURNING * INTO application_row;

    INSERT INTO public.application_status_log(inbound_application_id, old_status, new_status, reason)
    VALUES (requested_application_id, previous_status, next_status,
        CASE WHEN accept_application THEN application_row.approval_type || ' approval'
            || CASE WHEN unconditional_approval THEN '; Kuwaiti embassy stamp verified by the coordinator' ELSE '' END
        END);

    INSERT INTO public.updates(inbound_application_id, details)
    VALUES (
        requested_application_id,
        COALESCE(NULLIF(btrim(update_details), ''), CASE
            WHEN NOT accept_application THEN public.default_decision_update(FALSE)
            WHEN unconditional_approval THEN 'Your application has received unconditional approval.'
            ELSE 'Your application has received conditional approval. A criminal-record certificate stamped by a Kuwaiti embassy is required for unconditional approval. Contact the Kuwaiti embassy in your country about health-insurance requirements.'
        END)
    );
    RETURN application_row;
END;
$$;

REVOKE ALL ON FUNCTION public.review_inbound_application(INT, BOOLEAN, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.review_inbound_application(INT, BOOLEAN, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

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
        'expected_graduation_date', 'english_evidence_type'
    ];
    old_row public.inboundapplication;
    new_row public.inboundapplication;
    allowed_changes JSONB;
    new_application_id INT;
    file_fields CONSTANT TEXT[] := ARRAY['passport_copy', 'transcript', 'profile_photo',
        'cv', 'english_evidence', 'criminal_record_certificate'];
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
    file_fields CONSTANT TEXT[] := ARRAY['civil_id_copy', 'passport_copy', 'transcript', 'profile_photo', 'cv'];
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

    -- The student's inbox, alternative offers and the coordinator's history follow the
    -- current version.
    UPDATE public.updates
    SET outbound_application_id = new_row.application_id
    WHERE outbound_application_id = old_row.application_id;

    UPDATE public.outbound_offers
    SET application_id = new_row.application_id
    WHERE application_id = old_row.application_id;

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

CREATE OR REPLACE FUNCTION public.validate_application_documents()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    document_fields TEXT[] := ARRAY['cv'];
    application_data JSONB := to_jsonb(NEW);
    field TEXT;
    path TEXT;
    prefix TEXT;
    bucket TEXT;
BEGIN
    IF NEW.application_status <> 'Submitted'
       OR (TG_OP = 'UPDATE' AND OLD.application_status <> 'Draft') THEN
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'inboundapplication' THEN
        document_fields := ARRAY['cv', 'english_evidence'];
        IF NEW.english_evidence_type IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Choose IELTS, TOEFL or a university English-competence letter';
        END IF;
    END IF;
    bucket := CASE WHEN TG_TABLE_NAME = 'inboundapplication'
        THEN 'inbound-application-files' ELSE 'outbound-application-files' END;

    FOREACH field IN ARRAY document_fields LOOP
        path := application_data ->> field;
        IF path IS NULL OR length(btrim(path)) = 0 THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = CASE WHEN field = 'cv' THEN 'Upload a CV before submitting'
                    ELSE 'Upload English proficiency evidence before submitting' END;
        END IF;
        -- Edited copies retain files on their older version; modify_* validates new paths.
        IF NEW.original_application_id IS NULL
           OR current_setting('app.application_review', TRUE) IS DISTINCT FROM 'true' THEN
            prefix := NEW.student_id::TEXT || '/' || NEW.application_id::TEXT || '/' || field || '/';
            IF left(path, length(prefix)) IS DISTINCT FROM prefix OR NOT EXISTS (
                SELECT 1 FROM storage.objects WHERE bucket_id = bucket AND name = path
            ) THEN
                RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Upload each required document for this application';
            END IF;
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_inbound_criminal_record(
    requested_application_id INT,
    requested_certificate_path TEXT
)
RETURNS public.inboundapplication
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    application_row public.inboundapplication;
    prefix TEXT;
BEGIN
    SELECT application.* INTO application_row
    FROM public.inboundapplication AS application
    JOIN public.incomingstudentauth AS student ON student.student_id = application.student_id
    WHERE application.application_id = requested_application_id
      AND student.user_id = auth.uid()
      AND application.application_status IN ('Accepted', 'Approved')
      AND application.approval_type IS DISTINCT FROM 'Unconditional'
    FOR UPDATE OF application;

    IF NOT FOUND OR public.testing_change_allowed('inboundapplication', requested_application_id::TEXT) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the applicant can supply a certificate while approval is conditional';
    END IF;

    prefix := application_row.student_id::TEXT || '/' || requested_application_id::TEXT || '/criminal_record_certificate/';
    IF requested_certificate_path IS NULL
       OR left(requested_certificate_path, length(prefix)) IS DISTINCT FROM prefix
       OR NOT EXISTS (
           SELECT 1 FROM storage.objects
           WHERE bucket_id = 'inbound-application-files' AND name = requested_certificate_path
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Upload the criminal-record certificate for this application first';
    END IF;

    PERFORM set_config('app.application_review', 'true', true);
    UPDATE public.inboundapplication
    SET criminal_record_certificate = requested_certificate_path
    WHERE application_id = requested_application_id
    RETURNING * INTO application_row;
    RETURN application_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_inbound_criminal_record(INT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_inbound_criminal_record(INT, TEXT) TO authenticated;

DROP POLICY IF EXISTS "Testing backups stay private" ON public.testing_backup;

CREATE POLICY "Testing backups stay private"
ON public.testing_backup AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (FALSE)
WITH CHECK (FALSE);

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
          AND (
              application.application_status IN ('Draft', 'Submitted', 'In Review', 'Pending Interview')
              OR (application.application_status IN ('Accepted', 'Approved')
                  AND application.approval_type IS DISTINCT FROM 'Unconditional'
                  AND (storage.foldername(storage.objects.name))[3] = 'criminal_record_certificate')
          )
          AND student.student_id::TEXT = (storage.foldername(storage.objects.name))[1]
          AND application.application_id::TEXT = (storage.foldername(storage.objects.name))[2]
    )
);

DROP POLICY IF EXISTS "Incoming students can delete their inbound application files" ON storage.objects;

CREATE POLICY "Incoming students can delete their inbound application files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'inbound-application-files'
    AND EXISTS (
        SELECT 1
        FROM public.incomingstudentauth AS student
        JOIN public.inboundapplication AS application
          ON application.student_id = student.student_id
        WHERE student.user_id = (SELECT auth.uid())
          AND (
              application.application_status = 'Draft'
              OR (application.application_status IN ('Accepted', 'Approved')
                  AND application.approval_type IS DISTINCT FROM 'Unconditional'
                  AND (storage.foldername(storage.objects.name))[3] = 'criminal_record_certificate'
                  AND NOT EXISTS (
                      SELECT 1 FROM public.inboundapplication AS linked
                      WHERE linked.criminal_record_certificate = storage.objects.name
                  ))
          )
          AND student.student_id::TEXT = (storage.foldername(storage.objects.name))[1]
          AND application.application_id::TEXT = (storage.foldername(storage.objects.name))[2]
    )
);

DROP TRIGGER IF EXISTS inboundapplication_validate_documents ON public.inboundapplication;

CREATE TRIGGER inboundapplication_validate_documents
BEFORE INSERT OR UPDATE ON public.inboundapplication
FOR EACH ROW EXECUTE FUNCTION public.validate_application_documents();

DROP TRIGGER IF EXISTS outboundapplication_validate_documents ON public.outboundapplication;

CREATE TRIGGER outboundapplication_validate_documents
BEFORE INSERT OR UPDATE ON public.outboundapplication
FOR EACH ROW EXECUTE FUNCTION public.validate_application_documents();

NOTIFY pgrst, 'reload schema';

COMMIT;
