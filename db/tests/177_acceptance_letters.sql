-- Disposable database integration checks for issue #177; fixtures and grants are rolled back.
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
VALUES (900001, 'Fall', '2026/2027', now()-interval '1 day', now()+interval '30 days', now()-interval '1 day', now()+interval '30 days', now()+interval '60 days', now()+interval '200 days');
INSERT INTO public.studentnominations(id, coordinator_id, student_name, student_email, semester)
VALUES (900001, 900002, 'Demo incoming student', 'incoming@example.invalid', 900001);
SELECT set_config('app.application_review', 'true', true);
INSERT INTO public.inboundapplication(application_id, student_id, nomination_id, semester_applied_for, email, first_name, last_name, application_status, approval_type)
VALUES (900001, 900001, 900001, 900001, 'incoming@example.invalid', 'Demo', 'Incoming', 'Accepted', 'Conditional');

SET LOCAL ROLE authenticated;

-- A partner coordinator cannot issue letters.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claims = '{"email":"partner@example.invalid"}';
SELECT pg_temp.expect_error('SELECT public.issue_acceptance_letter(900001, ''Conditional'', ''900001/900001/conditional/issued.pdf'')', '42501');

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"email":"demo-coordinator@ku.edu.kw"}';
SELECT pg_temp.expect_error('SELECT public.issue_acceptance_letter(900001, ''Conditional'', ''900001/900001/conditional/issued.pdf'')', '22023');
INSERT INTO storage.objects(bucket_id, name) VALUES
('acceptance-letters', '900001/900001/conditional/issued.pdf'),
('acceptance-letters', '900001/900001/unconditional/issued.pdf');
SELECT pg_temp.expect_error('SELECT public.issue_acceptance_letter(900001, ''Unconditional'', ''900001/900001/unconditional/issued.pdf'')', '22023');
SELECT pg_temp.expect_error('SELECT public.issue_acceptance_letter(900001, ''Conditional'', ''900001/900001/unconditional/issued.pdf'')', '22023');
SELECT public.issue_acceptance_letter(900001, 'Conditional', '900001/900001/conditional/issued.pdf');
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.acceptance_letters
        WHERE application_id = 900001 AND letter_type = 'Conditional' AND student_id = 900001
          AND issued_by = 900001 AND issued_by_name = 'Demo KU coordinator'
          AND issued_by_email = 'demo-coordinator@ku.edu.kw' AND issued_at IS NOT NULL
          AND stamped_file_path IS NULL
    ) THEN
        RAISE EXCEPTION 'The issued letter was not recorded with its coordinator';
    END IF;
    IF EXISTS (SELECT 1 FROM public.updates WHERE inbound_application_id = 900001) THEN
        RAISE EXCEPTION 'The student was notified before the letter was stamped';
    END IF;
END $$;
SELECT pg_temp.expect_error('SELECT public.issue_acceptance_letter(900001, ''Conditional'', ''900001/900001/conditional/issued.pdf'')', '23505');
SELECT pg_temp.expect_error('INSERT INTO public.acceptance_letters(application_id, student_id, letter_type, file_path, issued_by_name, issued_by_email) VALUES (900001, 900001, ''Unconditional'', ''x.pdf'', ''x'', ''x'')', '42501');

-- An issued letter's file cannot be removed.
DELETE FROM storage.objects WHERE name = '900001/900001/conditional/issued.pdf';

-- The student sees nothing until the stamped copy is sent.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"email":"incoming@example.invalid"}';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.acceptance_letters) THEN
        RAISE EXCEPTION 'An unstamped letter was visible to the student';
    END IF;
    IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'acceptance-letters') THEN
        RAISE EXCEPTION 'An unstamped letter file was readable by the student';
    END IF;
END $$;
SELECT pg_temp.expect_error('SELECT public.save_stamped_acceptance_letter((SELECT 1), ''x'')', '42501');

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"email":"demo-coordinator@ku.edu.kw"}';
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name = '900001/900001/conditional/issued.pdf') THEN
        RAISE EXCEPTION 'The issued letter file was deleted';
    END IF;
END $$;
SELECT pg_temp.expect_error(format('SELECT public.save_stamped_acceptance_letter(%s, ''900001/900001/conditional/issued.pdf'')',
    (SELECT id FROM public.acceptance_letters WHERE application_id = 900001 AND letter_type = 'Conditional')), '22023');
SELECT pg_temp.expect_error(format('SELECT public.save_stamped_acceptance_letter(%s, ''900001/900001/conditional/missing.pdf'')',
    (SELECT id FROM public.acceptance_letters WHERE application_id = 900001 AND letter_type = 'Conditional')), '22023');
INSERT INTO storage.objects(bucket_id, name) VALUES ('acceptance-letters', '900001/900001/conditional/stamped.pdf');
SELECT public.save_stamped_acceptance_letter(
    (SELECT id FROM public.acceptance_letters WHERE application_id = 900001 AND letter_type = 'Conditional'),
    '900001/900001/conditional/stamped.pdf');
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.acceptance_letters
        WHERE application_id = 900001 AND letter_type = 'Conditional'
          AND stamped_file_path = '900001/900001/conditional/stamped.pdf'
          AND stamped_at IS NOT NULL AND stamped_by = 900001 AND stamped_by_name = 'Demo KU coordinator'
    ) THEN
        RAISE EXCEPTION 'The stamped letter was not recorded';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.updates WHERE inbound_application_id = 900001 AND details LIKE 'Your conditional acceptance letter%') THEN
        RAISE EXCEPTION 'The student was not sent an update for the stamped letter';
    END IF;
END $$;
SELECT pg_temp.expect_error(format('SELECT public.save_stamped_acceptance_letter(%s, ''900001/900001/conditional/stamped.pdf'')',
    (SELECT id FROM public.acceptance_letters WHERE application_id = 900001 AND letter_type = 'Conditional')), '22023');

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"email":"incoming@example.invalid"}';
DO $$ BEGIN
    IF (SELECT count(*) FROM public.acceptance_letters) <> 1 THEN
        RAISE EXCEPTION 'The student cannot see their stamped letter';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name = '900001/900001/conditional/stamped.pdf')
       OR EXISTS (SELECT 1 FROM storage.objects WHERE name = '900001/900001/conditional/issued.pdf') THEN
        RAISE EXCEPTION 'The student must read only the stamped letter file';
    END IF;
END $$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
SET LOCAL request.jwt.claims = '{"email":"other@example.invalid"}';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.acceptance_letters)
       OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'acceptance-letters') THEN
        RAISE EXCEPTION 'Another student could read the letter';
    END IF;
END $$;

-- After the approval becomes unconditional, an unconditional letter is issued beside the
-- conditional one.
RESET ROLE;
INSERT INTO storage.objects(bucket_id, name) VALUES ('inbound-application-files', '900001/900001/criminal_record_certificate/test.pdf');
SELECT set_config('app.application_review', 'true', true);
UPDATE public.inboundapplication
SET criminal_record_certificate = '900001/900001/criminal_record_certificate/test.pdf',
    application_status = 'Approved', approval_type = 'Unconditional'
WHERE application_id = 900001;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"email":"demo-coordinator@ku.edu.kw"}';
SELECT public.issue_acceptance_letter(900001, 'Unconditional', '900001/900001/unconditional/issued.pdf');
DO $$ BEGIN
    IF (SELECT count(*) FROM public.acceptance_letters WHERE application_id = 900001) <> 2 THEN
        RAISE EXCEPTION 'The conditional and unconditional letters were not both kept';
    END IF;
END $$;

ROLLBACK;
