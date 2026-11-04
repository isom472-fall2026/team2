-- Issue #114: KU coordinators add partner universities from the portal.
-- Run once in the Supabase SQL editor on the existing database. schema.sql carries the same
-- changes for a full rebuild. Safe to run again.

BEGIN;

ALTER TABLE public.partneruniversity
    ADD COLUMN IF NOT EXISTS airport_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS airport_code CHAR(3),
    ADD COLUMN IF NOT EXISTS airport_latitude DECIMAL(9, 6),
    ADD COLUMN IF NOT EXISTS airport_longitude DECIMAL(9, 6);

ALTER TABLE public.partneruniversity
    DROP CONSTRAINT IF EXISTS partneruniversity_latitude_range,
    DROP CONSTRAINT IF EXISTS partneruniversity_longitude_range,
    DROP CONSTRAINT IF EXISTS partneruniversity_airport_name_check,
    DROP CONSTRAINT IF EXISTS partneruniversity_airport_code_check,
    DROP CONSTRAINT IF EXISTS partneruniversity_airport_latitude_range,
    DROP CONSTRAINT IF EXISTS partneruniversity_airport_longitude_range;

ALTER TABLE public.partneruniversity
    ADD CONSTRAINT partneruniversity_latitude_range
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    ADD CONSTRAINT partneruniversity_longitude_range
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    ADD CONSTRAINT partneruniversity_airport_name_check
        CHECK (airport_name IS NULL OR length(btrim(airport_name)) > 0),
    ADD CONSTRAINT partneruniversity_airport_code_check
        CHECK (airport_code IS NULL OR airport_code ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT partneruniversity_airport_latitude_range
        CHECK (airport_latitude IS NULL OR airport_latitude BETWEEN -90 AND 90),
    ADD CONSTRAINT partneruniversity_airport_longitude_range
        CHECK (airport_longitude IS NULL OR airport_longitude BETWEEN -180 AND 180);

-- Two universities whose names differ only in case or surrounding spaces are the same one.
CREATE UNIQUE INDEX IF NOT EXISTS partneruniversity_name_unique
    ON public.partneruniversity (lower(btrim(name)));

DROP POLICY IF EXISTS "KU coordinators can add partner universities" ON public.partneruniversity;
CREATE POLICY "KU coordinators can add partner universities"
ON public.partneruniversity
FOR INSERT
TO authenticated
WITH CHECK (public.is_ku_coordinator());

-- Logos are shown on the public directory, so the bucket is public to read; only KU
-- coordinators can upload, and the bucket itself enforces the 2 MB PNG/JPG rule.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'partner-university-logos',
    'partner-university-logos',
    TRUE,
    2097152,
    ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET public = TRUE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "KU coordinators can upload partner university logos" ON storage.objects;
CREATE POLICY "KU coordinators can upload partner university logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'partner-university-logos'
    AND public.is_ku_coordinator()
);

COMMIT;
