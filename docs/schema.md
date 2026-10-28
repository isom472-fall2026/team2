# Student Exchange Portal — Semantic Business Layer

*Reference ERD Diagram:* [View the ERD](../public/images/ERD.png)

---

### 1. What a Row Means (Entity Semantics)

* **`Country`**: A recognized sovereign state and regional hub available for student nationality, passport issuance, or university hosting.
* **`exchange_cycle`**: A designated academic term and calendar year defining the official windows for nominations and student submissions.
* **`KUStudentAuth`**: An enrolled Kuwait University student profile bound to their institutional credentials for study-abroad eligibility.
* **`incomingstudentAuth`**: An international applicant profile authorized to log in and prepare an inbound exchange dossier.
* **`emergency_contact`**: An authorized personal safety contact on record to assist an incoming international student in critical events.
* **`PartnerUniversity`**: An overseas higher-education institution holding an active bilateral exchange agreement with the college.
* **`Coordinator`**: An accredited partner university representative authorized to nominate exchange candidates and manage partner workflows.
* **`studentnominations`**: A formal endorsement submitted by a partner coordinator sponsoring a foreign student for a designated cycle.
* **`InboundApplication`**: A complete exchange admissions dossier submitted by an incoming international applicant using an active nomination.
* **`OutboundApplication`**: A study-abroad placement application submitted by a Kuwait University student.
* **`OutboundApplication.civil_id_copy`**: Stores the private storage path for the student's uploaded Civil ID document.
* **`application_status_log`**: An audit record for exactly one inbound or outbound application, with the old and new statuses, actor, timestamp, and optional reason. A trigger snapshots the actor's name when the record is created.
* **`updates`**: A coordinator-authored notice containing non-empty details and its creation time. Applications may reference an update; deleting it clears those references.
* **`feedback`**: Non-empty feedback linked to exactly one inbound or outbound application, with its creation time and an edited flag.

---

### 2. Entity Relationships (Business Rules & Constraints)

* **`PartnerUniversity` -> `Country`**: Identifies the host nation where the partner institution operates (`ON DELETE SET NULL`).
* **`Coordinator` -> `PartnerUniversity`**: Binds a partner coordinator to their home institution (`ON DELETE CASCADE`).
* **`studentnominations` -> `Coordinator`**: Attributes each student nomination to the partner official who submitted it (`ON DELETE CASCADE`).
* **`studentnominations` -> `exchange_cycle`**: Anchors a nomination to a specific intake semester and deadline calendar (`ON DELETE CASCADE`).
* **`InboundApplication` -> `studentnominations`**: Validates that an incoming applicant holds an active coordinator nomination; a nomination can be used for at most one inbound application (`FOREIGN KEY`, `UNIQUE`).
* **`InboundApplication` -> `incomingstudentAuth`**: Ties an inbound dossier to the authenticated international applicant account (`ON DELETE SET NULL`).
* **`InboundApplication` -> `PartnerUniversity`**: Records the sending home institution from the coordinator who issued the linked nomination (`ON DELETE SET NULL`).
* **`InboundApplication` -> `exchange_cycle`**: Places the inbound dossier into the nomination's intake calendar and review period (`ON DELETE RESTRICT`).
* **`InboundApplication` -> `Country` (Nationality)**: Records the applicant’s legal citizenship for host-institution clearance (`ON DELETE SET NULL`).
* **`InboundApplication` -> `Country` (Passport Issuing)**: Identifies the government authority that issued the travel passport (`ON DELETE SET NULL`).
* **`InboundApplication` -> `emergency_contact`**: Connects the international applicant to a designated emergency contact (`ON DELETE SET NULL`).
* **`OutboundApplication` -> `KUStudentAuth`**: Ties a study-abroad dossier to the authenticated Kuwait University applicant account (`ON DELETE CASCADE`).
* **`OutboundApplication` -> `PartnerUniversity`**: Specifies the overseas host institution requested by the Kuwait University applicant (`ON DELETE SET NULL`).
* **`OutboundApplication` -> `exchange_cycle`**: Links the outbound dossier to the target exchange semester and evaluation window (`ON DELETE SET NULL`).
* **`OutboundApplication` -> `Country` (Nationality)**: Records the student's legal citizenship for foreign clearance and visa processing (`ON DELETE SET NULL`).
* **`OutboundApplication` -> `Country` (Passport Issuing)**: Identifies the issuing authority of the student's travel passport (`ON DELETE SET NULL`).
* **`InboundApplication` / `OutboundApplication` -> `updates`**: Optionally links an application to an update (`ON DELETE SET NULL`).
* **`application_status_log` -> `InboundApplication` / `OutboundApplication`**: Associates each audit row with exactly one application; deleting that application removes its log entries (`ON DELETE CASCADE`).
* **`feedback` -> `InboundApplication` / `OutboundApplication`**: Associates each feedback row with exactly one application; deleting that application removes its feedback (`ON DELETE CASCADE`).
* **`KUStudentAuth` -> `auth.users`**: Connects the institutional student record to Supabase authentication identity (`ON DELETE CASCADE`).
* **`incomingstudentAuth` -> `auth.users`**: Connects the international applicant record to Supabase authentication identity (`ON DELETE CASCADE`).
* **`Coordinator` -> `auth.users`**: Connects the partner coordinator record to Supabase authentication identity (`ON DELETE CASCADE`).
* **`Coordinator.email_accepted`**: KU coordinators are accepted at signup; partner coordinators start as access requests and remain blocked until a KU coordinator approves them.
* **`testing`**: Row `id = 1` controls testing mode and exposes credentials for synthetic demo accounts. Each additional row references exactly one public application-data row or uploaded object created while testing mode is enabled.

---

### 3. Row-Level Security Policies (Who, What & Why)

* **`country` / `"Anyone can read countries"` (SELECT)**: Anonymous and authenticated users may read country records so forms and dropdowns populate without authentication barriers.
* **`coordinator` / `"Users can register their coordinator profile"` (INSERT)**: Coordinators may create their own profile only when `user_id` and email match their authenticated identity.
* **`coordinator` / `"Users and KU coordinators can delete coordinator profiles"` (DELETE)**: Coordinators may delete their own record; KU coordinators may delete coordinator records.
* **`incomingstudentauth` / `"Users can register their incoming student profile"` (INSERT)**: Authenticated international applicants may create a profile only when `user_id` matches `auth.uid()`.
* **`incomingstudentauth` / `"Users can delete their incoming student profile"` (DELETE)**: Authenticated international applicants may delete only their own profile.
* **`kustudentauth` / `"Users can register their KU student profile"` (INSERT)**: Authenticated Kuwait University students may create a profile only when `user_id` matches `auth.uid()` and the email uses the KU domain.
* **`kustudentauth` / `"Users can delete their KU student profile"` (DELETE)**: Authenticated Kuwait University students may delete only their own profile.
* **`studentnominations` / `"Coordinators can create student nominations"` (INSERT)**: A coordinator may create nominations only when `coordinator_id` matches the coordinator profile linked to their authenticated user.
* **`studentnominations` / `"Coordinators can read student nominations"` (SELECT)**: Coordinators may view nominations assigned to their profile; KU coordinators may view all nominations.
* **`studentnominations` / `"Nominated students can read their nominations"` (SELECT)**: An authenticated incoming student may read only nominations addressed to their profile email so they can validate their Nomination ID.
* **`studentnominations.id`**: Each nomination uses a unique, randomly generated eight-digit identifier that coordinators share with the nominated student.
* **`studentnominations.nomination_status`**: New nominations default to `Active`; the database expiration function changes them to `Expired` when their exchange cycle end time has passed.
* **`inboundapplication` / incoming-student policies**: Authenticated students can read their own applications, create drafts only from their active nomination, update or submit their own drafts, and delete their own drafts. A unique student-and-cycle index prevents multiple applications in one exchange cycle, while coordinators cannot read drafts.
* **`inboundapplication` / partner coordinator progress (SELECT)**: Approved partner coordinators can read applications linked to their own nominations. This is row-level access, not column-level masking; progress clients should request only `nomination_id` and `application_status`.
* **`inboundapplication` drafts**: Drafts may omit names until the student completes them; submission requires first and last names. `submitted_at` records the submission time for the student receipt and PDF export.
* **`inbound-application-files` / incoming-student policies**: Uploaded application files are private and accessible only to the student who owns the linked draft application.
* **`exchange_cycle` / `"KU coordinators can update exchange cycles"` (UPDATE)**: KU coordinators may update exchange cycle details.
* **`exchange_cycle` / `"KU coordinators can delete exchange cycles"` (DELETE)**: KU coordinators may permanently delete exchange cycles. Linked student nominations are removed by the foreign-key cascade.
* **`exchange_cycle` / `"Users can read exchange cycles"` (SELECT)**: Authenticated KU students, incoming students, coordinators, and KU coordinators can read cycle dates so the portal can check application windows.
* **`application_status_log` / `"KU students and coordinators can read application status logs"` (SELECT)**: Application-owning students and KU coordinators may read status history.
* **`feedback` / feedback policies**: Anyone may read feedback; authenticated application authors may create and update feedback on their own applications, and only application authors or KU coordinators may delete it.
* **`updates` / update policies**: KU coordinators may create and delete updates. Update creation, changes, and deletion are also restricted to records registered for the active testing mode.
* **`testing` / mode and record policies**: Anyone may read only control row `id = 1`; KU coordinators change testing mode and save synthetic credentials through guarded functions. A trigger registers every inserted public-data or storage row while testing mode is active. Restrictive write policies block application-data and storage writes during maintenance and limit updates or deletes during testing to registered rows. Tracker rows are created by triggers and removed through the cleanup function.
* **`testing.test_accounts`**: This field contains runtime-generated credentials for synthetic accounts and is intentionally public so visitors can switch roles without entering credentials. Setup creates a KU student with an outbound application, an incoming student with a nomination and inbound application, a partner coordinator, and a second KU student without an application. These accounts are limited by RLS to testing records; no real account credentials belong here.
* **`testing` / cleanup**: Ending testing mode removes tracked application rows, generated Auth profiles/accounts, and tracked uploads. Upload bytes are removed through the Supabase Storage API before database cleanup completes.