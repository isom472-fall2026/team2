-- Follow-up for an already-applied early #99 migration: fix graph-generator variable resolution.
BEGIN;

CREATE OR REPLACE FUNCTION public.seed_testing_cycle_applications(requested_cycle_id INT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    cycle_row public.exchange_cycle;
    universities INT[];
    countries INT[];
    coordinator_ids INT[] := '{}';
    university_id INT;
    generated_coordinator_id INT;
    nomination_id BIGINT;
    inbound_id INT;
    outbound_id BIGINT;
    source_index INT;
    country_id INT;
    submission TIMESTAMPTZ;
    opening TIMESTAMPTZ;
    closing TIMESTAMPTZ;
    statuses TEXT[] := ARRAY['In Review', 'Pending Interview', 'Accepted', 'Rejected', 'Withdrawn'];
    chosen_status TEXT;
BEGIN
    IF public.is_ku_coordinator() IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only KU coordinators can generate testing applications';
    END IF;
    PERFORM 1 FROM public.testing WHERE id = 1 AND enabled IS TRUE FOR UPDATE;
    IF NOT FOUND OR public.get_maintenance_mode() IS DISTINCT FROM FALSE
       OR public.is_testing_record('exchange_cycle', requested_cycle_id::TEXT) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Choose a testing cycle while testing mode is on and maintenance mode is off';
    END IF;
    SELECT * INTO cycle_row FROM public.exchange_cycle WHERE id = requested_cycle_id;
    opening := cycle_row.application_o AT TIME ZONE 'UTC';
    closing := LEAST(cycle_row.application_c AT TIME ZONE 'UTC', now());
    IF opening IS NULL OR closing IS NULL OR opening > closing THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The testing cycle needs an open application window';
    END IF;
    IF EXISTS (SELECT 1 FROM public.inboundapplication WHERE semester_applied_for = requested_cycle_id AND first_name = 'Graph demo') THEN
        RETURN;
    END IF;
    SELECT array_agg(partner.university_id ORDER BY partner.university_id) INTO universities
    FROM public.partneruniversity AS partner WHERE partner.available AND partner.deleted_at IS NULL AND partner.university_id <> 4;
    SELECT array_agg(id ORDER BY id) INTO countries FROM public.country WHERE name <> 'Kuwait';
    IF COALESCE(cardinality(universities), 0) = 0 OR COALESCE(cardinality(countries), 0) = 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Add a partner university and a country before generating testing applications';
    END IF;
    FOREACH university_id IN ARRAY universities LOOP
        LOOP
            generated_coordinator_id := 1000000000 + floor(random() * 1000000000)::INT;
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.coordinator AS coordinator WHERE coordinator.coordinator_id = generated_coordinator_id);
        END LOOP;
        INSERT INTO public.coordinator(coordinator_id, name, email, university, email_accepted)
        VALUES (generated_coordinator_id, 'Graph demo coordinator', 'graph-' || generated_coordinator_id || '@example.invalid', university_id, TRUE);
        coordinator_ids := array_append(coordinator_ids, generated_coordinator_id);
    END LOOP;
    FOR sample IN 1..80 LOOP
        source_index := 1 + floor(random() * cardinality(universities))::INT;
        country_id := countries[1 + floor(random() * cardinality(countries))::INT];
        chosen_status := statuses[CASE WHEN sample <= 5 THEN sample ELSE 1 + floor(random() * 5)::INT END];
        submission := opening + (closing - opening) * random();
        LOOP
            inbound_id := 1000000000 + floor(random() * 1000000000)::INT;
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.inboundapplication WHERE application_id = inbound_id);
        END LOOP;
        LOOP
            nomination_id := 1000000000 + floor(random() * 1000000000)::BIGINT;
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.studentnominations WHERE id = nomination_id);
        END LOOP;
        INSERT INTO public.studentnominations(id, coordinator_id, student_name, student_email, semester, created_at)
        VALUES (nomination_id, coordinator_ids[source_index], 'Graph demo incoming ' || sample,
            'graph-in-' || inbound_id || '@example.invalid', requested_cycle_id, opening);
        INSERT INTO public.inboundapplication(application_id, first_name, last_name, email, nationality,
            semester_applied_for, nomination_id, application_status, approval_type, submitted_at, created_at, tos)
        VALUES (inbound_id, 'Graph demo', 'Incoming ' || sample, 'graph-in-' || inbound_id || '@example.invalid', country_id,
            requested_cycle_id, nomination_id, chosen_status, CASE WHEN chosen_status = 'Accepted' THEN 'Conditional' END, submission, submission, TRUE);
        LOOP
            outbound_id := floor(extract(epoch FROM clock_timestamp()) * 1000)::BIGINT * 1000 + floor(random() * 1000)::BIGINT;
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.outboundapplication WHERE application_id = outbound_id);
        END LOOP;
        INSERT INTO public.outboundapplication(application_id, first_name, last_name, nationality, semester_applied_for,
            university_id, application_status, submitted_at, created_at, gpa, credits_passed, tos)
        VALUES (outbound_id, 'Graph demo', 'Outgoing ' || sample, country_id, requested_cycle_id, universities[source_index],
            CASE WHEN chosen_status = 'Accepted' AND sample % 2 = 0 THEN 'Approved' ELSE chosen_status END,
            submission, submission, round((3 + random())::NUMERIC, 2), 60 + floor(random() * 43)::INT, TRUE);
    END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_testing_cycle_applications(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_testing_cycle_applications(INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
