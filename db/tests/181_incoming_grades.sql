-- Disposable database integration checks for issue #181; fixtures and grants are rolled back.
-- Run only on a throwaway database built from schema.sql. It inserts Kuwait University as
-- university 4, so on the live project it stops at that insert and changes nothing.
-- The migration to apply is db/migrations/181_incoming_grades.sql.
BEGIN;

CREATE FUNCTION pg_temp.expect_error(statement TEXT, expected_state TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE caught TEXT;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS caught = RETURNED_SQLSTATE;
    END;
    IF caught IS DISTINCT FROM expected_state THEN
        RAISE EXCEPTION 'Expected SQLSTATE %, got % for %', expected_state, caught, statement;
    END IF;
END;
$$;

INSERT INTO auth.users(id, email) VALUES
('00000000-0000-0000-0000-000000000001', 'incoming@example.invalid'),
('00000000-0000-0000-0000-000000000002', 'demo-coordinator@ku.edu.kw'),
('00000000-0000-0000-0000-000000000003', 'partner@example.invalid'),
('00000000-0000-0000-0000-000000000004', 'other@example.invalid');
INSERT INTO public.country(id, name) VALUES (900001, 'Invented test country');
INSERT INTO public.partneruniversity(university_id, name, location) VALUES
(4, 'Demo KU', 900001), (900010, 'Demo partner', 900001);
INSERT INTO public.coordinator(coordinator_id, name, email, university, user_id, email_accepted) VALUES
(900001, 'Demo KU coordinator', 'demo-coordinator@ku.edu.kw', 4, '00000000-0000-0000-0000-000000000002', TRUE),
(900002, 'Demo partner coordinator', 'partner@example.invalid', 900010, '00000000-0000-0000-0000-000000000003', TRUE);
INSERT INTO public.incomingstudentauth(student_id, student_email, name, user_id) VALUES
(900001, 'incoming@example.invalid', 'Demo incoming student', '00000000-0000-0000-0000-000000000001'),
(900002, 'other@example.invalid', 'Demo other student', '00000000-0000-0000-0000-000000000004');
INSERT INTO public.exchange_cycle(id, semester, academic_year, nominations_o, nominations_c, application_o, application_c, cycle_start, cycle_end)
VALUES (900001, 'Spring', '2027/2028', now()-interval '1 day', now()+interval '30 days', now()-interval '1 day', now()+interval '30 days', now()+interval '60 days', now()+interval '200 days');
INSERT INTO public.studentnominations(id, coordinator_id, student_name, student_email, semester) VALUES
(900001, 900002, 'Demo incoming student', 'incoming@example.invalid', 900001),
(900002, 900002, 'Demo other student', 'other@example.invalid', 900001);
SELECT set_config('app.application_review', 'true', true);
INSERT INTO public.inboundapplication(application_id, student_id, nomination_id, semester_applied_for, email, first_name, last_name, application_status, approval_type) VALUES
(900001, 900001, 900001, 900001, 'incoming@example.invalid', 'Demo', 'Incoming', 'Accepted', 'Conditional'),
(900002, 900002, 900002, 900001, 'other@example.invalid', 'Demo', 'Other', 'Draft', NULL);
INSERT INTO public.inbound_schedule_items(id, application_id, course_display_code, course_name, meeting_days, start_time, end_time, room, instructor, credit_hours) VALUES
(900001, 900001, 'EXT 100', 'Invented course one', ARRAY['Sunday'], '08:00', '09:15', 'Demo room 1', 'Demo instructor', 3),
(900002, 900001, 'EXT 200', 'Invented course two', ARRAY['Monday'], '10:00', '11:15', 'Demo room 2', 'Demo instructor', 2),
(900003, 900002, 'EXT 300', 'Course on a draft application', ARRAY['Tuesday'], '10:00', '11:15', 'Demo room 3', 'Demo instructor', 3);
-- The letter is issued but not yet stamped, so the student has not received it.
INSERT INTO public.acceptance_letters(application_id, student_id, letter_type, file_path, issued_by, issued_by_name, issued_by_email)
VALUES (900001, 900001, 'Conditional', '900001/900001/conditional/issued.pdf', 900001, 'Demo KU coordinator', 'demo-coordinator@ku.edu.kw');

SET LOCAL ROLE authenticated;

-- A KU coordinator records grades; the application, student and coordinator come from the
-- course and the signed-in user, whatever the request says.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"email":"demo-coordinator@ku.edu.kw"}';
INSERT INTO public.inbound_course_grades(schedule_item_id, application_id, student_id, letter_grade, graded_by)
VALUES (900001, 900002, 900002, 'A', 900002);
INSERT INTO public.inbound_course_grades(schedule_item_id, letter_grade) VALUES (900002, 'B+');
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.inbound_course_grades
        WHERE schedule_item_id = 900001 AND application_id = 900001 AND student_id = 900001
          AND letter_grade = 'A' AND graded_by = 900001
    ) THEN
        RAISE EXCEPTION 'The grade was not tied to the course''s student and the grading coordinator';
    END IF;
END $$;
SELECT pg_temp.expect_error('INSERT INTO public.inbound_course_grades(schedule_item_id, letter_grade) VALUES (900002, ''E'')', '23514');
SELECT pg_temp.expect_error('UPDATE public.inbound_course_grades SET letter_grade = ''A+'' WHERE schedule_item_id = 900002', '23514');
SELECT pg_temp.expect_error('INSERT INTO public.inbound_course_grades(schedule_item_id, letter_grade) VALUES (900003, ''A'')', '42501');
SELECT pg_temp.expect_error('UPDATE public.inbound_course_grades SET schedule_item_id = 900003 WHERE schedule_item_id = 900002', '22023');
UPDATE public.inbound_course_grades SET letter_grade = 'B' WHERE schedule_item_id = 900002;

-- Partner coordinators neither read nor write grades.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claims = '{"email":"partner@example.invalid"}';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.inbound_course_grades) THEN
        RAISE EXCEPTION 'A partner coordinator could read grades';
    END IF;
END $$;

-- Before the stamped letter is sent, the student sees the schedule but no grades.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"email":"incoming@example.invalid"}';
DO $$ BEGIN
    IF (SELECT count(*) FROM public.inbound_schedule_items) <> 2 THEN
        RAISE EXCEPTION 'The student cannot read their schedule';
    END IF;
    IF EXISTS (SELECT 1 FROM public.inbound_course_grades) THEN
        RAISE EXCEPTION 'Grades were readable before the stamped acceptance letter was sent';
    END IF;
END $$;

RESET ROLE;
UPDATE public.acceptance_letters
SET stamped_file_path = '900001/900001/conditional/stamped.pdf', stamped_at = now(),
    stamped_by = 900001, stamped_by_name = 'Demo KU coordinator', stamped_by_email = 'demo-coordinator@ku.edu.kw'
WHERE application_id = 900001;
SET LOCAL ROLE authenticated;

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"email":"incoming@example.invalid"}';
DO $$ BEGIN
    IF (SELECT count(*) FROM public.inbound_course_grades) <> 2
       OR NOT EXISTS (SELECT 1 FROM public.inbound_course_grades WHERE schedule_item_id = 900002 AND letter_grade = 'B') THEN
        RAISE EXCEPTION 'The student cannot read their grades after the stamped letter was sent';
    END IF;
END $$;
SELECT pg_temp.expect_error('INSERT INTO public.inbound_course_grades(schedule_item_id, letter_grade) VALUES (900003, ''A'')', '42501');
UPDATE public.inbound_course_grades SET letter_grade = 'A';
DELETE FROM public.inbound_course_grades;

-- Another student sees none of it.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
SET LOCAL request.jwt.claims = '{"email":"other@example.invalid"}';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.inbound_course_grades) THEN
        RAISE EXCEPTION 'Another student could read the grades';
    END IF;
END $$;

-- The student's update and delete changed nothing; removing a course removes its grade.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"email":"demo-coordinator@ku.edu.kw"}';
DO $$ BEGIN
    IF (SELECT count(*) FROM public.inbound_course_grades) <> 2
       OR EXISTS (SELECT 1 FROM public.inbound_course_grades WHERE schedule_item_id = 900002 AND letter_grade <> 'B') THEN
        RAISE EXCEPTION 'The student changed their grades';
    END IF;
END $$;
DELETE FROM public.inbound_schedule_items WHERE id = 900002;
DELETE FROM public.inbound_course_grades WHERE schedule_item_id = 900001;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.inbound_course_grades) THEN
        RAISE EXCEPTION 'A removed course kept its grade, or the coordinator could not remove a grade';
    END IF;
END $$;

ROLLBACK;
