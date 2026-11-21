-- Disposable database integration checks for issue #132; fixtures and grants are rolled back.
BEGIN;

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
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"email":"demo-coordinator@ku.edu.kw"}';
INSERT INTO storage.objects(bucket_id, name) VALUES
('acceptance-letters', '900001/900001/conditional/issued.pdf'),
('acceptance-letters', '900001/900001/conditional/stamped.pdf');
SELECT public.issue_acceptance_letter(900001, 'Conditional', '900001/900001/conditional/issued.pdf');
SELECT public.save_stamped_acceptance_letter(
    (SELECT id FROM public.acceptance_letters WHERE application_id = 900001),
    '900001/900001/conditional/stamped.pdf');

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"email":"incoming@example.invalid"}';
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.acceptance_letters WHERE application_id = 900001)
       OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE name = '900001/900001/conditional/stamped.pdf') THEN
        RAISE EXCEPTION 'The approved student cannot read their stamped letter';
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

-- Once the application is no longer approved, neither the row nor the file can be read, even
-- by a student who knows the file path.
RESET ROLE;
SELECT set_config('app.application_review', 'true', true);
UPDATE public.inboundapplication SET application_status = 'Withdrawn', approval_type = NULL WHERE application_id = 900001;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"email":"incoming@example.invalid"}';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.acceptance_letters)
       OR EXISTS (SELECT 1 FROM storage.objects WHERE name = '900001/900001/conditional/stamped.pdf') THEN
        RAISE EXCEPTION 'A withdrawn application still exposes its acceptance letter';
    END IF;
END $$;

DO $$ BEGIN
    IF (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'acceptance-letters') IS DISTINCT FROM ARRAY['application/pdf'] THEN
        RAISE EXCEPTION 'The acceptance-letters bucket accepts files other than PDF';
    END IF;
END $$;

ROLLBACK;
