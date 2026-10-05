-- ==========================================
-- 1. Create Independent/Lookup Tables First
-- ==========================================
 
CREATE TABLE Country (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(255)
);
 
CREATE TABLE exchange_cycle (
    id INT PRIMARY KEY,
    semester VARCHAR(255) NOT NULL,
    academic_year INT NOT NULL, -- Replaced MySQL YEAR with INT
    nominations_o TIMESTAMP,     -- Replaced DATETIME with TIMESTAMP
    nominations_c TIMESTAMP,     -- Replaced DATETIME with TIMESTAMP
    application_o TIMESTAMP,     -- Replaced DATETIME with TIMESTAMP
    application_c TIMESTAMP      -- Replaced DATETIME with TIMESTAMP
);
 
CREATE TABLE KUStudentAuth (
    Student_id BIGINT PRIMARY KEY,
    student_email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
 
CREATE TABLE incomingstudentAuth (
    Student_id INT PRIMARY KEY,
    student_email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
 
CREATE TABLE emergency_contact (
    contact_id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    email VARCHAR(255)
);
 
-- ==========================================
-- 2. Create Dependent Tables (With Foreign Keys)
-- ==========================================
 
CREATE TABLE PartnerUniversity (
    university_id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    logo_url VARCHAR(255),
    available BOOLEAN DEFAULT TRUE,
    location INT,
    details TEXT,
    FOREIGN KEY (location) REFERENCES Country(id) ON DELETE SET NULL
);
 
CREATE TABLE Coordinator (
    coordinator_id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    university INT,
    FOREIGN KEY (university) REFERENCES PartnerUniversity(university_id) ON DELETE CASCADE
);
 
CREATE TABLE InboundApplication (
    application_id INT PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    middle_name VARCHAR(255),
    gender VARCHAR(50),
    birthdate DATE,
    profile_photo VARCHAR(255), -- Storing the file path/URL
    country_of_residence VARCHAR(255),
    passport_number VARCHAR(100),
    passport_expiry_date DATE,
    passport_copy VARCHAR(255), -- Storing the file path/URL
    max_GPA FLOAT,
    GPA FLOAT,
    expected_graduation_date DATE,
    credits_passed INT,
    max_credits INT,
    email VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    is_whatsapp_available BOOLEAN DEFAULT FALSE,
    major VARCHAR(255),
    transcript VARCHAR(255),   -- Storing the file path/URL
    language_proficiency VARCHAR(255),
    current_year_of_study VARCHAR(50),
    TOS BOOLEAN DEFAULT FALSE,
    university_id INT,
    passport_issuing_country INT,
    nationality INT,
    semester_applied_for INT,
    student_id INT,
    emergency_contact INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (university_id) REFERENCES PartnerUniversity(university_id) ON DELETE SET NULL,
    FOREIGN KEY (passport_issuing_country) REFERENCES Country(id) ON DELETE SET NULL,
    FOREIGN KEY (nationality) REFERENCES Country(id) ON DELETE SET NULL,
    FOREIGN KEY (semester_applied_for) REFERENCES exchange_cycle(id) ON DELETE SET NULL,
    FOREIGN KEY (student_id) REFERENCES incomingstudentAuth(Student_id) ON DELETE CASCADE,
    FOREIGN KEY (emergency_contact) REFERENCES emergency_contact(contact_id) ON DELETE SET NULL
);
 
CREATE TABLE OutboundApplication (
    application_id INT PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    middle_name VARCHAR(255),
    gender VARCHAR(50),
    birthdate DATE,
    profile_photo VARCHAR(255), -- Storing the file path/URL
    passport_number VARCHAR(100),
    passport_expiry_date DATE,
    Civil_id_number BIGINT,     -- Use BIGINT to handle Kuwaiti Civil ID length safely
    Civil_id_expiry DATE,
    passport_copy VARCHAR(255), -- Storing the file path/URL
    GPA FLOAT,
    expected_graduation_semester DATE,
    credits_passed INT,
    phone_number VARCHAR(50),
    is_whatsapp_available BOOLEAN DEFAULT FALSE,
    major VARCHAR(255),
    transcript VARCHAR(255),   -- Storing the file path/URL
    current_year_of_study VARCHAR(50),
    TOS BOOLEAN DEFAULT FALSE,
    university_id INT,
    nationality INT,
    passport_issuing_country INT,
    semester_applied_for INT,
    student_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (university_id) REFERENCES PartnerUniversity(university_id) ON DELETE SET NULL,
    FOREIGN KEY (nationality) REFERENCES Country(id) ON DELETE SET NULL,
    FOREIGN KEY (passport_issuing_country) REFERENCES Country(id) ON DELETE SET NULL,
    FOREIGN KEY (semester_applied_for) REFERENCES exchange_cycle(id) ON DELETE SET NULL,
    FOREIGN KEY (student_id) REFERENCES KUStudentAuth(Student_id) ON DELETE CASCADE
);

ALTER TABLE public.kustudentauth
ADD COLUMN user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.incomingstudentauth
ADD COLUMN user_id uuid REFERENCES auth.users(id);

CREATE TABLE studentnominations (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    coordinator_id INT NOT NULL,
    student_name VARCHAR(255) NOT NULL,
    student_email VARCHAR(255) NOT NULL,
    student_nationality VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    semester INT NOT NULL,
 
    FOREIGN KEY (coordinator_id)
        REFERENCES Coordinator(coordinator_id)
        ON DELETE CASCADE,
 
    FOREIGN KEY (semester)
        REFERENCES exchange_cycle(id)
        ON DELETE CASCADE
);

ALTER TABLE public.coordinator
ADD COLUMN user_id uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
 
    DELETE FROM public.kustudentauth
    WHERE user_id = auth.uid();
 
    DELETE FROM public.incomingstudentauth
    WHERE user_id = auth.uid();
 
    DELETE FROM public.coordinator
    WHERE user_id = auth.uid();
 
    DELETE FROM auth.users
    WHERE id = auth.uid();
END;
$$;
 
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- Outgoing applications
ALTER TABLE outboundapplication
ADD COLUMN application_status VARCHAR(20) DEFAULT 'Draft';
 
-- Inbound applications
ALTER TABLE inboundapplication
ADD COLUMN application_status VARCHAR(20) DEFAULT 'Draft';
 
ALTER TABLE inboundapplication
ADD COLUMN nomination_id BIGINT;
 
ALTER TABLE inboundapplication
ADD CONSTRAINT fk_inboundapplication_nomination
FOREIGN KEY (nomination_id)
REFERENCES studentnominations(id);

ALTER TABLE coordinator
ADD COLUMN email_accepted BOOLEAN DEFAULT FALSE;

ALTER TABLE public.exchange_cycle
  ADD COLUMN cycle_start timestamp with time zone,
  ADD COLUMN cycle_end timestamp with time zone;

-- This line is for policies CURRENTLY implemented using RLS

alter policy "Enable delete for coordinators"
on "public"."coordinator"
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));

alter policy "signup"
on "public"."coordinator"
to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));

alter policy "anyone can read"
on "public"."country"
to anon, authenticated
using (true);

alter policy "Enable delete for incoming students"
on "public"."incomingstudentauth"
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));

alter policy "Signup"
on "public"."incomingstudentauth"
to authenticated
with check ((auth.uid() = user_id));

alter policy "Enable delete for Ku students"
on "public"."kustudentauth"
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));
 
alter policy "Signup"
on "public"."kustudentauth"
to authenticated
with check ((auth.uid() = user_id)); 
