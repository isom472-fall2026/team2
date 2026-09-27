 
## 1. The client, and how you reach them
 
The Student Exchange Office under the Vice President for Academic Affairs (VPAA) at Kuwait University and the Office of the Student Exchange Progam at CBA. Our contact is Dr. Kamel Rouibah and Ms. Areej Alkanderi, who coordinate outbound exchange applications for the College of Business Administration (CBA) and all of CBA students and perhaps beyond who want to go out, and also all incoming students from partner universities. One of our team members is a student who applied for an exchange semester last year.
 
---
 
## 2. What happens today, and what goes wrong
 
Students interested in outbound exchange submit their initial documents (unofficial transcript, English proficiency score, and program preference) via email or on a paper form brought directly to the office.
 
The office staff manually copy these details into a local Excel spreadsheet and word documents. During busy registration weeks, emails get buried, and applications are occasionally mistaken. More critically, eligibility checks (such as verifying the student has passed at least 60 credits, completed four semesters, and maintains a minimum GPA of 3.0) are calculated manually. an employee said before that sometimes unqualified applications make it to the interview stage before staff notice they are ineligible, wasting precious interview slots and delaying approvals for qualified students.
 
---
 
## 3. Who is better off, and how you would know
 
The exchange program coordinators, who will stop manually screening ineligible applications, and the ambitious KU students awaiting feedback and students from partner universities who complain about the lack of clear info or application structures to come to KU.
 
The main metric is the number of unqualified applicants who proceed to the interview phase, and the average turnaround time (in days) to notify a student of their eligibility status. The digitization of all exchange program applications on BOTH ends. Dr. Kamel has previously given a go ahead on this project, and is willing to cooperate on anything required for it.
 
---
 
## 4. What the system does, in outline
 
* Register an Application: Student enters name, ID, GPA, completed credits, completed semesters, English score, and 3 preferred partner universities.
 
* Filter and Sort: Show today's applications, sorted by GPA (since selection is competitive and GPA-based).
 
* Automated Screening: Automatically flag applications that do not meet the core criteria (GPA below 3.0, or credits below 60, or semesters below 4).
 
* Update Status: Mark an application as *Ineligible*, *Pending Interview*, or *Approved for Nomination*.
 
* History Log: Display a log of past approved students sorted by the semester they traveled, so coordinators can easily track academic cohorts.
 
* Inbound Nomination Portal: Verified partner coordinators can log in to submit and sponsor incoming student nominations from their home institution directly into the KU queue.
 
---
 
## 5. What it records
 
| Thing | What it holds |
|---|---|
| **Student** | Name, Student ID, KU Email, Major College, Phone |
| **Application** | GPA, Credits Completed, Semesters Completed, English Score, Host University Preferences, Current Status (*Ineligible* · *Pending* · *Approved*) |
| **Action Log** | Date of status change, and which staff member processed the decision |
 
One student can submit only one active application per cycle. Every change of state logs the staff member who made the modification.
 
---
 
## 6. In scope by the final week — and what is not
 
**Working by the final week:** The digital application form, the coordinator's dashboard with GPA sorting, automatic eligibility flags (credits, semesters, and GPA thresholds), and status updates. Staff sign in using a mock KU single-sign-on (SSO) email and password.
 
**Deliberately not:** Integrating directly with the official banner registration system (Portal), validating actual transcripts via PDF OCR, processing airline ticket vouchers (Kuwait Airways) or living expense stipends, and handling incoming/inbound international student applications. Everything will be mock-validated within our local sandbox application. and adding it to the KU domain.
 
---
 
## 7. After the semester
 
The Student Exchange Office can run this portal on an iPad or PC at their desk in Shaddadiyah; it is lightweight and costs nothing to host on a free cloud tier at this volume. The source code will remain public on GitHub, allowing the next student IT cohort, or any developer hired by the University, to scale it. If they outgrow it, Dr. Anwar has a living, functional prototype of exactly what his office needs, making it much easier to hand off to the university's central IT department (Center for Information Technology).
 
---
 
## 8. What you told the client this is
 
We clearly communicated that this is a student project for ISOM 472, built by 6 students over one semester. We clarified that the codebase is completely public, and we will absolutely not use real student civil IDs or personal phone numbers during our development and testing phases and that the database will be 100% secure upon deployment. We also emphasized that after the final week of December, we are not contracted or paid to maintain or fix the application. it has been fully understood these boundaries and requested that the interface remain "simple and clean," so even the student workers at the front desk can navigate it effortlessly.