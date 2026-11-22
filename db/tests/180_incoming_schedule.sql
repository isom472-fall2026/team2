-- Disposable database integration checks for issue #180; fixtures and grants are rolled back.
-- Run only on a throwaway database built from schema.sql. It inserts Kuwait University as
-- university 4, so on the live project it stops at that insert and changes nothing.
-- The migration to apply is db/migrations/180_incoming_schedule.sql.
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
INSERT INTO public.subjects(course_code, course_display_code, course_name, course_department)
VALUES ('9001101', 'DEMO 101', 'Invented demo course', 'Invented department');

SET LOCAL ROLE authenticated;

-- A KU coordinator schedules a CBA course: the code and name come from the catalogue, the
-- student from the application, and the days are stored once each in week order.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"email":"demo-coordinator@ku.edu.kw"}';
INSERT INTO public.inbound_schedule_items(application_id, student_id, subject_code, course_display_code, course_name, meeting_days, start_time, end_time, room, instructor)
VALUES (900001, 900002, '9001101', 'WRONG', 'Wrong name', ARRAY['Tuesday', 'Sunday', 'Tuesday'], '09:30', '10:45', 'Demo room 1', 'Demo instructor');
-- A course outside the CBA list needs every detail typed in.
INSERT INTO public.inbound_schedule_items(application_id, course_display_code, course_name, meeting_days, start_time, end_time, room, instructor)
VALUES (900001, 'EXT 200', 'Invented outside course', ARRAY['Monday', 'Wednesday'], '08:00', '09:15', 'Demo room 2', 'Demo instructor two');
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.inbound_schedule_items
        WHERE subject_code = '9001101' AND course_display_code = 'DEMO 101' AND course_name = 'Invented demo course'
          AND student_id = 900001 AND meeting_days = ARRAY['Sunday', 'Tuesday']
    ) THEN
        RAISE EXCEPTION 'The CBA course was not saved from the catalogue for the application''s student';
    END IF;
END $$;

SELECT pg_temp.expect_error('INSERT INTO public.inbound_schedule_items(application_id, course_display_code, course_name, meeting_days, start_time, end_time, room, instructor) VALUES (900002, ''EXT 1'', ''x'', ARRAY[''Sunday''], ''08:00'', ''09:00'', ''x'', ''x'')', '42501');
SELECT pg_temp.expect_error('INSERT INTO public.inbound_schedule_items(application_id, course_display_code, course_name, meeting_days, start_time, end_time, room, instructor) VALUES (900001, ''EXT 1'', ''x'', ARRAY[''Sunday''], ''10:00'', ''09:00'', ''x'', ''x'')', '23514');
SELECT pg_temp.expect_error('INSERT INTO public.inbound_schedule_items(application_id, course_display_code, course_name, meeting_days, start_time, end_time, room, instructor) VALUES (900001, ''EXT 1'', ''x'', ARRAY[''Funday''], ''08:00'', ''09:00'', ''x'', ''x'')', '23514');
SELECT pg_temp.expect_error('INSERT INTO public.inbound_schedule_items(application_id, course_display_code, course_name, meeting_days, start_time, end_time, room, instructor) VALUES (900001, ''EXT 1'', ''x'', ARRAY[''Sunday''], ''08:00'', ''09:00'', '' '', ''x'')', '23514');
SELECT pg_temp.expect_error('UPDATE public.inbound_schedule_items SET application_id = 900002 WHERE course_display_code = ''EXT 200''', '22023');
UPDATE public.inbound_schedule_items SET room = 'Demo room 3', student_id = 900002 WHERE course_display_code = 'EXT 200';
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.inbound_schedule_items WHERE course_display_code = 'EXT 200' AND room = 'Demo room 3' AND student_id = 900001) THEN
        RAISE EXCEPTION 'An edit did not save, or moved the course to another student';
    END IF;
END $$;

-- Partner coordinators neither read nor write schedules.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claims = '{"email":"partner@example.invalid"}';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.inbound_schedule_items) THEN
        RAISE EXCEPTION 'A partner coordinator could read a schedule';
    END IF;
END $$;
SELECT pg_temp.expect_error('INSERT INTO public.inbound_schedule_items(application_id, course_display_code, course_name, meeting_days, start_time, end_time, room, instructor) VALUES (900001, ''EXT 1'', ''x'', ARRAY[''Sunday''], ''08:00'', ''09:00'', ''x'', ''x'')', '42501');

-- The student reads their own courses and cannot change them.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"email":"incoming@example.invalid"}';
DO $$ BEGIN
    IF (SELECT count(*) FROM public.inbound_schedule_items) <> 2 THEN
        RAISE EXCEPTION 'The student cannot read their schedule';
    END IF;
END $$;
SELECT pg_temp.expect_error('INSERT INTO public.inbound_schedule_items(application_id, course_display_code, course_name, meeting_days, start_time, end_time, room, instructor) VALUES (900001, ''EXT 1'', ''x'', ARRAY[''Sunday''], ''08:00'', ''09:00'', ''x'', ''x'')', '42501');
UPDATE public.inbound_schedule_items SET room = 'Changed by student';
DELETE FROM public.inbound_schedule_items;

-- Another student sees none of it.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
SET LOCAL request.jwt.claims = '{"email":"other@example.invalid"}';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.inbound_schedule_items) THEN
        RAISE EXCEPTION 'Another student could read the schedule';
    END IF;
END $$;

-- The student's update and delete above changed nothing; the coordinator can remove a course.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"email":"demo-coordinator@ku.edu.kw"}';
DO $$ BEGIN
    IF (SELECT count(*) FROM public.inbound_schedule_items) <> 2
       OR EXISTS (SELECT 1 FROM public.inbound_schedule_items WHERE room = 'Changed by student') THEN
        RAISE EXCEPTION 'The student changed their schedule';
    END IF;
END $$;
DELETE FROM public.inbound_schedule_items WHERE course_display_code = 'EXT 200';
DO $$ BEGIN
    IF (SELECT count(*) FROM public.inbound_schedule_items) <> 1 THEN
        RAISE EXCEPTION 'The coordinator could not remove a course';
    END IF;
END $$;

-- A schedule is shown only while the application stays approved.
RESET ROLE;
UPDATE public.inboundapplication SET application_status = 'Rejected', approval_type = NULL WHERE application_id = 900001;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"email":"incoming@example.invalid"}';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.inbound_schedule_items) THEN
        RAISE EXCEPTION 'The schedule stayed visible after the application lost its approval';
    END IF;
END $$;

ROLLBACK;
