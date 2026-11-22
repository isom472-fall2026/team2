-- Database bug fix: approving a partner coordinator failed with "infinite recursion detected in
-- policy for relation coordinator". Apply to the existing database; schema.sql remains the
-- fresh-build definition.

BEGIN;

-- Asked by the coordinator update policy below. Reading partneruniversity there directly would
-- run its policies, one of which reads coordinator again, and Postgres refuses every coordinator
-- update as infinite recursion.
CREATE OR REPLACE FUNCTION public.is_retired_university(requested_university_id INT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.partneruniversity
        WHERE university_id = requested_university_id
          AND deleted_at IS NOT NULL
    );
$$;

REVOKE ALL ON FUNCTION public.is_retired_university(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_retired_university(INT) TO authenticated;

DROP POLICY IF EXISTS "KU coordinators can update coordinator profiles" ON public.coordinator;
CREATE POLICY "KU coordinators can update coordinator profiles"
ON public.coordinator
FOR UPDATE
TO authenticated
USING ((SELECT public.is_ku_coordinator()))
WITH CHECK (
    (SELECT public.is_ku_coordinator())
    AND NOT (email_accepted IS TRUE AND public.is_retired_university(university))
);

NOTIFY pgrst, 'reload schema';

COMMIT;
