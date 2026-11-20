-- Disposable database integration checks; fixtures and grants are rolled back.
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
('00000000-0000-0000-0000-000000000004', 'other@example.invalid'),
('00000000-0000-0000-0000-000000000005', 'demo-student@ku.edu.kw');
INSERT INTO public.country(id, name) VALUES (900001, 'Invented test country');
INSERT INTO public.partneruniversity(university_id, name, location) VALUES
(4, 'Demo KU', 900001), (900010, 'Demo partner', 900001);
INSERT INTO public.coordinator(coordinator_id, name, email, university, user_id, email_accepted) VALUES
(900001, 'Demo KU coordinator', 'demo-coordinator@ku.edu.kw', 4, '00000000-0000-0000-0000-000000000002', TRUE),
(900002, 'Demo partner coordinator', 'partner@example.invalid', 900010, '00000000-0000-0000-0000-000000000003', TRUE);
INSERT INTO public.incomingstudentauth(student_id, student_email, name, user_id) VALUES
(900001, 'incoming@example.invalid', 'Demo incoming student', '00000000-0000-0000-0000-000000000001'),
(900002, 'other@example.invalid', 'Demo other student', '00000000-0000-0000-0000-000000000004');
INSERT INTO public.kustudentauth(student_id, student_email, name, user_id) VALUES
(900003, 'demo-student@ku.edu.kw', 'Demo KU student', '00000000-0000-0000-0000-000000000005');
INSERT INTO public.exchange_cycle(id, semester, academic_year, nominations_o, nominations_c, application_o, application_c, cycle_start, cycle_end)
VALUES (900001, 'Fall', '2026/2027', now()-interval '1 day', now()+interval '30 days', now()-interval '1 day', now()+interval '30 days', now()+interval '60 days', now()+interval '200 days');
INSERT INTO public.studentnominations(id, coordinator_id, student_name, student_email, semester)
VALUES (900001, 900002, 'Demo incoming student', 'incoming@example.invalid', 900001);
INSERT INTO public.testing_backup(table_name, record_id, original) VALUES ('partneruniversity', '900010', '{"name":"Private synthetic backup"}');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"email":"incoming@example.invalid"}';
INSERT INTO public.inboundapplication(application_id, student_id, nomination_id, semester_applied_for, email, first_name, last_name, english_evidence_type)
VALUES (900001, 900001, 900001, 900001, 'incoming@example.invalid', 'Demo', 'Incoming', 'IELTS');
SELECT pg_temp.expect_error('UPDATE public.inboundapplication SET application_status = ''Submitted'' WHERE application_id = 900001', '23514');
INSERT INTO storage.objects(bucket_id, name) VALUES
('inbound-application-files', '900001/900001/cv/test.pdf'),
('inbound-application-files', '900001/900001/english_evidence/test.pdf');
UPDATE public.inboundapplication SET cv = '900001/900001/cv/test.pdf' WHERE application_id = 900001;
SELECT pg_temp.expect_error('UPDATE public.inboundapplication SET application_status = ''Submitted'' WHERE application_id = 900001', '23514');
UPDATE public.inboundapplication SET english_evidence = '900001/900001/english_evidence/test.pdf', english_evidence_type = NULL WHERE application_id = 900001;
SELECT pg_temp.expect_error('UPDATE public.inboundapplication SET application_status = ''Submitted'' WHERE application_id = 900001', '23514');
SELECT pg_temp.expect_error('UPDATE public.inboundapplication SET english_evidence_type = ''Other'' WHERE application_id = 900001', '23514');
UPDATE public.inboundapplication
SET original_application_id = application_id, cv = '900001/900001/cv/not-uploaded.pdf', english_evidence_type = 'IELTS'
WHERE application_id = 900001;
SELECT pg_temp.expect_error('UPDATE public.inboundapplication SET application_status = ''Submitted'', tos = TRUE WHERE application_id = 900001', '23514');
UPDATE public.inboundapplication SET original_application_id = NULL, cv = '900001/900001/cv/test.pdf' WHERE application_id = 900001;
UPDATE public.inboundapplication SET english_evidence_type = 'University letter', application_status = 'Submitted', submitted_at = now(), tos = TRUE WHERE application_id = 900001;
SELECT pg_temp.expect_error('SELECT public.review_inbound_application(900001, TRUE)', 'P0001');

SAVEPOINT incoming_edit;
SELECT pg_temp.expect_error('SELECT public.modify_inbound_application(900001, ''{"cv":"900002/900001/cv/other.pdf"}'')', '22023');
INSERT INTO storage.objects(bucket_id, name) VALUES
('inbound-application-files', '900001/900001/cv/replacement.pdf'),
('inbound-application-files', '900001/900001/english_evidence/replacement.pdf');
DO $$ DECLARE edited public.inboundapplication; BEGIN
    edited := public.modify_inbound_application(900001, '{"english_evidence_type":"TOEFL","cv":"900001/900001/cv/replacement.pdf","english_evidence":"900001/900001/english_evidence/replacement.pdf"}');
    IF edited.cv <> '900001/900001/cv/replacement.pdf'
       OR edited.english_evidence <> '900001/900001/english_evidence/replacement.pdf'
       OR edited.english_evidence_type <> 'TOEFL'
       OR edited.original_application_id <> 900001 THEN
        RAISE EXCEPTION 'Incoming edit lost its new documents or version history';
    END IF;
    edited := public.modify_inbound_application(edited.application_id, '{"first_name":"Updated"}');
    IF edited.cv <> '900001/900001/cv/replacement.pdf'
       OR edited.english_evidence <> '900001/900001/english_evidence/replacement.pdf' THEN
        RAISE EXCEPTION 'An incoming edit did not retain earlier version documents';
    END IF;
END $$;
ROLLBACK TO SAVEPOINT incoming_edit;

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"email":"demo-coordinator@ku.edu.kw"}';
SELECT public.review_inbound_application(900001, TRUE);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.inboundapplication WHERE application_id=900001 AND application_status='Accepted' AND approval_type='Conditional' AND criminal_record_certificate IS NULL) THEN
        RAISE EXCEPTION 'Conditional approval without a criminal-record certificate failed';
    END IF;
    IF EXISTS (SELECT 1 FROM public.testing_backup) THEN RAISE EXCEPTION 'Backup rows leaked to a client role'; END IF;
END $$;
SELECT pg_temp.expect_error('SELECT public.review_inbound_application(900001, TRUE, NULL, TRUE, TRUE)', '22023');

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
SELECT pg_temp.expect_error('SELECT public.save_inbound_criminal_record(900001, ''900001/900001/criminal_record_certificate/test.pdf'')', '42501');

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"email":"incoming@example.invalid"}';
SELECT pg_temp.expect_error('INSERT INTO storage.objects(bucket_id,name) VALUES (''inbound-application-files'', ''900001/900001/cv/after-approval.pdf'')', '42501');
INSERT INTO storage.objects(bucket_id, name) VALUES ('inbound-application-files', '900001/900001/criminal_record_certificate/test.pdf');
SELECT pg_temp.expect_error('SELECT public.save_inbound_criminal_record(900001, ''900001/900001/criminal_record_certificate/missing.pdf'')', '22023');
SELECT public.save_inbound_criminal_record(900001, '900001/900001/criminal_record_certificate/test.pdf');
DELETE FROM storage.objects WHERE name = '900001/900001/criminal_record_certificate/test.pdf';
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name='900001/900001/criminal_record_certificate/test.pdf') THEN
        RAISE EXCEPTION 'An attached criminal-record certificate was deleted';
    END IF;
END $$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"email":"demo-coordinator@ku.edu.kw"}';
SELECT pg_temp.expect_error('SELECT public.review_inbound_application(900001, TRUE, NULL, TRUE, FALSE)', '22023');
SELECT public.review_inbound_application(900001, TRUE, NULL, TRUE, TRUE);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.inboundapplication WHERE application_id=900001 AND application_status='Approved' AND approval_type='Unconditional') THEN
        RAISE EXCEPTION 'Unconditional approval was not saved';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.application_status_log WHERE inbound_application_id=900001 AND new_status='Approved' AND reason LIKE 'Unconditional approval%') THEN
        RAISE EXCEPTION 'Unconditional approval was not audited';
    END IF;
END $$;
SELECT pg_temp.expect_error('SELECT public.review_inbound_application(900001, TRUE)', 'P0001');

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_error('INSERT INTO storage.objects(bucket_id,name) VALUES (''inbound-application-files'', ''900001/900001/criminal_record_certificate/after-unconditional.pdf'')', '42501');
SELECT pg_temp.expect_error('SELECT public.save_inbound_criminal_record(900001, ''900001/900001/criminal_record_certificate/test.pdf'')', '42501');

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
SET LOCAL request.jwt.claims = '{"email":"demo-student@ku.edu.kw"}';
INSERT INTO public.outboundapplication(application_id, student_id, semester_applied_for, university_id, first_name, last_name, gpa, credits_passed, current_year_of_study, expected_graduation_semester)
VALUES (900003, 900003, 900001, 900010, 'Demo', 'Outbound', 3.5, 75, 'Third year', CURRENT_DATE + 365);
SELECT pg_temp.expect_error('UPDATE public.outboundapplication SET application_status=''Submitted'' WHERE application_id=900003', '23514');
INSERT INTO storage.objects(bucket_id,name) VALUES ('outbound-application-files', '900003/900003/cv/test.pdf');
UPDATE public.outboundapplication SET cv='900003/900003/cv/test.pdf', application_status='Submitted', submitted_at=now(), tos=TRUE WHERE application_id=900003;
INSERT INTO storage.objects(bucket_id,name) VALUES ('outbound-application-files', '900003/900003/cv/replacement.pdf');
DO $$ DECLARE edited public.outboundapplication; BEGIN
    edited := public.modify_outbound_application(900003, '{"cv":"900003/900003/cv/replacement.pdf"}');
    IF edited.cv <> '900003/900003/cv/replacement.pdf' OR edited.original_application_id <> 900003 THEN
        RAISE EXCEPTION 'Outgoing edit lost its CV or version history';
    END IF;
    edited := public.modify_outbound_application(edited.application_id, '{"first_name":"Updated"}');
    IF edited.cv <> '900003/900003/cv/replacement.pdf' THEN
        RAISE EXCEPTION 'An outgoing edit did not retain the earlier CV';
    END IF;
END $$;

ROLLBACK;
