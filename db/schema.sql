-- ==========================================
-- 1. Create Independent/Lookup Tables First
-- ==========================================
 
CREATE TABLE Country (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(255)
);

ALTER TABLE public.country ENABLE ROW LEVEL SECURITY;
 
CREATE TABLE exchange_cycle (
    id INT PRIMARY KEY,
    semester VARCHAR(255) NOT NULL,
    academic_year VARCHAR(9) NOT NULL,
    nominations_o TIMESTAMP,     -- Replaced DATETIME with TIMESTAMP
    nominations_c TIMESTAMP,     -- Replaced DATETIME with TIMESTAMP
    application_o TIMESTAMP,     -- Replaced DATETIME with TIMESTAMP
    application_c TIMESTAMP      -- Replaced DATETIME with TIMESTAMP
);

ALTER TABLE public.exchange_cycle ENABLE ROW LEVEL SECURITY;
 
CREATE TABLE KUStudentAuth (
    Student_id BIGINT PRIMARY KEY,
    student_email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.kustudentauth ENABLE ROW LEVEL SECURITY;
 
CREATE TABLE incomingstudentAuth (
    Student_id INT PRIMARY KEY,
    student_email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.incomingstudentauth ENABLE ROW LEVEL SECURITY;
 
CREATE TABLE emergency_contact (
    contact_id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    email VARCHAR(255)
);

ALTER TABLE public.emergency_contact ENABLE ROW LEVEL SECURITY;
 
-- ==========================================
-- 2. Create Dependent Tables (With Foreign Keys)
-- ==========================================
 
CREATE TABLE PartnerUniversity (
    university_id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    logo_url VARCHAR(255),
    latitude DECIMAL(9, 6),
    longitude DECIMAL(9, 6),
    available BOOLEAN DEFAULT TRUE,
    location INT,
    details TEXT,
    FOREIGN KEY (location) REFERENCES Country(id) ON DELETE SET NULL
);

ALTER TABLE public.partneruniversity ENABLE ROW LEVEL SECURITY;
 
CREATE TABLE Coordinator (
    coordinator_id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    university INT,
    FOREIGN KEY (university) REFERENCES PartnerUniversity(university_id) ON DELETE CASCADE
);

ALTER TABLE public.coordinator ENABLE ROW LEVEL SECURITY;

-- NEOMA accepts KU exchange students at its Reims campus.
UPDATE PartnerUniversity
SET latitude = 49.238509,
    longitude = 4.002832
WHERE university_id = 13;
 
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

ALTER TABLE public.inboundapplication ENABLE ROW LEVEL SECURITY;
 
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

ALTER TABLE public.outboundapplication ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.kustudentauth
ADD COLUMN user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.incomingstudentauth
ADD COLUMN user_id uuid REFERENCES auth.users(id);

CREATE TABLE studentnominations (
    id BIGINT PRIMARY KEY,
    coordinator_id INT NOT NULL,
    student_name VARCHAR(255) NOT NULL,
    student_email VARCHAR(255) NOT NULL,
    student_nationality VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    semester INT NOT NULL,
    nomination_status VARCHAR(20) NOT NULL DEFAULT 'Active',
 
    FOREIGN KEY (coordinator_id)
        REFERENCES Coordinator(coordinator_id)
        ON DELETE CASCADE,
 
    FOREIGN KEY (semester)
        REFERENCES exchange_cycle(id)
        ON DELETE CASCADE
);

ALTER TABLE public.studentnominations ENABLE ROW LEVEL SECURITY;

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

ALTER TABLE coordinator
ADD COLUMN maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE;

CREATE POLICY "KU coordinators can review coordinator access"
ON public.coordinator
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coordinator ku_coordinator
    WHERE ku_coordinator.user_id = auth.uid()
      AND ku_coordinator.university = 4
      AND ku_coordinator.email ILIKE '%@ku.edu.kw'
  )
  OR user_id = auth.uid()
);

CREATE POLICY "KU coordinators can approve coordinator access"
ON public.coordinator
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coordinator ku_coordinator
    WHERE ku_coordinator.user_id = auth.uid()
      AND ku_coordinator.university = 4
      AND ku_coordinator.email ILIKE '%@ku.edu.kw'
  )
)
WITH CHECK (email_accepted IN (true, false));

CREATE POLICY "KU coordinators can refuse coordinator access"
ON public.coordinator
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coordinator ku_coordinator
    WHERE ku_coordinator.user_id = auth.uid()
      AND ku_coordinator.university = 4
      AND ku_coordinator.email ILIKE '%@ku.edu.kw'
  )
  OR user_id = auth.uid()
);

ALTER TABLE public.exchange_cycle
  ADD COLUMN cycle_start timestamp with time zone,
  ADD COLUMN cycle_end timestamp with time zone;

CREATE OR REPLACE FUNCTION public.expire_exchange_cycle_nominations()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.studentnominations AS nomination
    SET nomination_status = 'Expired'
    FROM public.exchange_cycle AS cycle
    WHERE nomination.semester = cycle.id
      AND cycle.cycle_end <= now()
      AND nomination.nomination_status <> 'Expired';
$$;

REVOKE ALL ON FUNCTION public.expire_exchange_cycle_nominations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_exchange_cycle_nominations() TO authenticated;

-- This line is for policies CURRENTLY implemented using RLS

alter policy "Enable delete for coordinators"
on "public"."coordinator"
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));

-- be advised that for this policy to allow only pure ku coordinators to sign up must add 'AND ((c.email)::text !~* '^s[0-9]+'::text)
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

-- be advised that for this policy to allow only pure ku coordinators to edit and delete exchange cycles, must add to policy this condition 'AND ((c.email)::text !~* '^s[0-9]+'::text)'
alter policy "edit exchange cycle"
on "public"."exchange_cycle"
to authenticated
using (
(EXISTS ( SELECT 1
   FROM coordinator c
  WHERE ((c.user_id = auth.uid()) AND ((c.email)::text ~~* '%@ku.edu.kw'::text))))
);

alter policy "any ku coordinator updates any coordinator"
on "public"."coordinator"
to authenticated
using (((auth.jwt() ->> 'email'::text) ~~* '%@ku.edu.kw'::text));

CREATE OR REPLACE FUNCTION public.get_maintenance_mode()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN COUNT(*) = 0 THEN FALSE
    WHEN bool_and(coordinator.maintenance_mode) = bool_or(coordinator.maintenance_mode)
      THEN bool_or(coordinator.maintenance_mode)
    ELSE NULL
  END
  FROM public.coordinator AS coordinator;
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.coordinator
    WHERE user_id = auth.uid()
      AND university = 4
      AND email ILIKE '%@ku.edu.kw'
  ) THEN
    RAISE EXCEPTION 'Only KU coordinators can change maintenance mode';
  END IF;

  SELECT COUNT(*)
  INTO coordinator_count
  FROM public.coordinator;

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

alter policy "Enable read access for all ku coordinators"
on "public"."coordinator"
to authenticated
using (((auth.jwt() ->> 'email'::text) ~~* '%@ku.edu.kw'::text));

alter policy "ku coordinator deletes any coordinator"
on "public"."coordinator"
to authenticated
using (((auth.jwt() ->> 'email'::text) ~~* '%@ku.edu.kw'::text));

alter policy "Enable delete for KU coordinators"
on "public"."exchange_cycle"
to authenticated
using (
(EXISTS ( SELECT 1
   FROM coordinator c
  WHERE ((c.user_id = auth.uid()) AND ((c.email)::text ~~* '%@ku.edu.kw'::text))))
);
--

alter policy "Enable read access for coordinators"
on "public"."exchange_cycle"
to authenticated
using (   (EXISTS ( SELECT 1
   FROM coordinator c
  WHERE (c.user_id = auth.uid())))
);

alter policy "Enable insert for KU coordinator users only"
on "public"."exchange_cycle"
to authenticated
with check (  (EXISTS ( SELECT 1
   FROM coordinator c
  WHERE (((c.email)::text ~~* '%@ku.edu.kw'::text) AND (c.user_id = auth.uid()))))
);
 

alter policy "Enable insert for coordinators"
on "public"."studentnominations"
to authenticated
with check (
  coordinator_id = (
    SELECT c.coordinator_id
    FROM public.coordinator c
    WHERE c.user_id = (SELECT auth.uid())
  )
);

alter policy "Enable read access for coordinators"
on "public"."studentnominations"
to authenticated
using (
  coordinator_id = (
    SELECT c.coordinator_id
    FROM public.coordinator c
    WHERE c.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.coordinator c
    WHERE c.user_id = auth.uid()
      AND c.university = 4
      AND c.email ILIKE '%@ku.edu.kw'
  )
);

alter policy "Enable delete for coordinators"
on "public"."studentnominations"
to authenticated
using (
  (coordinator_id = ( SELECT c.coordinator_id
   FROM coordinator c
  WHERE (c.user_id = auth.uid())))
);

alter policy "coordinator edit nomination"
on "public"."studentnominations"
to authenticated
using (
(coordinator_id = ( SELECT c.coordinator_id
   FROM coordinator c
  WHERE (c.user_id = auth.uid())))
);
