-- Public program copy. Staff contact details are published through the coordinator editor.
CREATE TABLE public.exchange_program_info (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    team_description text NOT NULL CHECK (team_description ~ '[^[:space:]]'),
    director_name text NOT NULL CHECK (director_name ~ '[^[:space:]]'),
    director_email text NOT NULL CHECK (director_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
    assistant_name text NOT NULL CHECK (assistant_name ~ '[^[:space:]]'),
    assistant_email text NOT NULL CHECK (assistant_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
    assistant_phone text NOT NULL CHECK (assistant_phone ~ '^\+[1-9][0-9]{6,14}$'),
    program_instagram text NOT NULL CHECK (program_instagram ~ '^[a-zA-Z0-9_.]{1,30}$'),
    college_instagram text NOT NULL CHECK (college_instagram ~ '^[a-zA-Z0-9_.]{1,30}$'),
    college_url text NOT NULL CHECK (college_url ~* '^https://[a-z0-9.-]+[.]ku[.]edu[.]kw([/?#][^[:space:]]*)?$'),
    accreditation text NOT NULL CHECK (accreditation ~ '[^[:space:]]'),
    mailing_address text NOT NULL CHECK (mailing_address ~ '[^[:space:]]'),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.set_exchange_program_info_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER exchange_program_info_updated_at
BEFORE INSERT OR UPDATE ON public.exchange_program_info
FOR EACH ROW EXECUTE FUNCTION public.set_exchange_program_info_updated_at();

ALTER TABLE public.exchange_program_info ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exchange_program_info FROM anon, authenticated;
GRANT SELECT ON public.exchange_program_info TO anon, authenticated;
GRANT INSERT, UPDATE ON public.exchange_program_info TO authenticated;

CREATE POLICY "Visitors can read exchange program information"
ON public.exchange_program_info FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "KU coordinators can publish exchange program information"
ON public.exchange_program_info FOR INSERT TO authenticated
WITH CHECK (public.is_ku_coordinator() AND NOT public.get_maintenance_mode() AND NOT public.is_testing_mode_enabled());

CREATE POLICY "KU coordinators can edit exchange program information"
ON public.exchange_program_info FOR UPDATE TO authenticated
USING (public.is_ku_coordinator() AND NOT public.get_maintenance_mode() AND NOT public.is_testing_mode_enabled())
WITH CHECK (public.is_ku_coordinator() AND NOT public.get_maintenance_mode() AND NOT public.is_testing_mode_enabled());

CREATE FUNCTION public.valid_exchange_team_contacts(contacts jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
    SELECT CASE WHEN jsonb_typeof(contacts) = 'array' THEN NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(contacts) AS members(member)
        WHERE (jsonb_typeof(member->'name') = 'string'
           AND jsonb_typeof(member->'title') = 'string'
           AND member->>'name' ~ '[^[:space:]]'
           AND member->>'title' ~ '[^[:space:]]') IS NOT TRUE
    ) ELSE false END;
$$;

ALTER TABLE public.exchange_program_info
ADD COLUMN additional_contacts jsonb NOT NULL DEFAULT '[]'::jsonb
CHECK (public.valid_exchange_team_contacts(additional_contacts));
