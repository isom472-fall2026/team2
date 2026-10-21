-- Destructive rebuild for issue #84. Review and back up the database before running.

-- 1. Drop dependent tables before the tables they reference.
DROP TABLE IF EXISTS
    public.studentnominations,
    public.inboundapplication,
    public.outboundapplication,
    public.coordinator,
    public.partneruniversity,
    public.emergency_contact,
    public.incomingstudentauth,
    public.kustudentauth,
    public.exchange_cycle,
    public.country
CASCADE;

-- 2. Create tables.
CREATE TABLE public.country (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL CHECK (length(btrim(name)) > 0),
    city VARCHAR(255) CHECK (city IS NULL OR length(btrim(city)) > 0)
);

CREATE TABLE public.exchange_cycle (
    id INT PRIMARY KEY CHECK (id > 0),
    semester VARCHAR(255) NOT NULL CHECK (semester IN ('Fall', 'Spring')),
    academic_year VARCHAR(9) NOT NULL CHECK (
        academic_year ~ '^[0-9]{4}/[0-9]{4}$'
        AND split_part(academic_year, '/', 2)::INT = split_part(academic_year, '/', 1)::INT + 1
    ),
    nominations_o TIMESTAMP,
    nominations_c TIMESTAMP,
    application_o TIMESTAMP,
    application_c TIMESTAMP,
    cycle_start TIMESTAMPTZ,
    cycle_end TIMESTAMPTZ,
    CHECK (nominations_o IS NULL OR nominations_c IS NULL OR nominations_o <= nominations_c),
    CHECK (application_o IS NULL OR application_c IS NULL OR application_o <= application_c),
    CHECK (cycle_start IS NULL OR cycle_end IS NULL OR cycle_start <= cycle_end)
);

CREATE TABLE public.kustudentauth (
    student_id BIGINT PRIMARY KEY CHECK (student_id > 0),
    student_email VARCHAR(255) UNIQUE NOT NULL CHECK (
        student_email ~* '^[^[:space:]@]+@ku[.]edu[.]kw$'
    ),
    name VARCHAR(255) NOT NULL CHECK (length(btrim(name)) > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id)
);

CREATE TABLE public.incomingstudentauth (
    student_id INT PRIMARY KEY CHECK (student_id > 0),
    student_email VARCHAR(255) UNIQUE NOT NULL CHECK (
        student_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    ),
    name VARCHAR(255) NOT NULL CHECK (length(btrim(name)) > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id UUID UNIQUE REFERENCES auth.users(id)
);

CREATE TABLE public.emergency_contact (
    contact_id INT PRIMARY KEY CHECK (contact_id > 0),
    name VARCHAR(255) NOT NULL CHECK (length(btrim(name)) > 0),
    phone_number VARCHAR(50) NOT NULL CHECK (
        phone_number ~ '^[+0-9() -]+$'
        AND length(regexp_replace(phone_number, '[^0-9]', '', 'g')) BETWEEN 7 AND 15
    ),
    email VARCHAR(255) CHECK (
        email IS NULL OR email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    )
);

CREATE TABLE public.partneruniversity (
    university_id INT PRIMARY KEY CHECK (university_id > 0),
    name VARCHAR(255) NOT NULL CHECK (length(btrim(name)) > 0),
    logo_url VARCHAR(255) CHECK (
        logo_url IS NULL OR logo_url ~* '^https?://[^[:space:]]+$'
    ),
    latitude DECIMAL(9, 6),
    longitude DECIMAL(9, 6),
    available BOOLEAN NOT NULL DEFAULT TRUE,
    location INT REFERENCES public.country(id) ON DELETE SET NULL,
    details TEXT CHECK (
        details IS NULL OR length(btrim(details)) > 0
    )
);

CREATE TABLE public.coordinator (
    coordinator_id INT PRIMARY KEY CHECK (coordinator_id > 0),
    name VARCHAR(255) NOT NULL CHECK (length(btrim(name)) > 0),
    email VARCHAR(255) UNIQUE NOT NULL CHECK (
        email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    ),
    university INT NOT NULL REFERENCES public.partneruniversity(university_id) ON DELETE CASCADE,
    user_id UUID UNIQUE REFERENCES auth.users(id),
    email_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE public.studentnominations (
    id BIGINT PRIMARY KEY CHECK (id > 0),
    coordinator_id INT NOT NULL REFERENCES public.coordinator(coordinator_id) ON DELETE CASCADE,
    student_name VARCHAR(255) NOT NULL CHECK (length(btrim(student_name)) > 0),
    student_email VARCHAR(255) NOT NULL CHECK (
        student_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    ),
    student_nationality VARCHAR(255) NOT NULL CHECK (length(btrim(student_nationality)) > 0),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    semester INT NOT NULL REFERENCES public.exchange_cycle(id) ON DELETE CASCADE,
    nomination_status VARCHAR(20) NOT NULL DEFAULT 'Active'
        CHECK (nomination_status IN ('Active', 'Expired'))
);

CREATE TABLE public.inboundapplication (
    application_id INT PRIMARY KEY CHECK (application_id > 0),
    first_name VARCHAR(255) NOT NULL CHECK (length(btrim(first_name)) > 0),
    last_name VARCHAR(255) NOT NULL CHECK (length(btrim(last_name)) > 0),
    middle_name VARCHAR(255) CHECK (
        middle_name IS NULL OR length(btrim(middle_name)) > 0
    ),
    gender VARCHAR(50) CHECK (gender IS NULL OR gender IN ('Female', 'Male')),
    birthdate DATE,
    profile_photo VARCHAR(255) CHECK (
        profile_photo IS NULL OR length(btrim(profile_photo)) > 0
    ),
    country_of_residence VARCHAR(255) CHECK (
        country_of_residence IS NULL OR length(btrim(country_of_residence)) > 0
    ),
    passport_number VARCHAR(100) CHECK (
        passport_number IS NULL OR length(btrim(passport_number)) > 0
    ),
    passport_expiry_date DATE,
    passport_copy VARCHAR(255) CHECK (
        passport_copy IS NULL OR length(btrim(passport_copy)) > 0
    ),
    max_gpa FLOAT,
    gpa FLOAT,
    expected_graduation_date DATE,
    credits_passed INT CHECK (credits_passed IS NULL OR credits_passed >= 0),
    max_credits INT CHECK (max_credits IS NULL OR max_credits >= 0),
    email VARCHAR(255) NOT NULL CHECK (
        email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    ),
    phone_number VARCHAR(50) CHECK (
        phone_number IS NULL OR (
            phone_number ~ '^[+0-9() -]+$'
            AND length(regexp_replace(phone_number, '[^0-9]', '', 'g')) BETWEEN 7 AND 15
        )
    ),
    is_whatsapp_available BOOLEAN DEFAULT FALSE,
    major VARCHAR(255) CHECK (major IS NULL OR length(btrim(major)) > 0),
    transcript VARCHAR(255) CHECK (transcript IS NULL OR length(btrim(transcript)) > 0),
    language_proficiency VARCHAR(255) CHECK (
        language_proficiency IS NULL OR length(btrim(language_proficiency)) > 0
    ),
    current_year_of_study VARCHAR(50) CHECK (
        current_year_of_study IS NULL OR current_year_of_study IN (
            'Second year', 'Third year', 'Fourth year', 'Fifth year'
        )
    ),
    tos BOOLEAN NOT NULL DEFAULT FALSE,
    university_id INT REFERENCES public.partneruniversity(university_id) ON DELETE SET NULL,
    passport_issuing_country INT REFERENCES public.country(id) ON DELETE SET NULL,
    nationality INT REFERENCES public.country(id) ON DELETE SET NULL,
    semester_applied_for INT NOT NULL REFERENCES public.exchange_cycle(id) ON DELETE RESTRICT,
    student_id INT REFERENCES public.incomingstudentauth(student_id) ON DELETE SET NULL,
    emergency_contact INT REFERENCES public.emergency_contact(contact_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    application_status VARCHAR(20) NOT NULL DEFAULT 'Draft'
        CHECK (application_status IN ('Draft', 'Submitted', 'In Review', 'Rejected', 'Accepted')),
    nomination_id BIGINT REFERENCES public.studentnominations(id),
    CHECK (gpa IS NULL OR (max_gpa IS NOT NULL AND gpa BETWEEN 0 AND max_gpa)),
    CHECK (
        credits_passed IS NULL OR max_credits IS NULL OR credits_passed <= max_credits
    )
);

CREATE TABLE public.outboundapplication (
    application_id BIGINT PRIMARY KEY CHECK (application_id > 0),
    first_name VARCHAR(255) NOT NULL CHECK (length(btrim(first_name)) > 0),
    last_name VARCHAR(255) NOT NULL CHECK (length(btrim(last_name)) > 0),
    middle_name VARCHAR(255) CHECK (
        middle_name IS NULL OR length(btrim(middle_name)) > 0
    ),
    gender VARCHAR(50) CHECK (gender IS NULL OR gender IN ('Female', 'Male')),
    birthdate DATE,
    profile_photo VARCHAR(255) CHECK (
        profile_photo IS NULL OR length(btrim(profile_photo)) > 0
    ),
    passport_number VARCHAR(100) CHECK (
        passport_number IS NULL OR length(btrim(passport_number)) > 0
    ),
    passport_expiry_date DATE,
    civil_id_number BIGINT CHECK (
        civil_id_number IS NULL OR civil_id_number BETWEEN 100000000000 AND 999999999999
    ),
    civil_id_expiry DATE,
    passport_copy VARCHAR(255) CHECK (
        passport_copy IS NULL OR length(btrim(passport_copy)) > 0
    ),
    gpa FLOAT CHECK (gpa IS NULL OR gpa BETWEEN 3 AND 4),
    expected_graduation_semester DATE,
    credits_passed INT CHECK (credits_passed IS NULL OR credits_passed BETWEEN 60 AND 102),
    phone_number VARCHAR(50) CHECK (
        phone_number IS NULL OR (
            phone_number ~ '^[+0-9() -]+$'
            AND length(regexp_replace(phone_number, '[^0-9]', '', 'g')) BETWEEN 7 AND 15
        )
    ),
    is_whatsapp_available BOOLEAN NOT NULL DEFAULT FALSE,
    major VARCHAR(255) CHECK (major IS NULL OR length(btrim(major)) > 0),
    transcript VARCHAR(255) CHECK (transcript IS NULL OR length(btrim(transcript)) > 0),
    english_test_type VARCHAR(20) CHECK (
        english_test_type IS NULL OR english_test_type IN ('IELTS', 'TOEFL iBT', 'None')
    ),
    english_test_meets_requirement BOOLEAN,
    english_106_completed BOOLEAN,
    language_proficiency VARCHAR(255) CHECK (
        language_proficiency IS NULL OR length(btrim(language_proficiency)) > 0
    ),
    current_year_of_study VARCHAR(50) CHECK (
        current_year_of_study IS NULL OR current_year_of_study IN (
            'Second year', 'Third year', 'Fourth year'
        )
    ),
    tos BOOLEAN NOT NULL DEFAULT FALSE,
    university_id INT REFERENCES public.partneruniversity(university_id) ON DELETE SET NULL,
    nationality INT REFERENCES public.country(id) ON DELETE SET NULL,
    passport_issuing_country INT REFERENCES public.country(id) ON DELETE SET NULL,
    semester_applied_for INT REFERENCES public.exchange_cycle(id) ON DELETE SET NULL,
    student_id BIGINT REFERENCES public.kustudentauth(student_id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMPTZ,
    application_status VARCHAR(20) NOT NULL DEFAULT 'Draft'
        CHECK (application_status IN ('Draft', 'Submitted', 'In Review', 'Rejected', 'Accepted'))
);

-- 3. Enable row-level security for every table.
ALTER TABLE public.country ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_cycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kustudentauth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incomingstudentauth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partneruniversity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordinator ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studentnominations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inboundapplication ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outboundapplication ENABLE ROW LEVEL SECURITY;

-- 4. Create helper functions and policies.
CREATE OR REPLACE FUNCTION public.is_ku_coordinator()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.coordinator
        WHERE user_id = auth.uid()
          AND university = 4
          AND email ILIKE '%@ku.edu.kw'
    );
$$;

REVOKE ALL ON FUNCTION public.is_ku_coordinator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ku_coordinator() TO authenticated;

CREATE POLICY "Anyone can read countries"
ON public.country
FOR SELECT
TO anon, authenticated
USING (TRUE);

CREATE POLICY "Users can read exchange cycles"
ON public.exchange_cycle
FOR SELECT
TO authenticated
USING (
    public.is_ku_coordinator()
    OR EXISTS (
        SELECT 1
        FROM public.kustudentauth AS student
        WHERE student.user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1
        FROM public.coordinator AS coordinator
        WHERE coordinator.user_id = auth.uid()
    )
);

CREATE POLICY "KU coordinators can create exchange cycles"
ON public.exchange_cycle
FOR INSERT
TO authenticated
WITH CHECK (public.is_ku_coordinator());

CREATE POLICY "KU coordinators can update exchange cycles"
ON public.exchange_cycle
FOR UPDATE
TO authenticated
USING (public.is_ku_coordinator())
WITH CHECK (public.is_ku_coordinator());

CREATE POLICY "KU coordinators can delete exchange cycles"
ON public.exchange_cycle
FOR DELETE
TO authenticated
USING (public.is_ku_coordinator());

CREATE POLICY "Users can read their KU student profile"
ON public.kustudentauth
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can register their KU student profile"
ON public.kustudentauth
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND student_email ILIKE '%@ku.edu.kw'
);

CREATE POLICY "Users can delete their KU student profile"
ON public.kustudentauth
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can read their incoming student profile"
ON public.incomingstudentauth
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can register their incoming student profile"
ON public.incomingstudentauth
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their incoming student profile"
ON public.incomingstudentauth
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Coordinators can read coordinator profiles"
ON public.coordinator
FOR SELECT
TO authenticated
USING (public.is_ku_coordinator() OR user_id = auth.uid());

CREATE POLICY "Users can register their coordinator profile"
ON public.coordinator
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND lower(email) = lower(auth.jwt() ->> 'email')
);

CREATE POLICY "KU coordinators can update coordinator profiles"
ON public.coordinator
FOR UPDATE
TO authenticated
USING (public.is_ku_coordinator())
WITH CHECK (public.is_ku_coordinator());

CREATE POLICY "Users and KU coordinators can delete coordinator profiles"
ON public.coordinator
FOR DELETE
TO authenticated
USING (public.is_ku_coordinator() OR user_id = auth.uid());

CREATE POLICY "Users can read available partner universities"
ON public.partneruniversity
FOR SELECT
TO authenticated
USING (
    public.is_ku_coordinator()
    OR (
        available IS TRUE
        AND EXISTS (
            SELECT 1
            FROM public.kustudentauth AS student
            WHERE student.user_id = auth.uid()
        )
    )
);

CREATE POLICY "Anyone can read available partner universities"
ON public.partneruniversity
FOR SELECT
TO anon, authenticated
USING (available IS TRUE);

CREATE POLICY "KU coordinators can read emergency contacts"
ON public.emergency_contact
FOR SELECT
TO authenticated
USING (public.is_ku_coordinator());

CREATE POLICY "Coordinators can read student nominations"
ON public.studentnominations
FOR SELECT
TO authenticated
USING (
    public.is_ku_coordinator()
    OR EXISTS (
        SELECT 1
        FROM public.coordinator
        WHERE coordinator_id = studentnominations.coordinator_id
          AND user_id = auth.uid()
    )
);

CREATE POLICY "Coordinators can create student nominations"
ON public.studentnominations
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.coordinator
        WHERE coordinator_id = studentnominations.coordinator_id
          AND user_id = auth.uid()
    )
);

CREATE POLICY "Coordinators can update their student nominations"
ON public.studentnominations
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.coordinator
        WHERE coordinator_id = studentnominations.coordinator_id
          AND user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.coordinator
        WHERE coordinator_id = studentnominations.coordinator_id
          AND user_id = auth.uid()
    )
);

CREATE POLICY "Coordinators can delete their student nominations"
ON public.studentnominations
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.coordinator
        WHERE coordinator_id = studentnominations.coordinator_id
          AND user_id = auth.uid()
    )
);

CREATE POLICY "KU coordinators can read inbound applications"
ON public.inboundapplication
FOR SELECT
TO authenticated
USING (public.is_ku_coordinator());

CREATE POLICY "Users can read their outbound applications"
ON public.outboundapplication
FOR SELECT
TO authenticated
USING (
    public.is_ku_coordinator()
    OR EXISTS (
        SELECT 1
        FROM public.kustudentauth AS student
        WHERE student.user_id = auth.uid()
          AND student.student_id = outboundapplication.student_id
    )
);

CREATE POLICY "KU students can create outbound application drafts"
ON public.outboundapplication
FOR INSERT
TO authenticated
WITH CHECK (
    tos IS FALSE
    AND application_status = 'Draft'
    AND semester_applied_for IS NOT NULL
    AND EXISTS (
        SELECT 1
        FROM public.kustudentauth AS student
        WHERE student.user_id = auth.uid()
          AND student.student_email ILIKE '%@ku.edu.kw'
          AND student.student_id = outboundapplication.student_id
    )
);

CREATE POLICY "KU students can update their outbound applications"
ON public.outboundapplication
FOR UPDATE
TO authenticated
USING (
    tos IS FALSE
    AND application_status = 'Draft'
    AND EXISTS (
        SELECT 1
        FROM public.kustudentauth AS student
        WHERE student.user_id = auth.uid()
          AND student.student_id = outboundapplication.student_id
    )
)
WITH CHECK (
    (
        (application_status = 'Draft' AND tos IS FALSE)
        OR (application_status = 'Submitted' AND tos IS TRUE)
    )
    AND EXISTS (
        SELECT 1
        FROM public.kustudentauth AS student
        WHERE student.user_id = auth.uid()
          AND student.student_id = outboundapplication.student_id
    )
);

CREATE POLICY "KU students can delete their outbound application drafts"
ON public.outboundapplication
FOR DELETE
TO authenticated
USING (
    application_status = 'Draft'
    AND EXISTS (
        SELECT 1
        FROM public.kustudentauth AS student
        WHERE student.user_id = auth.uid()
          AND student.student_id = outboundapplication.student_id
    )
);

-- 5. Create required functions, triggers, and indexes.
CREATE OR REPLACE FUNCTION public.validate_application_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    application_data JSONB := to_jsonb(NEW);
    date_value DATE;
BEGIN
    date_value := NULLIF(application_data ->> 'birthdate', '')::DATE;
    IF date_value IS NOT NULL AND date_value >= CURRENT_DATE THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Birthdate must be in the past';
    END IF;

    date_value := NULLIF(application_data ->> 'passport_expiry_date', '')::DATE;
    IF date_value IS NOT NULL AND date_value < CURRENT_DATE THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Passport must not be expired';
    END IF;

    date_value := NULLIF(application_data ->> 'civil_id_expiry', '')::DATE;
    IF date_value IS NOT NULL AND date_value < CURRENT_DATE THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Civil ID must not be expired';
    END IF;

    date_value := COALESCE(
        NULLIF(application_data ->> 'expected_graduation_date', '')::DATE,
        NULLIF(application_data ->> 'expected_graduation_semester', '')::DATE
    );
    IF date_value IS NOT NULL AND date_value <= CURRENT_DATE THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Expected graduation date must be in the future';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER inboundapplication_validate_dates
BEFORE INSERT OR UPDATE ON public.inboundapplication
FOR EACH ROW
EXECUTE FUNCTION public.validate_application_dates();

CREATE TRIGGER outboundapplication_validate_dates
BEFORE INSERT OR UPDATE ON public.outboundapplication
FOR EACH ROW
EXECUTE FUNCTION public.validate_application_dates();

CREATE UNIQUE INDEX outboundapplication_student_cycle_unique
ON public.outboundapplication (student_id, semester_applied_for);

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Authentication required';
    END IF;

    DELETE FROM public.kustudentauth WHERE user_id = auth.uid();
    DELETE FROM public.incomingstudentauth WHERE user_id = auth.uid();
    DELETE FROM public.coordinator WHERE user_id = auth.uid();
    DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_exchange_cycle_nominations()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_ku_coordinator() THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Only KU coordinators can expire nominations';
    END IF;

    UPDATE public.studentnominations AS nomination
    SET nomination_status = 'Expired'
    FROM public.exchange_cycle AS cycle
    WHERE nomination.semester = cycle.id
      AND cycle.cycle_end <= now()
      AND nomination.nomination_status <> 'Expired';
END;
$$;

REVOKE ALL ON FUNCTION public.expire_exchange_cycle_nominations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_exchange_cycle_nominations() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_maintenance_mode()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN COUNT(*) = 0 THEN FALSE
        WHEN bool_and(maintenance_mode) = bool_or(maintenance_mode)
            THEN bool_or(maintenance_mode)
        ELSE NULL
    END
    FROM public.coordinator;
$$;

REVOKE ALL ON FUNCTION public.get_maintenance_mode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_maintenance_mode() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_maintenance_mode(requested_mode BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    coordinator_count BIGINT;
    mismatched_count BIGINT;
    updated_count BIGINT;
BEGIN
    IF NOT public.is_ku_coordinator() THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Only KU coordinators can change maintenance mode';
    END IF;

    SELECT COUNT(*) INTO coordinator_count FROM public.coordinator;
    IF coordinator_count = 0 THEN
        RAISE EXCEPTION 'Maintenance mode cannot be changed because no coordinator rows exist';
    END IF;

    SELECT COUNT(*)
    INTO mismatched_count
    FROM public.coordinator
    WHERE maintenance_mode IS DISTINCT FROM (NOT requested_mode);
    IF mismatched_count > 0 THEN
        RAISE EXCEPTION 'Maintenance mode cannot be changed because coordinator statuses are inconsistent';
    END IF;

    UPDATE public.coordinator
    SET maintenance_mode = requested_mode
    WHERE maintenance_mode IS DISTINCT FROM requested_mode;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    IF updated_count <> coordinator_count THEN
        RAISE EXCEPTION 'Maintenance mode was not updated for every coordinator';
    END IF;

    RETURN requested_mode;
END;
$$;

REVOKE ALL ON FUNCTION public.set_maintenance_mode(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_maintenance_mode(BOOLEAN) TO authenticated;

-- Storage policies survive the table rebuild, so replace them explicitly.
DROP POLICY IF EXISTS "KU students can upload their outbound application files"
ON storage.objects;
DROP POLICY IF EXISTS "KU students can read their outbound application files"
ON storage.objects;
DROP POLICY IF EXISTS "KU students can delete their outbound application files"
ON storage.objects;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'outbound-application-files',
    'outbound-application-files',
    FALSE,
    10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "KU students can upload their outbound application files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'outbound-application-files'
    AND EXISTS (
        SELECT 1
        FROM public.kustudentauth AS student
        JOIN public.outboundapplication AS application
          ON application.student_id = student.student_id
        WHERE student.user_id = auth.uid()
          AND student.student_id::TEXT = (storage.foldername(storage.objects.name))[1]
          AND application.application_id::TEXT = (storage.foldername(storage.objects.name))[2]
    )
);

CREATE POLICY "KU students can read their outbound application files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'outbound-application-files'
    AND EXISTS (
        SELECT 1
        FROM public.kustudentauth AS student
        JOIN public.outboundapplication AS application
          ON application.student_id = student.student_id
        WHERE student.user_id = auth.uid()
          AND student.student_id::TEXT = (storage.foldername(storage.objects.name))[1]
          AND application.application_id::TEXT = (storage.foldername(storage.objects.name))[2]
    )
);

CREATE POLICY "KU students can delete their outbound application files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'outbound-application-files'
    AND EXISTS (
        SELECT 1
        FROM public.kustudentauth AS student
        JOIN public.outboundapplication AS application
          ON application.student_id = student.student_id
        WHERE student.user_id = auth.uid()
          AND student.student_id::TEXT = (storage.foldername(storage.objects.name))[1]
          AND application.application_id::TEXT = (storage.foldername(storage.objects.name))[2]
    )
);
