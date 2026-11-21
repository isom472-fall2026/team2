-- Issue #132. Apply to the existing database; schema.sql remains the fresh-build definition.

BEGIN;

-- The letter is the student's proof of acceptance, so it is a PDF and stays readable only
-- while the application is approved; a withdrawn or otherwise changed application loses it.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf']
WHERE id = 'acceptance-letters';

DROP POLICY IF EXISTS "Incoming students can read their stamped acceptance letters" ON public.acceptance_letters;

CREATE POLICY "Incoming students can read their stamped acceptance letters"
ON public.acceptance_letters
FOR SELECT
TO authenticated
USING (
    stamped_file_path IS NOT NULL
    AND EXISTS (
        SELECT 1
        FROM public.incomingstudentauth AS student
        JOIN public.inboundapplication AS application ON application.student_id = student.student_id
        WHERE student.student_id = acceptance_letters.student_id
          AND application.application_id = acceptance_letters.application_id
          AND application.application_status IN ('Accepted', 'Approved')
          AND student.user_id = (SELECT auth.uid())
    )
);

DROP POLICY IF EXISTS "Incoming students can read their stamped acceptance letters" ON storage.objects;

CREATE POLICY "Incoming students can read their stamped acceptance letters"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'acceptance-letters'
    AND EXISTS (
        SELECT 1
        FROM public.acceptance_letters AS letter
        JOIN public.incomingstudentauth AS student ON student.student_id = letter.student_id
        JOIN public.inboundapplication AS application
          ON application.application_id = letter.application_id
         AND application.student_id = student.student_id
        WHERE letter.stamped_file_path = storage.objects.name
          AND application.application_status IN ('Accepted', 'Approved')
          AND student.user_id = (SELECT auth.uid())
    )
);

NOTIFY pgrst, 'reload schema';

COMMIT;
