# Phase 5 fixes — issue #172

Owner: hadi, as assigned in [#172](https://github.com/isom472-fall2026/team2/issues/172). Branch: `phase5-fixes`.

## Requirements recorded on 2026-11-20

Incoming applicants submit a CV and English evidence: IELTS, TOEFL, or a competence letter from the dean, vice dean or head of department. Outgoing applicants submit a CV. The student building this story confirmed these files must be present before submission.

The incoming criminal-record certificate is optional initially. Approval before embassy-stamp verification is conditional. Unconditional approval requires the uploaded certificate and the KU coordinator's confirmation that its Kuwaiti embassy stamp was checked. A conditional applicant can upload the certificate from their application receipt without reopening the rest of the application. The health-insurance checkbox tells the applicant to contact the Kuwaiti embassy in their country after conditional approval; it is not stored as an application answer.

The request is recorded in #172. A named Client Lead's dated approval and a link to the client's written evidence have not been supplied. These remain pending in [scope-changes.md](scope-changes.md); this document does not grant approval or assessment marks.

## Database installation and migration

For a fresh Supabase test project, run `db/schema.sql` with an empty application schema. Supabase supplies `auth`, `storage`, `anon` and `authenticated`; enable the project's `pg_cron` support. The maintenance helper is defined before its first caller. New columns and constraints live in the original `CREATE TABLE` definitions.

For an existing database at the previous main schema, apply **the complete** `db/migrations/172_phase5_fixes.sql` once, before deploying this frontend. Its `ALTER TABLE` statements add the columns; the rest updates the approval/edit RPCs, required-document triggers and certificate storage policies. Applying only the column statements does not implement the feature. Existing submissions remain intact. Old `Accepted`/`Approved` incoming applications display conditional approval until the coordinator verifies the certificate. No migration has been applied to the team's live project by this work.

The migration was tested against main commit `9638821f400b33442d5091ed8be26dddb6d0e6db`. A fresh schema and the migrated schema had identical columns, constraints, function definitions, policies and triggers. Testing used disposable PostgreSQL 17.5 with pg_cron and minimal Supabase Auth/Storage scaffolding. It exercised SQL and RLS, not the hosted Auth or Storage HTTP services.

Run the rollback-only checks against a disposable project after schema installation or migration:

```sh
psql "$PHASE5_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f db/tests/172_phase5_fixes.sql
node --test tests/phase5-documents.test.mjs
npm run build
```

The SQL file creates invented fixtures and rolls them back. It needs a database owner connection and an otherwise empty application dataset; do not run it on the team's live data. SQL-only lookup seeds create drafts because SQL cannot upload Storage file bytes. Testing-mode setup uploads invented PDF evidence and CVs before submitting its example applications.

The existing lookup seed script currently fails earlier at its unlinked `updates` insert (`updates_one_subject`); that separate error is unchanged, so use the isolated fixtures for these checks.

## Browser regression checks

On 2026-11-20 the actual React components were exercised in a local harness with synthetic accounts and an in-memory Supabase substitute. Database authorization was checked separately by the SQL tests above. This is local verification, not a claim of hosted end-to-end testing.

| Requirement | Check and observed result |
|---|---|
| English evidence | Incoming academic step refused an empty type, then refused a missing file. Selecting University letter and uploading a synthetic PDF allowed progress. |
| Incoming CV and health notice | Missing CV blocked progress. After CV upload, an unchecked embassy acknowledgement blocked progress. Checking it allowed progress. |
| Optional criminal certificate | Incoming application submitted with CV and English evidence, without a criminal-record file. |
| Document visibility | Incoming receipt listed the CV and English evidence. Coordinator review rendered CV, English evidence and later criminal-record PDF previews. |
| Conditional approval | Coordinator granted conditional approval without a criminal-record file; the receipt showed conditional approval and the later certificate-upload form. |
| Unconditional approval guard | With no certificate, confirmation and stamp checkbox were disabled. After certificate upload, confirmation stayed disabled until the coordinator checked the stamp-verification box. |
| Certificate after decision | Conditional student uploaded a certificate and saved it for review; approval remained conditional. Coordinator then granted unconditional approval. Both header and submitted details showed unconditional approval. |
| Outgoing CV | Missing CV blocked the documents step. Uploading a synthetic CV allowed progress to the terms step. |
| #144 validation | Coordinator edit rejected an empty first name and a GPA of 5 with maximum 4; edits were cancelled without creating a version. |
| #146 instruction | Coordinator CBA subjects tab explicitly said a KU Microsoft account is required. Missing-extension state kept import disabled. |
| SQL authorization | Student approval attempts, another student's certificate attachment, nonexistent files, post-approval CV uploads and post-unconditional certificate uploads were refused. Attached certificate deletion and client access to testing backups were blocked. |
| Versioned edits | Incoming edits changed evidence type and replaced documents; subsequent edits retained them. Outgoing edits replaced and retained the CV. |

Issue bodies #143 and #144 now include missing/wrong-value checks. #98 includes an empty-search/reset check; #100 includes a blank-GPA-bounds check. The new criteria remain unchecked for the teammate's review.

The production build and all three document/approval helper tests pass. Targeted ESLint reports only unused-variable diagnostics for JSX components: the existing configuration does not count JSX references as uses. Compared with main, the only additional diagnostics name the new components where they are rendered; no configuration or unrelated files were changed to suppress them.

## Reproduce the #146 importer check

1. In a disposable Supabase project, use a KU coordinator account approved for university `4`. Keep testing mode off for the import, so cleanup cannot be confused with the saved catalog.
2. In Chrome or Firefox, open the coordinator portal's **CBA subjects** tab. Without the importer extension, confirm that the page identifies the missing extension and disables import.
3. Use the page's browser-store link to install the matching importer extension. Reload the portal and confirm the installed state is shown. Edge is currently unavailable in the existing UI.
4. Confirm the KU Microsoft requirement is visible before starting. Click **Import subjects from the CBA site** and keep the portal open.
5. In the new CBA tab, the account holder signs in with their KU Microsoft account and completes any MFA. Keep both tabs open. Record browser/extension versions and the date, without recording credentials or MFA codes.
6. Confirm the import progresses and finishes. Compare several course codes, names, departments and descriptions with the CBA source. Open an imported syllabus and compare it with its source file.
7. Repeat the import; verify the same course codes are updated without duplicate subject rows. Check that empty search with All departments restores the saved catalog (#98).
8. With a nominated incoming test account, open the subject catalog and a syllabus. With an unrelated signed-in role, confirm the coordinator import action is unavailable.

Record the result, imported count, sample course codes and a screenshot showing the result. Live Microsoft sign-in, a complete import and this cross-role hosted check remain for an account holder; they were not performed in the isolated harness.

## Separate persona accounts

Use the existing **Testing mode** setup from a dedicated KU coordinator test account. It creates separate Auth users for the partner coordinator, nominated incoming student with a submitted application, nominated incoming student without an application, KU student with an application and KU student without an application. The owning KU coordinator remains a separate account. Do not reuse one Auth user across personas. The setup now supplies the newly required synthetic documents for submitted applications.

Emma Wilson is the additional incoming account with an active nomination for the open test semester and no application, including no draft. Her Nomination ID appears on her testing-account button; use it to start an application after switching to her account. Jane Smith's submitted incoming application remains available as the separate review scenario. Existing testing sessions gain the extra account when testing mode is ended and started again. Both incoming profiles and nominations use the existing test registry and cleanup.

In the disposable project, switch through every generated role, verify each portal and its allowed actions, then end testing mode as the owning KU coordinator. Confirm test files/accounts are removed and backed-up records restored. The SQL regression checks use separate synthetic user IDs for incoming, another incoming student, KU student, partner coordinator and KU coordinator. Hosted account creation, switching and cleanup remain a human verification item.

## Phase 2 plan review — draft for the FinOps Lead

The following is based only on the existing ledger. The FinOps Lead should review and paste the agreed text into the Phase 5 ledger. AGENTS.md reserves that file for the team.

```md
### Phase 2 plan review

Our Phase 2 plan assigned story drafting to the KU Gemini Enterprise account and implementation to Antigravity and VS Code agents. The ledger shows implementation continuing through Antigravity and VS Code/Copilot agents, with later Phase 5 work also using GPT-6.2 Sol. The implementation approach therefore continued broadly, while the recorded tools and models varied. The ledger does not establish which tool drafted every later story, so we cannot claim that part of the plan was followed throughout.

Using repository-editing assistants remained suitable for implementation, but our original allowance was written in token units while later records also use prompts and weekly-limit percentages. These measures cannot establish whether the original allowance was met. Earlier estimates should stay labelled as estimates; future entries should record observed usage, validation and the team's changes consistently.

Review approval: pending the FinOps Lead's name and date. Assessment and marks: pending the authorized assessor; none awarded in this draft.
```

## Handoff still requiring people

- Client Lead: attach dated written client approval and record the scope/capacity decision for applicable changes.
- FinOps Lead: review and enter the Phase 2 plan review in `docs/finops-ledger.md`.
- Assessor: record the review and award any marks in the Phase 5 assessment.
- Account holder/reviewer: perform the hosted import and separate-persona smoke checks above, apply the reviewed migration, and record results.
- Student: review the diff, fill the independent-work part of the AI-Assisted line, and open/push the branch and PR. The assistant has not pushed, merged or created a PR.
