-- Issue #181. Apply to the existing database; schema.sql remains the fresh-build definition.

BEGIN;

-- CBA courses are shown as 3 credit hours (#97); a course outside the CBA list may differ.
ALTER TABLE public.inbound_schedule_items
    ADD COLUMN credit_hours SMALLINT NOT NULL DEFAULT 3 CHECK (credit_hours BETWEEN 1 AND 6);

-- Course grades (issue #181).
-- A KU coordinator records one letter grade per scheduled course. Grades sit in their own table
-- rather than on the schedule so that a student can read the schedule before their acceptance
-- letter arrives but cannot read grades until it does. Grade points come from the letter on
-- KU's 4.0 scale, so only the letter is stored.
CREATE TABLE public.inbound_course_grades (
    schedule_item_id INT PRIMARY KEY REFERENCES public.inbound_schedule_items(id) ON DELETE CASCADE,
    application_id INT NOT NULL REFERENCES public.inboundapplication(application_id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES public.incomingstudentauth(student_id) ON DELETE CASCADE,
    letter_grade VARCHAR(2) NOT NULL CHECK (letter_grade IN ('A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F')),
    graded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    graded_by INT REFERENCES public.coordinator(coordinator_id) ON DELETE SET NULL
);

CREATE INDEX inbound_course_grades_application_idx ON public.inbound_course_grades (application_id);
CREATE INDEX inbound_course_grades_student_idx ON public.inbound_course_grades (student_id);

CREATE OR REPLACE FUNCTION public.prepare_inbound_course_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.schedule_item_id IS DISTINCT FROM OLD.schedule_item_id THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A grade cannot be moved to another course';
    END IF;

    -- The application and student come from the scheduled course, so a grade always belongs to
    -- the student who takes that course.
    SELECT item.application_id, item.student_id
    INTO NEW.application_id, NEW.student_id
    FROM public.inbound_schedule_items AS item
    WHERE item.id = NEW.schedule_item_id;

    IF TG_OP = 'INSERT' OR NEW.letter_grade IS DISTINCT FROM OLD.letter_grade THEN
        NEW.graded_at := now();
        NEW.graded_by := (SELECT coordinator_id FROM public.coordinator WHERE user_id = auth.uid());
    ELSE
        NEW.graded_at := OLD.graded_at;
        NEW.graded_by := OLD.graded_by;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_inbound_course_grade() FROM PUBLIC;

CREATE TRIGGER inbound_course_grades_prepare
BEFORE INSERT OR UPDATE ON public.inbound_course_grades
FOR EACH ROW EXECUTE FUNCTION public.prepare_inbound_course_grade();

ALTER TABLE public.inbound_course_grades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inbound_course_grades FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbound_course_grades TO authenticated;

CREATE POLICY "KU coordinators can read grades"
ON public.inbound_course_grades
FOR SELECT
TO authenticated
USING ((SELECT public.is_ku_coordinator()));

-- A student sees grades only once the stamped acceptance letter for that application has been
-- sent to them, and only while the application stays approved, as with the letter itself.
CREATE POLICY "Incoming students can read their own grades"
ON public.inbound_course_grades
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.incomingstudentauth AS student
        JOIN public.inboundapplication AS application ON application.student_id = student.student_id
        JOIN public.acceptance_letters AS letter
          ON letter.application_id = application.application_id
         AND letter.student_id = student.student_id
        WHERE student.student_id = inbound_course_grades.student_id
          AND application.application_id = inbound_course_grades.application_id
          AND application.application_status IN ('Accepted', 'Approved')
          AND letter.stamped_file_path IS NOT NULL
          AND student.user_id = (SELECT auth.uid())
    )
);

-- testing_change_allowed refuses during maintenance and, in testing mode, accepts only test
-- applications; their grades are deleted with their courses when testing ends.
CREATE POLICY "KU coordinators can record grades"
ON public.inbound_course_grades
FOR INSERT
TO authenticated
WITH CHECK (
    (SELECT public.is_ku_coordinator())
    AND public.testing_change_allowed('inboundapplication', application_id::TEXT)
    AND EXISTS (
        SELECT 1 FROM public.inboundapplication AS application
        WHERE application.application_id = inbound_course_grades.application_id
          AND application.application_status IN ('Accepted', 'Approved')
    )
);

CREATE POLICY "KU coordinators can change grades"
ON public.inbound_course_grades
FOR UPDATE
TO authenticated
USING (
    (SELECT public.is_ku_coordinator())
    AND public.testing_change_allowed('inboundapplication', application_id::TEXT)
)
WITH CHECK (
    (SELECT public.is_ku_coordinator())
    AND public.testing_change_allowed('inboundapplication', application_id::TEXT)
    AND EXISTS (
        SELECT 1 FROM public.inboundapplication AS application
        WHERE application.application_id = inbound_course_grades.application_id
          AND application.application_status IN ('Accepted', 'Approved')
    )
);

CREATE POLICY "KU coordinators can remove grades"
ON public.inbound_course_grades
FOR DELETE
TO authenticated
USING (
    (SELECT public.is_ku_coordinator())
    AND public.testing_change_allowed('inboundapplication', application_id::TEXT)
);

CREATE POLICY "Maintenance blocks grade reads"
ON public.inbound_course_grades AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING ((SELECT public.get_maintenance_mode()) IS FALSE);

NOTIFY pgrst, 'reload schema';

COMMIT;
