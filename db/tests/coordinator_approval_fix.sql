-- Disposable database integration checks for the coordinator approval fix; fixtures are rolled back.
-- Run only on a throwaway database built from schema.sql. It inserts Kuwait University as
-- university 4, so on the live project it stops at that insert and changes nothing.
-- The migration to apply is db/migrations/coordinator_approval_fix.sql.
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
('00000000-0000-0000-0000-000000000002', 'demo-coordinator@ku.edu.kw'),
('00000000-0000-0000-0000-000000000003', 'partner@example.invalid'),
('00000000-0000-0000-0000-000000000005', 'retired-partner@example.invalid');
INSERT INTO public.country(id, name) VALUES (900001, 'Invented test country');
INSERT INTO public.partneruniversity(university_id, name, location) VALUES
(4, 'Demo KU', 900001), (900010, 'Demo partner', 900001), (900011, 'Demo retired partner', 900001);
UPDATE public.partneruniversity SET deleted_at = now(), available = false WHERE university_id = 900011;
INSERT INTO public.coordinator(coordinator_id, name, email, university, user_id, email_accepted) VALUES
(900001, 'Demo KU coordinator', 'demo-coordinator@ku.edu.kw', 4, '00000000-0000-0000-0000-000000000002', TRUE),
(900002, 'Demo pending partner', 'partner@example.invalid', 900010, '00000000-0000-0000-0000-000000000003', FALSE),
(900003, 'Demo retired-university partner', 'retired-partner@example.invalid', 900011, '00000000-0000-0000-0000-000000000005', FALSE);

SET LOCAL ROLE authenticated;

-- A partner coordinator cannot approve their own request.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claims = '{"email":"partner@example.invalid"}';
UPDATE public.coordinator SET email_accepted = TRUE WHERE coordinator_id = 900002;

-- A KU coordinator approves a pending partner coordinator, but not one whose university is retired.
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"email":"demo-coordinator@ku.edu.kw"}';
DO $$ BEGIN
    IF (SELECT email_accepted FROM public.coordinator WHERE coordinator_id = 900002) THEN
        RAISE EXCEPTION 'A partner coordinator approved their own access';
    END IF;
END $$;
UPDATE public.coordinator SET email_accepted = TRUE WHERE coordinator_id = 900002;
DO $$ BEGIN
    IF NOT (SELECT email_accepted FROM public.coordinator WHERE coordinator_id = 900002) THEN
        RAISE EXCEPTION 'The KU coordinator could not approve the partner coordinator';
    END IF;
END $$;
SELECT pg_temp.expect_error('UPDATE public.coordinator SET email_accepted = TRUE WHERE coordinator_id = 900003', '42501');

ROLLBACK;
