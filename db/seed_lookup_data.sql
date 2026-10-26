-- Lookup records and invented fixtures for every public application table.
-- Run as database owner in Supabase SQL Editor; Auth fixtures have no passwords.

BEGIN;

INSERT INTO public.country (id, name, city)
VALUES
    (1, 'Afghanistan', 'Kabul'),
    (2, 'Albania', 'Tirana'),
    (3, 'Algeria', 'Algiers'),
    (4, 'Andorra', 'Andorra la Vella'),
    (5, 'Angola', 'Luanda'),
    (6, 'Antigua and Barbuda', 'St Johns'),
    (7, 'Argentina', 'Buenos Aires'),
    (8, 'Armenia', 'Yerevan'),
    (9, 'Australia', 'Canberra'),
    (10, 'Austria', 'Vienna'),
    (11, 'Azerbaijan', 'Baku'),
    (12, 'Bahamas', 'Nassau'),
    (13, 'Bahrain', 'Manama'),
    (14, 'Bangladesh', 'Dhaka'),
    (15, 'Barbados', 'Bridgetown'),
    (16, 'Belarus', 'Minsk'),
    (17, 'Belgium', 'Brussels'),
    (18, 'Belize', 'Belmopan'),
    (19, 'Benin', 'Porto Novo'),
    (20, 'Bhutan', 'Thimphu'),
    (21, 'Bolivia', 'Sucre'),
    (22, 'Bosnia and Herzegovina', 'Sarajevo'),
    (23, 'Botswana', 'Gaborone'),
    (24, 'Brazil', 'Brasilia'),
    (25, 'Brunei', 'Bandar Seri Begawan'),
    (26, 'Bulgaria', 'Sofia'),
    (27, 'Burkina Faso', 'Ouagadougou'),
    (28, 'Burundi', 'Gitega'),
    (29, 'Cabo Verde', 'Praia'),
    (30, 'Cambodia', 'Phnom Penh'),
    (31, 'Cameroon', 'Yaounde'),
    (32, 'Canada', 'Ottawa'),
    (33, 'Central African Republic', 'Bangui'),
    (34, 'Chad', 'NDjamena'),
    (35, 'Chile', 'Santiago'),
    (36, 'China', 'Beijing'),
    (37, 'Colombia', 'Bogota'),
    (38, 'Comoros', 'Moroni'),
    (39, 'Republic of the Congo', 'Brazzaville'),
    (40, 'Democratic Republic of the Congo', 'Kinshasa'),
    (41, 'Costa Rica', 'San Jose'),
    (42, 'Cote d''Ivoire', 'Yamoussoukro'),
    (43, 'Croatia', 'Zagreb'),
    (44, 'Cuba', 'Havana'),
    (45, 'Cyprus', 'Nicosia'),
    (46, 'Czechia', 'Prague'),
    (47, 'Denmark', 'Copenhagen'),
    (48, 'Djibouti', 'Djibouti'),
    (49, 'Dominica', 'Roseau'),
    (50, 'Dominican Republic', 'Santo Domingo'),
    (51, 'Ecuador', 'Quito'),
    (52, 'Egypt', 'Cairo'),
    (53, 'El Salvador', 'San Salvador'),
    (54, 'Equatorial Guinea', 'Malabo'),
    (55, 'Eritrea', 'Asmara'),
    (56, 'Estonia', 'Tallinn'),
    (57, 'Eswatini', 'Mbabane'),
    (58, 'Ethiopia', 'Addis Ababa'),
    (59, 'Fiji', 'Suva'),
    (60, 'Finland', 'Helsinki'),
    (61, 'France', 'Paris'),
    (62, 'Gabon', 'Libreville'),
    (63, 'Gambia', 'Banjul'),
    (64, 'Georgia', 'Tbilisi'),
    (65, 'Germany', 'Berlin'),
    (66, 'Ghana', 'Accra'),
    (67, 'Greece', 'Athens'),
    (68, 'Grenada', 'St Georges'),
    (69, 'Guatemala', 'Guatemala City'),
    (70, 'Guinea', 'Conakry'),
    (71, 'Guinea-Bissau', 'Bissau'),
    (72, 'Guyana', 'Georgetown'),
    (73, 'Haiti', 'Port-au-Prince'),
    (74, 'Honduras', 'Tegucigalpa'),
    (75, 'Hungary', 'Budapest'),
    (76, 'Iceland', 'Reykjavik'),
    (77, 'India', 'New Delhi'),
    (78, 'Indonesia', 'Jakarta'),
    (79, 'Iran', 'Tehran'),
    (80, 'Iraq', 'Baghdad'),
    (81, 'Ireland', 'Dublin'),
    (82, 'Italy', 'Rome'),
    (83, 'Jamaica', 'Kingston'),
    (84, 'Japan', 'Tokyo'),
    (85, 'Jordan', 'Amman'),
    (86, 'Kazakhstan', 'Astana'),
    (87, 'Kenya', 'Nairobi'),
    (88, 'Kiribati', 'South Tarawa'),
    (89, 'Kuwait', 'Kuwait City'),
    (90, 'Kyrgyzstan', 'Bishkek'),
    (91, 'Laos', 'Vientiane'),
    (92, 'Latvia', 'Riga'),
    (93, 'Lebanon', 'Beirut'),
    (94, 'Lesotho', 'Maseru'),
    (95, 'Liberia', 'Monrovia'),
    (96, 'Libya', 'Tripoli'),
    (97, 'Liechtenstein', 'Vaduz'),
    (98, 'Lithuania', 'Vilnius'),
    (99, 'Luxembourg', 'Luxembourg'),
    (100, 'Madagascar', 'Antananarivo'),
    (101, 'Malawi', 'Lilongwe'),
    (102, 'Malaysia', 'Kuala Lumpur'),
    (103, 'Maldives', 'Male'),
    (104, 'Mali', 'Bamako'),
    (105, 'Malta', 'Valletta'),
    (106, 'Marshall Islands', 'Majuro'),
    (107, 'Mauritania', 'Nouakchott'),
    (108, 'Mauritius', 'Port Louis'),
    (109, 'Mexico', 'Mexico City'),
    (110, 'Micronesia', 'Palikir'),
    (111, 'Moldova', 'Chisinau'),
    (112, 'Monaco', 'Monaco'),
    (113, 'Mongolia', 'Ulaanbaatar'),
    (114, 'Montenegro', 'Podgorica'),
    (115, 'Morocco', 'Rabat'),
    (116, 'Mozambique', 'Maputo'),
    (117, 'Myanmar', 'Naypyidaw'),
    (118, 'Namibia', 'Windhoek'),
    (119, 'Nauru', 'Yaren'),
    (120, 'Nepal', 'Kathmandu'),
    (121, 'Netherlands', 'Amsterdam'),
    (122, 'New Zealand', 'Wellington'),
    (123, 'Nicaragua', 'Managua'),
    (124, 'Niger', 'Niamey'),
    (125, 'Nigeria', 'Abuja'),
    (126, 'North Korea', 'Pyongyang'),
    (127, 'North Macedonia', 'Skopje'),
    (128, 'Norway', 'Oslo'),
    (129, 'Oman', 'Muscat'),
    (130, 'Pakistan', 'Islamabad'),
    (131, 'Palau', 'Ngerulmud'),
    (132, 'Panama', 'Panama City'),
    (133, 'Papua New Guinea', 'Port Moresby'),
    (134, 'Paraguay', 'Asuncion'),
    (135, 'Peru', 'Lima'),
    (136, 'Philippines', 'Manila'),
    (137, 'Poland', 'Warsaw'),
    (138, 'Portugal', 'Lisbon'),
    (139, 'Qatar', 'Doha'),
    (140, 'Romania', 'Bucharest'),
    (141, 'Russia', 'Moscow'),
    (142, 'Rwanda', 'Kigali'),
    (143, 'Saint Kitts and Nevis', 'Basseterre'),
    (144, 'Saint Lucia', 'Castries'),
    (145, 'Saint Vincent and the Grenadines', 'Kingstown'),
    (146, 'Samoa', 'Apia'),
    (147, 'San Marino', 'San Marino'),
    (148, 'Sao Tome and Principe', 'Sao Tome'),
    (149, 'Saudi Arabia', 'Riyadh'),
    (150, 'Senegal', 'Dakar'),
    (151, 'Serbia', 'Belgrade'),
    (152, 'Seychelles', 'Victoria'),
    (153, 'Sierra Leone', 'Freetown'),
    (154, 'Singapore', 'Singapore'),
    (155, 'Slovakia', 'Bratislava'),
    (156, 'Slovenia', 'Ljubljana'),
    (157, 'Solomon Islands', 'Honiara'),
    (158, 'Somalia', 'Mogadishu'),
    (159, 'South Africa', 'Pretoria'),
    (160, 'South Korea', 'Seoul'),
    (161, 'South Sudan', 'Juba'),
    (162, 'Spain', 'Madrid'),
    (163, 'Sri Lanka', 'Sri Jayawardenepura Kotte'),
    (164, 'Sudan', 'Khartoum'),
    (165, 'Suriname', 'Paramaribo'),
    (166, 'Sweden', 'Stockholm'),
    (167, 'Switzerland', 'Bern'),
    (168, 'Syria', 'Damascus'),
    (169, 'Tajikistan', 'Dushanbe'),
    (170, 'Tanzania', 'Dodoma'),
    (171, 'Thailand', 'Bangkok'),
    (172, 'Timor-Leste', 'Dili'),
    (173, 'Togo', 'Lome'),
    (174, 'Tonga', 'Nukualofa'),
    (175, 'Trinidad and Tobago', 'Port of Spain'),
    (176, 'Tunisia', 'Tunis'),
    (177, 'Turkey', 'Ankara'),
    (178, 'Turkmenistan', 'Ashgabat'),
    (179, 'Tuvalu', 'Funafuti'),
    (180, 'Uganda', 'Kampala'),
    (181, 'Ukraine', 'Kyiv'),
    (182, 'United Arab Emirates', 'Abu Dhabi'),
    (183, 'United Kingdom', 'London'),
    (184, 'United States', 'Washington DC'),
    (185, 'Uruguay', 'Montevideo'),
    (186, 'Uzbekistan', 'Tashkent'),
    (187, 'Vanuatu', 'Port Vila'),
    (188, 'Vatican City', 'Vatican City'),
    (189, 'Venezuela', 'Caracas'),
    (190, 'Vietnam', 'Hanoi'),
    (191, 'Yemen', 'Sanaa'),
    (192, 'Zambia', 'Lusaka'),
    (193, 'Zimbabwe', 'Harare'),
    (194, 'Taiwan', 'Taipei')
ON CONFLICT (id) DO NOTHING;


INSERT INTO public.partneruniversity (university_id, name, logo_url, latitude, longitude, available, location, details)
VALUES
    (1, 'Indian Institute of Management Bangalore', 'https://i.imgur.com/oS6EPbn.jpeg', 12.935, 77.605, TRUE, 77, 'Founded in 1973, IIM Bangalore is one of India''s leading management institutes and is part of the Indian Institutes of Management network.'),
    (2, 'Hanyang University', 'https://i.imgur.com/aTAxOMg.png', 37.557, 127.045, TRUE, 160, 'Founded in 1939 as an engineering school, Hanyang University is a major private research university in South Korea.'),
    (3, 'National Chengchi University', 'https://i.imgur.com/u7GIKuH.png', 24.988, 121.576, TRUE, 194, 'Founded in 1927, National Chengchi University is a major public research university in Taiwan, particularly known for social sciences, business, and communication.'),
    (4, 'Kuwait University', 'https://i.imgur.com/EyEABp3.png', 29.253629, 47.902044, TRUE, 89, 'Founded in October 1966, Kuwait University is Kuwait''s first public institution of higher education and research.'),
    (5, 'National Taiwan University', 'https://i.imgur.com/wCdNeQX.jpeg', 25.017, 121.54, TRUE, 194, 'Founded in 1928, National Taiwan University is Taiwan''s flagship comprehensive research university.'),
    (6, 'University of Technology Sydney', 'https://i.imgur.com/vgYBGio.png', -33.883, 151.201, TRUE, 9, 'Established in its present form in 1988, UTS is a major public university in Sydney with a strong focus on technology and applied education.'),
    (7, 'Audencia Nantes School of Management', 'https://i.imgur.com/ZX4JHha.jpeg', 47.2184, -1.5536, TRUE, 61, 'Founded in 1900 in Nantes, Audencia is a French business school with international academic partnerships and programs.'),
    (8, 'EM Normandie Business School', 'https://i.imgur.com/hBgxI9A.jpeg', 49.4944, 0.1079, TRUE, 61, 'Founded in 1871 in Le Havre, EM Normandie is one of France''s oldest business schools.'),
    (9, 'KEDGE Business School', 'https://i.imgur.com/9ASgFZb.png', 44.792, -0.607, TRUE, 61, 'Established in 2013 through the merger of BEM and Euromed Management, KEDGE is a French business school with campuses in France and abroad.'),
    (10, 'Essec School of Business', 'https://i.imgur.com/6lQga5K.png', 49.033, 2.08, TRUE, 61, 'Founded in 1907, ESSEC Business School is a French grande école known for business education, research, and international programs.'),
    (11, 'ESC Rennes School of Business', 'https://i.imgur.com/z9bkRXR.png', 48.1173, -1.6778, TRUE, 61, 'Founded in 1990, Rennes School of Business is a French management school with a strong international orientation.'),
    (12, 'HEC School of Management', 'https://i.imgur.com/Yh5MEpq.png', 48.758, 2.169, TRUE, 61, 'Founded in 1881 by the Paris Chamber of Commerce and Industry, HEC Paris is one of Europe''s oldest business schools.'),
    (13, 'Neoma Business School', 'https://i.imgur.com/FtpdvUj.jpeg', 49.238509, 4.002832, TRUE, 61, 'Founded in 2013 through the merger of Reims Management School and Rouen Business School, NEOMA is a French grande école.'),
    (14, 'Paris School of Business', 'https://i.imgur.com/AEf60lL.png', 48.853, 2.35, TRUE, 61, 'Paris School of Business is a French business school based in Paris offering undergraduate and graduate management programs.'),
    (15, 'Toulouse Business School', 'https://i.imgur.com/Nwojhkv.png', 43.605, 1.444, TRUE, 61, 'Founded in 1903, Toulouse Business School is a French grande école with a long history in management education.'),
    (16, 'Skema Business School', 'https://i.imgur.com/CbgBSTY.png', 43.615, 7.073, TRUE, 61, 'Founded in 2009 through the merger of CERAM Business School and ESC Lille, SKEMA has campuses in France and several international locations.'),
    (17, 'Goethe University', 'https://i.imgur.com/sYGc52W.png', 50.126, 8.667, TRUE, 65, 'Founded in 1914, Goethe University Frankfurt is a major public research university in Germany.'),
    (18, 'University of Manheim', 'https://i.imgur.com/fv7UfKR.png', 49.483, 8.463, TRUE, 65, 'Founded in 1907 as a commercial college and later developed into a university, the University of Mannheim is known for business and economics.'),
    (19, 'Rotterdam School of Management', 'https://i.imgur.com/k1vsJJa.png', 51.917, 4.525, TRUE, 121, 'Established in 1970, Rotterdam School of Management is the business school of Erasmus University Rotterdam.'),
    (20, 'Bocconi University', 'https://i.imgur.com/2XwDeJx.jpeg', 45.4506, 9.1883, TRUE, 82, 'Founded in 1902 in Milan, Bocconi University specializes in economics, management, finance, law, and related social sciences.'),
    (21, 'Esade Business School', 'https://i.imgur.com/5qQx6Mw.png', 41.3919, 2.1136, TRUE, 162, 'Founded in 1958 in Barcelona, Esade is a Spanish business school known for management education, research, and entrepreneurship.'),
    (22, 'IE Business School', 'https://i.imgur.com/yTrJnUr.png', 40.439, -3.691, TRUE, 162, 'Founded in 1973, IE Business School is a private business school in Madrid with a strong focus on entrepreneurship and international management.'),
    (23, 'University of Geneva', 'https://i.imgur.com/DrueJIP.jpeg', 46.198, 6.14, TRUE, 167, 'Founded in 1559, the University of Geneva is one of Switzerland''s major public research universities.'),
    (24, 'University of St.Gallen', 'https://i.imgur.com/BXREKsP.jpeg', 47.431, 9.373, TRUE, 167, 'Founded in 1898, the University of St. Gallen is a Swiss university particularly renowned for business, economics, and management.'),
    (25, 'Kogod School of Business', 'https://i.imgur.com/Gaftgr9.png', 38.937, -77.087, TRUE, 184, 'Founded in 1955, the Kogod School of Business is the business school of American University in Washington, DC.'),
    (26, 'University of Maryland', 'https://i.imgur.com/imBaZNV.png', 38.986, -76.944, TRUE, 184, 'Founded in 1856, the University of Maryland, College Park is a major public research university in the United States.'),
    (27, 'University of San Diego', 'https://i.imgur.com/ZhBEUKD.png', 32.771, -117.188, TRUE, 184, 'Founded in 1949, the University of San Diego is a private university in California known for its liberal arts and professional programs.'),
    (28, 'University of Rhode Island', 'https://i.imgur.com/SJC1Q6R.png', 41.484, -71.53, TRUE, 184, 'Founded in 1892 as an agricultural school, the University of Rhode Island is the state''s principal public research university.')
ON CONFLICT (university_id) DO NOTHING;

INSERT INTO auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
)
VALUES
    (
        '00000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'seed-ku-student@ku.edu.kw',
        '',
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"Seed KU Student","user_type":"ku","student_id":990001}'::jsonb,
        now(),
        now()
    ),
    (
        '00000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'seed-incoming-student@example.com',
        '',
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"Seed Incoming Student","user_type":"incoming","student_id":990002}'::jsonb,
        now(),
        now()
    ),
    (
        '00000000-0000-4000-8000-000000000003',
        'authenticated',
        'authenticated',
        'seed-ku-coordinator@ku.edu.kw',
        '',
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"Seed KU Coordinator","user_type":"coordinator","coordinator_id":990002}'::jsonb,
        now(),
        now()
    ),
    (
        '00000000-0000-4000-8000-000000000004',
        'authenticated',
        'authenticated',
        'seed-partner-coordinator@example.com',
        '',
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"Seed Partner Coordinator","user_type":"coordinator","coordinator_id":990001}'::jsonb,
        now(),
        now()
    )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.exchange_cycle (
    id, semester, academic_year, nominations_o, nominations_c,
    application_o, application_c, cycle_start, cycle_end
)
VALUES
    (
        990001, 'Fall', '2026/2027',
        now() - interval '90 days', now() + interval '30 days',
        now() - interval '60 days', now() + interval '60 days',
        now() + interval '90 days', now() + interval '180 days'
    ),
    (
        990002, 'Spring', '2027/2028',
        now() + interval '60 days', now() + interval '120 days',
        now() + interval '90 days', now() + interval '150 days',
        now() + interval '180 days', now() + interval '270 days'
    )
ON CONFLICT (id) DO UPDATE SET
    semester = EXCLUDED.semester,
    academic_year = EXCLUDED.academic_year,
    nominations_o = EXCLUDED.nominations_o,
    nominations_c = EXCLUDED.nominations_c,
    application_o = EXCLUDED.application_o,
    application_c = EXCLUDED.application_c,
    cycle_start = EXCLUDED.cycle_start,
    cycle_end = EXCLUDED.cycle_end;

INSERT INTO public.kustudentauth (student_id, student_email, name, user_id)
VALUES (
    990001,
    'seed-ku-student@ku.edu.kw',
    'Seed KU Student',
    '00000000-0000-4000-8000-000000000001'
)
ON CONFLICT (student_id) DO UPDATE SET
    student_email = EXCLUDED.student_email,
    name = EXCLUDED.name,
    user_id = EXCLUDED.user_id;

INSERT INTO public.incomingstudentauth (student_id, student_email, name, user_id)
VALUES (
    990002,
    'seed-incoming-student@example.com',
    'Seed Incoming Student',
    '00000000-0000-4000-8000-000000000002'
)
ON CONFLICT (student_id) DO UPDATE SET
    student_email = EXCLUDED.student_email,
    name = EXCLUDED.name,
    user_id = EXCLUDED.user_id;

INSERT INTO public.emergency_contact (contact_id, name, phone_number, email)
VALUES (990001, 'Seed Emergency Contact', '+965 5555 0101', 'seed-emergency@example.com')
ON CONFLICT (contact_id) DO UPDATE SET
    name = EXCLUDED.name,
    phone_number = EXCLUDED.phone_number,
    email = EXCLUDED.email;

INSERT INTO public.coordinator (
    coordinator_id, name, email, university, user_id, email_accepted, maintenance_mode
)
VALUES
    (
        990001, 'Seed Partner Coordinator', 'seed-partner-coordinator@example.com',
        1, '00000000-0000-4000-8000-000000000004', TRUE, FALSE
    ),
    (
        990002, 'Seed KU Coordinator', 'seed-ku-coordinator@ku.edu.kw',
        4, '00000000-0000-4000-8000-000000000003', TRUE, FALSE
    )
ON CONFLICT (coordinator_id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    university = EXCLUDED.university,
    user_id = EXCLUDED.user_id,
    email_accepted = EXCLUDED.email_accepted,
    maintenance_mode = EXCLUDED.maintenance_mode;

INSERT INTO public.studentnominations (
    id, coordinator_id, student_name, student_email, student_nationality,
    semester, nomination_status
)
VALUES (
    990001, 990001, 'Seed Incoming Student', 'seed-incoming-student@example.com',
    'India', 990001, 'Active'
)
ON CONFLICT (id) DO UPDATE SET
    coordinator_id = EXCLUDED.coordinator_id,
    student_name = EXCLUDED.student_name,
    student_email = EXCLUDED.student_email,
    student_nationality = EXCLUDED.student_nationality,
    semester = EXCLUDED.semester,
    nomination_status = EXCLUDED.nomination_status;

INSERT INTO public.updates (id, details)
VALUES (990001, 'Seed fixture: application documents verified for review.')
ON CONFLICT (id) DO UPDATE SET details = EXCLUDED.details;

SELECT setval(
    pg_get_serial_sequence('public.updates', 'id'),
    GREATEST((SELECT max(id) FROM public.updates), 1),
    TRUE
);

INSERT INTO public.inboundapplication (
    application_id, update_id, first_name, last_name, gender, birthdate,
    country_of_residence, passport_number, passport_expiry_date, max_gpa, gpa,
    expected_graduation_date, credits_passed, max_credits, email, phone_number,
    is_whatsapp_available, major, current_year_of_study, tos, passport_issuing_country,
    nationality, semester_applied_for, student_id, emergency_contact, submitted_at,
    application_status, nomination_id
)
VALUES (
    990001, 990001, 'Seed', 'Incoming Student', 'Female',
    (CURRENT_DATE - interval '20 years')::date, 'India', 'TEST-IN-990001',
    (CURRENT_DATE + interval '5 years')::date, 4.0, 3.6,
    (CURRENT_DATE + interval '2 years')::date, 60, 120,
    'seed-incoming-student@example.com', '+91 98765 43210', TRUE,
    'Business Administration', 'Third year', TRUE, 77, 77, 990001,
    990002, 990001, now() - interval '7 days', 'Submitted', 990001
)
ON CONFLICT (application_id) DO UPDATE SET
    update_id = EXCLUDED.update_id,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    gender = EXCLUDED.gender,
    birthdate = EXCLUDED.birthdate,
    country_of_residence = EXCLUDED.country_of_residence,
    passport_number = EXCLUDED.passport_number,
    passport_expiry_date = EXCLUDED.passport_expiry_date,
    max_gpa = EXCLUDED.max_gpa,
    gpa = EXCLUDED.gpa,
    expected_graduation_date = EXCLUDED.expected_graduation_date,
    credits_passed = EXCLUDED.credits_passed,
    max_credits = EXCLUDED.max_credits,
    email = EXCLUDED.email,
    phone_number = EXCLUDED.phone_number,
    is_whatsapp_available = EXCLUDED.is_whatsapp_available,
    major = EXCLUDED.major,
    current_year_of_study = EXCLUDED.current_year_of_study,
    tos = EXCLUDED.tos,
    passport_issuing_country = EXCLUDED.passport_issuing_country,
    nationality = EXCLUDED.nationality,
    semester_applied_for = EXCLUDED.semester_applied_for,
    student_id = EXCLUDED.student_id,
    emergency_contact = EXCLUDED.emergency_contact,
    submitted_at = EXCLUDED.submitted_at,
    application_status = EXCLUDED.application_status,
    nomination_id = EXCLUDED.nomination_id;

INSERT INTO public.outboundapplication (
    application_id, update_id, first_name, last_name, gender, birthdate,
    passport_number, passport_expiry_date, civil_id_number, civil_id_expiry,
    gpa, expected_graduation_semester, credits_passed, phone_number,
    is_whatsapp_available, major, english_test_type, english_test_meets_requirement,
    english_106_completed, current_year_of_study, tos, university_id, nationality,
    passport_issuing_country, semester_applied_for, student_id, submitted_at,
    application_status
)
VALUES
    (
        990001, 990001, 'Seed', 'KU Student', 'Male',
        (CURRENT_DATE - interval '21 years')::date, 'TEST-OUT-990001',
        (CURRENT_DATE + interval '5 years')::date, 299001000001, (CURRENT_DATE + interval '5 years')::date,
        3.5, (CURRENT_DATE + interval '2 years')::date, 90, '+965 5555 0102',
        FALSE, 'Finance', 'IELTS', TRUE, NULL, 'Third year', TRUE,
        1, 89, 89, 990001, 990001, now() - interval '5 days', 'Submitted'
    ),
    (
        990002, NULL, 'Seed', 'KU Student', 'Male',
        (CURRENT_DATE - interval '21 years')::date, 'TEST-OUT-990002',
        (CURRENT_DATE + interval '5 years')::date, 299001000001, (CURRENT_DATE + interval '5 years')::date,
        3.5, (CURRENT_DATE + interval '3 years')::date, 90, '+965 5555 0102',
        FALSE, 'Finance', 'None', NULL, TRUE, 'Third year', FALSE,
        1, 89, 89, 990002, 990001, NULL, 'Draft'
    )
ON CONFLICT (application_id) DO UPDATE SET
    update_id = EXCLUDED.update_id,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    gender = EXCLUDED.gender,
    birthdate = EXCLUDED.birthdate,
    passport_number = EXCLUDED.passport_number,
    passport_expiry_date = EXCLUDED.passport_expiry_date,
    civil_id_number = EXCLUDED.civil_id_number,
    civil_id_expiry = EXCLUDED.civil_id_expiry,
    gpa = EXCLUDED.gpa,
    expected_graduation_semester = EXCLUDED.expected_graduation_semester,
    credits_passed = EXCLUDED.credits_passed,
    phone_number = EXCLUDED.phone_number,
    is_whatsapp_available = EXCLUDED.is_whatsapp_available,
    major = EXCLUDED.major,
    english_test_type = EXCLUDED.english_test_type,
    english_test_meets_requirement = EXCLUDED.english_test_meets_requirement,
    english_106_completed = EXCLUDED.english_106_completed,
    current_year_of_study = EXCLUDED.current_year_of_study,
    tos = EXCLUDED.tos,
    university_id = EXCLUDED.university_id,
    nationality = EXCLUDED.nationality,
    passport_issuing_country = EXCLUDED.passport_issuing_country,
    semester_applied_for = EXCLUDED.semester_applied_for,
    student_id = EXCLUDED.student_id,
    submitted_at = EXCLUDED.submitted_at,
    application_status = EXCLUDED.application_status;

INSERT INTO public.application_status_log (
    id, application_id, inbound_application_id, old_status, new_status,
    changed_by, changed_by_name, changed_at, reason
)
VALUES
    (
        990001, NULL, 990001, 'Draft', 'Submitted',
        '00000000-0000-4000-8000-000000000003', 'Seed KU Coordinator',
        now() - interval '7 days', 'Seed fixture submission'
    ),
    (
        990002, 990001, NULL, 'Draft', 'Submitted',
        '00000000-0000-4000-8000-000000000003', 'Seed KU Coordinator',
        now() - interval '5 days', 'Seed fixture submission'
    )
ON CONFLICT (id) DO UPDATE SET
    application_id = EXCLUDED.application_id,
    inbound_application_id = EXCLUDED.inbound_application_id,
    old_status = EXCLUDED.old_status,
    new_status = EXCLUDED.new_status,
    changed_by = EXCLUDED.changed_by,
    changed_by_name = EXCLUDED.changed_by_name,
    changed_at = EXCLUDED.changed_at,
    reason = EXCLUDED.reason;

SELECT setval(
    pg_get_serial_sequence('public.application_status_log', 'id'),
    GREATEST((SELECT max(id) FROM public.application_status_log), 1),
    TRUE
);

INSERT INTO public.feedback (id, details, edited, iapplicationid, oapplicationid)
VALUES
    (990001, 'Seed fixture feedback for the incoming exchange application.', FALSE, 990001, NULL),
    (990002, 'Seed fixture feedback for the outgoing exchange application.', TRUE, NULL, 990001)
ON CONFLICT (id) DO UPDATE SET
    details = EXCLUDED.details,
    edited = EXCLUDED.edited,
    iapplicationid = EXCLUDED.iapplicationid,
    oapplicationid = EXCLUDED.oapplicationid;

SELECT setval(
    pg_get_serial_sequence('public.feedback', 'id'),
    GREATEST((SELECT max(id) FROM public.feedback), 1),
    TRUE
);

COMMIT;
