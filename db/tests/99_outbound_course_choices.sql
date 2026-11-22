-- Run on a disposable database built from schema.sql. Everything rolls back.
-- The existing database needs db/migrations/99_outbound_course_choices.sql instead.
BEGIN;

CREATE FUNCTION pg_temp.expect_error(statement TEXT, expected_state TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE caught TEXT;
BEGIN
    BEGIN EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS caught = RETURNED_SQLSTATE;
    END;
    IF caught IS DISTINCT FROM expected_state THEN
        RAISE EXCEPTION 'Expected SQLSTATE %, got % for %', expected_state, caught, statement;
    END IF;
END;
$$;

INSERT INTO auth.users(id, email) VALUES
('00000000-0000-0000-0000-000000000001', 'demo-student@ku.edu.kw'),
('00000000-0000-0000-0000-000000000002', 'demo-office@ku.edu.kw'),
('00000000-0000-0000-0000-000000000003', 'demo-other@ku.edu.kw');
INSERT INTO public.country(id, name) VALUES (900001, 'Invented country');
INSERT INTO public.partneruniversity(university_id, name, location) VALUES
(4, 'Demo KU', 900001), (900010, 'Invented partner', 900001);
INSERT INTO public.coordinator(coordinator_id, name, email, university, user_id, email_accepted)
VALUES (900001, 'Demo coordinator', 'demo-office@ku.edu.kw', 4, '00000000-0000-0000-0000-000000000002', TRUE);
INSERT INTO public.kustudentauth(student_id, student_email, name, user_id) VALUES
(900001, 'demo-student@ku.edu.kw', 'Demo student', '00000000-0000-0000-0000-000000000001'),
(900002, 'demo-other@ku.edu.kw', 'Demo other student', '00000000-0000-0000-0000-000000000003');
INSERT INTO public.exchange_cycle(id, semester, academic_year, application_o, application_c)
VALUES (900001, 'Fall', '2027/2028', now() - interval '56 days', now() + interval '30 days');
INSERT INTO public.subjects(course_code, course_display_code, course_name, course_department)
VALUES ('9999001', 'DEMO 101', 'Invented catalog course', 'Demo department');
INSERT INTO public.outboundapplication(application_id, student_id, first_name, last_name, application_status, semester_applied_for, university_id)
VALUES (900001, 900001, 'Demo', 'Student', 'In Review', 900001, 900010);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"email":"demo-student@ku.edu.kw"}';
DO $$
DECLARE choice public.outbound_course_choices; edited public.outboundapplication;
BEGIN
    choice := public.save_outbound_course_choice(900001, NULL, '9999001', 'forged code', 'forged title', 3);
    IF choice.course_display_code <> 'DEMO 101' OR choice.course_title <> 'Invented catalog course' THEN
        RAISE EXCEPTION 'Catalog details were accepted from the caller';
    END IF;
    choice := public.save_outbound_course_choice(900001, choice.id, NULL, 'EXT 100', 'Invented custom course', 2.5);
    IF choice.credits <> 2.5 OR choice.subject_code IS NOT NULL THEN RAISE EXCEPTION 'Edit failed'; END IF;
    PERFORM public.delete_outbound_course_choice(900001, choice.id);
    FOR sample IN 1..8 LOOP
        PERFORM public.save_outbound_course_choice(900001, NULL, NULL, 'EXT ' || sample, 'Invented course', 3);
    END LOOP;
    IF (SELECT count(*) FROM public.outbound_course_choices) <> 8 THEN RAISE EXCEPTION 'Eight courses were not saved'; END IF;
    edited := public.modify_outbound_application(900001, '{"first_name":"Edited demo"}'::JSONB);
    IF (SELECT count(*) FROM public.outbound_course_choices WHERE application_id = edited.application_id) <> 8
       OR (SELECT count(*) FROM public.outbound_course_choices WHERE application_id = 900001) <> 8 THEN
        RAISE EXCEPTION 'Application editing did not preserve both course-list versions';
    END IF;
END;
$$;

-- The historical application cannot be edited even though its choices remain readable.
SELECT pg_temp.expect_error('SELECT public.save_outbound_course_choice(900001, NULL, NULL, ''X'', ''Old application'', 3)', '42501');
DO $$
DECLARE target_application_id BIGINT;
BEGIN
    SELECT application.application_id INTO target_application_id FROM public.outboundapplication AS application
    WHERE original_application_id = 900001 AND application_status = 'In Review';
    PERFORM pg_temp.expect_error(format('SELECT public.save_outbound_course_choice(%s, NULL, NULL, ''X'', ''Ninth course'', 3)', target_application_id), '22023');
    PERFORM pg_temp.expect_error(format('SELECT public.save_outbound_course_choice(%s, NULL, NULL, '''', ''Missing code'', 3)', target_application_id), '22023');
    PERFORM pg_temp.expect_error(format('SELECT public.save_outbound_course_choice(%s, NULL, ''0000000'', NULL, NULL, 3)', target_application_id), '22023');
    PERFORM pg_temp.expect_error(format('SELECT public.save_outbound_course_choice(%s, NULL, NULL, ''X'', ''Bad credits'', 0)', target_application_id), '22023');
    PERFORM pg_temp.expect_error(format('SELECT public.save_outbound_course_choice(%s, NULL, NULL, ''X'', ''Bad credits'', ''NaN''::NUMERIC)', target_application_id), '22023');
    PERFORM pg_temp.expect_error(format('SELECT public.save_outbound_course_choice(%s, NULL, NULL, ''X'', ''Bad credits'', ''Infinity''::NUMERIC)', target_application_id), '22023');
END;
$$;
SELECT pg_temp.expect_error('DELETE FROM public.outbound_course_choices', '42501');
SELECT pg_temp.expect_error('UPDATE public.outbound_course_choices SET credits = 0', '42501');

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claims = '{"email":"demo-other@ku.edu.kw"}';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.outbound_course_choices) THEN RAISE EXCEPTION 'Another student read the list'; END IF;
END $$;
SELECT pg_temp.expect_error('SELECT public.save_outbound_course_choice(900001, NULL, NULL, ''X'', ''Other student'', 3)', '42501');

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"email":"demo-office@ku.edu.kw"}';
DO $$ BEGIN
    IF (SELECT count(*) FROM public.outbound_course_choices) <> 16 THEN RAISE EXCEPTION 'Office cannot read choices'; END IF;
END $$;
SELECT pg_temp.expect_error('SELECT public.save_outbound_course_choice(900001, NULL, NULL, ''X'', ''Office edit'', 3)', '42501');
DO $$
DECLARE target_application_id BIGINT;
BEGIN
    SELECT application.application_id INTO target_application_id FROM public.outboundapplication AS application
    WHERE original_application_id = 900001 AND application_status = 'In Review';
    PERFORM public.review_outbound_application(target_application_id, TRUE);
END;
$$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"email":"demo-student@ku.edu.kw"}';
DO $$
DECLARE target_application_id BIGINT; choice_id BIGINT;
BEGIN
    SELECT application.application_id INTO target_application_id FROM public.outboundapplication AS application
    WHERE original_application_id = 900001 AND application_status = 'Accepted';
    SELECT min(id) INTO choice_id FROM public.outbound_course_choices AS choice WHERE choice.application_id = target_application_id;
    PERFORM pg_temp.expect_error(format('SELECT public.save_outbound_course_choice(%s, %s, NULL, ''X'', ''Approved edit'', 4)', target_application_id, choice_id), '42501');
    PERFORM pg_temp.expect_error(format('SELECT public.delete_outbound_course_choice(%s, %s)', target_application_id, choice_id), '42501');
END;
$$;
SELECT pg_temp.expect_error('SELECT public.seed_testing_cycle_applications(900001)', '42501');

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"email":"demo-office@ku.edu.kw"}';
SELECT pg_temp.expect_error('SELECT public.seed_testing_cycle_applications(900001)', '42501');
SELECT public.set_testing_mode(TRUE);
SELECT pg_temp.expect_error('SELECT public.seed_testing_cycle_applications(900001)', '42501');
INSERT INTO public.exchange_cycle(id, semester, academic_year, application_o, application_c)
VALUES (900002, 'Spring', '2027/2028', now() - interval '56 days', now() + interval '30 days');
SELECT public.seed_testing_cycle_applications(900002);
SELECT public.seed_testing_cycle_applications(900002);
DO $$ BEGIN
    IF (SELECT count(*) FROM public.inboundapplication WHERE semester_applied_for = 900002) <> 80
       OR (SELECT count(*) FROM public.outboundapplication WHERE semester_applied_for = 900002) <> 80 THEN
        RAISE EXCEPTION 'Graph seeding count or idempotence failed';
    END IF;
    IF (SELECT count(DISTINCT application_status) FROM public.inboundapplication WHERE semester_applied_for = 900002) < 5
       OR EXISTS (SELECT 1 FROM public.inboundapplication WHERE semester_applied_for = 900002 AND submitted_at IS NULL) THEN
        RAISE EXCEPTION 'Graph records lack varied statuses or submission dates';
    END IF;
END $$;
SELECT public.set_testing_mode(FALSE);
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.inboundapplication WHERE semester_applied_for = 900002)
       OR EXISTS (SELECT 1 FROM public.outboundapplication WHERE semester_applied_for = 900002)
       OR EXISTS (SELECT 1 FROM public.coordinator WHERE name = 'Graph demo coordinator') THEN
        RAISE EXCEPTION 'Testing graph data survived cleanup';
    END IF;
    IF (SELECT count(*) FROM public.outbound_course_choices) <> 16 THEN RAISE EXCEPTION 'Cleanup changed non-test choices'; END IF;
END $$;
ROLLBACK;
