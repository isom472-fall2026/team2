-- Issue #72. Apply to the existing database; schema.sql remains the fresh-build definition.

BEGIN;

-- The seed fixture's outgoing feedback sits on a draft application and has no rating, so it
-- cannot meet the rules below. It is invented data; no real feedback is removed.
DELETE FROM public.feedback WHERE id = 990002;

-- Outgoing feedback is a 1 to 5 rating of the host university with an optional comment.
-- Incoming feedback (#76) keeps its required comment.
ALTER TABLE public.feedback
    ADD COLUMN rating SMALLINT CONSTRAINT feedback_rating_range CHECK (rating BETWEEN 1 AND 5),
    ADD COLUMN university_id INT REFERENCES public.partneruniversity(university_id) ON DELETE CASCADE,
    ALTER COLUMN details DROP NOT NULL,
    DROP CONSTRAINT IF EXISTS feedback_details_check,
    ADD CONSTRAINT feedback_details_check CHECK (details IS NULL OR length(btrim(details)) > 0),
    ADD CONSTRAINT feedback_required_fields CHECK (
        (oapplicationid IS NULL AND details IS NOT NULL)
        OR (oapplicationid IS NOT NULL AND rating IS NOT NULL AND university_id IS NOT NULL)
    );

CREATE UNIQUE INDEX feedback_one_per_outbound_application
ON public.feedback (oapplicationid)
WHERE oapplicationid IS NOT NULL;

-- The university comes from the application, never from the request, so a student can rate
-- only the university they were accepted to, and only once that KU semester has ended.
CREATE OR REPLACE FUNCTION public.prepare_outbound_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.oapplicationid IS NULL AND NEW.oapplicationid IS NULL THEN
            RETURN NEW;
        END IF;
        IF NEW.oapplicationid IS DISTINCT FROM OLD.oapplicationid
           OR NEW.iapplicationid IS DISTINCT FROM OLD.iapplicationid THEN
            RAISE EXCEPTION 'Feedback cannot be moved to another application';
        END IF;
        NEW.university_id := OLD.university_id;
        NEW.created_at := OLD.created_at;
        RETURN NEW;
    END IF;

    IF NEW.oapplicationid IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT application.university_id
    INTO NEW.university_id
    FROM public.outboundapplication AS application
    JOIN public.exchange_cycle AS cycle ON cycle.id = application.semester_applied_for
    WHERE application.application_id = NEW.oapplicationid
      AND application.application_status IN ('Accepted', 'Approved')
      AND application.university_id IS NOT NULL
      AND cycle.cycle_end < now();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'You can rate your host university only after your accepted exchange semester has ended';
    END IF;
    NEW.created_at := CURRENT_TIMESTAMP;
    NEW.edited := FALSE;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_outbound_feedback() FROM PUBLIC;

CREATE TRIGGER feedback_prepare_outbound
BEFORE INSERT OR UPDATE ON public.feedback
FOR EACH ROW EXECUTE FUNCTION public.prepare_outbound_feedback();

CREATE OR REPLACE FUNCTION public.can_read_host_university_ratings()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.is_ku_coordinator()
        OR EXISTS (
            SELECT 1
            FROM public.kustudentauth AS student
            WHERE student.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM public.coordinator AS coordinator
            JOIN public.partneruniversity AS university
              ON university.university_id = coordinator.university
            WHERE coordinator.user_id = auth.uid()
              AND coordinator.email_accepted IS TRUE
              AND university.deleted_at IS NULL
        );
$$;

REVOKE ALL ON FUNCTION public.can_read_host_university_ratings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_host_university_ratings() TO authenticated;

-- Host university ratings are for KU students and approved coordinators only. Incoming
-- feedback keeps the public read it had, which is #76's to decide.
DROP POLICY IF EXISTS "Anyone can read feedback" ON public.feedback;

CREATE POLICY "Anyone can read incoming feedback"
ON public.feedback
FOR SELECT
TO anon, authenticated
USING (oapplicationid IS NULL);

CREATE POLICY "KU students and approved coordinators can read host university ratings"
ON public.feedback
FOR SELECT
TO authenticated
USING (oapplicationid IS NOT NULL AND (SELECT public.can_read_host_university_ratings()));

NOTIFY pgrst, 'reload schema';

COMMIT;
