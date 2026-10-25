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
* **`KUStudentAuth` -> `auth.users`**: Connects the institutional student record to Supabase authentication identity (`ON DELETE CASCADE`).
* **`incomingstudentAuth` -> `auth.users`**: Connects the international applicant record to Supabase authentication identity (`ON DELETE CASCADE`).
* **`Coordinator` -> `auth.users`**: Connects the partner coordinator record to Supabase authentication identity (`ON DELETE CASCADE`).
* **`Coordinator.email_accepted`**: KU coordinators are accepted at signup; partner coordinators start as access requests and remain blocked until a KU coordinator approves them.

---

### 3. Row-Level Security Policies (Who, What & Why)

* **`Country` / `"anyone can read"` (SELECT)**: Both anonymous and authenticated users may read country records so forms and dropdowns populate without authentication barriers.
* **`Coordinator` / `"signup"` (INSERT)**: Authenticated partner coordinators may create their own profile only when `user_id` matches `auth.uid()` to prevent profile spoofing.
* **`Coordinator` / `"Enable delete for coordinators"` (DELETE)**: Authenticated partner coordinators may delete only their own record to support self-service account removal without exposing peer data.
* **`incomingstudentauth` / `"Signup"` (INSERT)**: Authenticated international applicants may create their profile only when `user_id` matches `auth.uid()` to prevent impersonation.
* **`incomingstudentauth` / `"Enable delete for incoming students"` (DELETE)**: Authenticated international applicants may delete only their personal record during self-service account termination.
* **`kustudentauth` / `"Signup"` (INSERT)**: Authenticated Kuwait University students may create their profile only when `user_id` matches `auth.uid()` to enforce identity integrity.
* **`kustudentauth` / `"Enable delete for Ku students"` (DELETE)**: Authenticated Kuwait University students may delete only their personal record during self-service account removal.
* **`studentnominations` / `"Enable insert for coordinators"` (INSERT)**: A coordinator may create nominations only when `coordinator_id` matches the coordinator profile linked to their authenticated user.
* **`studentnominations` / `"Enable read access for coordinators"` (SELECT)**: Partner coordinators may view nominations assigned to their own coordinator profile; KU coordinators may view all nominations.
* **`studentnominations` / `"Nominated students can read their nominations"` (SELECT)**: An authenticated incoming student may read only nominations addressed to their profile email so they can validate their Nomination ID.
* **`studentnominations.id`**: Each nomination uses a unique, randomly generated eight-digit identifier that coordinators share with the nominated student.
* **`studentnominations.nomination_status`**: New nominations default to `Active`; the database expiration function changes them to `Expired` when their exchange cycle end time has passed.
* **`inboundapplication` / incoming-student policies**: Authenticated students can read their own applications, create drafts only from their active nomination, update or submit their own drafts, and delete their own drafts. A unique student-and-cycle index prevents multiple applications in one exchange cycle, while coordinators cannot read drafts.
* **`inboundapplication` / partner coordinator progress (SELECT)**: Approved partner coordinators can read applications linked to their own nominations. This is row-level access, not column-level masking; progress clients should request only `nomination_id` and `application_status`.
* **`inboundapplication` drafts**: Drafts may omit names until the student completes them; submission requires first and last names. `submitted_at` records the submission time for the student receipt and PDF export.
* **`inbound-application-files` / incoming-student policies**: Uploaded application files are private and accessible only to the student who owns the linked draft application.
* **`exchange_cycle` / `"coordinators can update exchange cycles"` (UPDATE)**: Authenticated users with a coordinator profile may update exchange cycle details.
* **`exchange_cycle` / `"coordinators can delete exchange cycles"` (DELETE)**: Authenticated users with a coordinator profile may permanently delete exchange cycles. Linked student nominations are removed by the foreign-key cascade.
* **`exchange_cycle` / `"Users can read exchange cycles"` (SELECT)**: Authenticated KU students, incoming students, coordinators, and KU coordinators can read cycle dates so the portal can check the application window for a nomination.