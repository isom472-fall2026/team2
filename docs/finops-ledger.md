# FinOps ledger

What the AI work cost you, and what you changed because of it.

This ledger lives in the repository and is committed. It is never kept in a spreadsheet, a
chat thread, or anywhere else. It is checked as **present and current** — it is not scored
on how accurate the numbers are. An honest rough figure beats a precise invented one.

The FinOps Lead keeps it. Every member supplies their own rows.

## The plan — written in Phase 2

*We do not feel limited as we have found a free student plan that allows for a very high limit on advanced coding models, at anyways we will include our usages and token counts*

| Kind of work | What we use | Why |
|---|---|---|
| writing stories from the proposal | KU account Gemini Enterprise | it is free and no code is involved |
| building a story | Antigravity + VS code agents | it edits the files directly |

Our limit: 6 Million tokens per month + 10000 tokens per week compounded into 50 thousand extra per month

## Phase 2

| Story | Assistant used | What it used (tokens, requests, or your own estimate) | What we gave it (files, story, schema) | What we would do differently |
|---|---|---|---|---|
|updated RLS, implemented edit and delete nominations and cycles, showed nomination history to concerned coordinator [#45](https://github.com/isom472-fall2026/team2/issues/45) |GPT Luna + Antigravity | 123.21K |Schema + Story Description | Nothing |
|KU coordinator can edit exchange cycle details and delete exchange cycle [#44](https://github.com/isom472-fall2026/team2/issues/44)| GPT Luna + Antigravity | 42K | Story Description | Nothing |
|Change portal UI [#36](https://github.com/isom472-fall2026/team2/issues/36)| GPT Luna + Antigravity | 2K | Description of the issue that existed | Nothing |
|Start New Exchange Cycle [#33](https://github.com/isom472-fall2026/team2/issues/33)| GPT Luna + Antigravity | 35.4K Tokens | Story Description | Nothing |
|System can verify KU students and coordinators are real  [#22](https://github.com/isom472-fall2026/team2/issues/22) | GPT Luna + Antigravity | 6K | Story Description | Nothing |
|A university employee coordinator can access a portal to nominate students [#21](https://github.com/isom472-fall2026/team2/issues/21)| GPT Luna + Antigravity | 66.9K Tokens | Story Description | Nothing |
|Edit or Delete Nominations [#45](https://github.com/isom472-fall2026/team2/issues/45)| GPT Luna + Antigravity | 159.9K Tokens | Story Description | Nothing |
| Prototype (UI) | Claude + Antigravity | Estimate: about 20-30 prompts over several hours | Project proposal and the university website as a visual reference | The top bar took several extra prompts.a screenshot or clear spec of it (layout, items, colors) up front. |
| [#27](https://github.com/isom472-fall2026/team2/issues/27) Nationality-based visa |  Antigravity + agent | Estimate: 70000tokens/ 2prompt | Story description | a slight change in layout|
| [#28](https://github.com/isom472-fall2026/team2/issues/28) Real-time outbound verification (NOT COMPLETE YET) | antigravity+ agent | Estimate: 60000tokens | Story description  | State the verification flow clearly before prompting. |
| [#47](https://github.com/isom472-fall2026/team2/issues/47) validate gpa usage not exceed 4.0 | antigravity + agent | Estimate: 47800tokens | Story description | it did it correctly, |
| Visa and Nationality Checker [#27](https://github.com/isom472-fall2026/team2/issues/27) | GPT and Antigravity | 507.9K Tokens | No Db data and a lot of prompts regarding the requirements | Nothing, it achieved the required task better than expectations |
| Maintenance Mode [#62](https://github.com/isom472-fall2026/team2/issues/62) | GPT and Antigravity | 180.23K Tokens | maintenance mode column in coordinator table | would have found a way to hard reset after every reload (Ctrl + F5) |
| KU student can sign up and log in to the portal [#19](https://github.com/isom472-fall2026/team2/issues/19) | mais-code agent | 34K Tokens | KU student table and auth table | None |
| Incoming can sign up and log in to the portal [#20](https://github.com/isom472-fall2026/team2/issues/20) | mais-code agent | 20K Tokens | incoming student table and auth table | None |
| Users can delete their accounts from the portal [#23](https://github.com/isom472-fall2026/team2/issues/23) | GPT Luna | 41K Tokens | KU student table and incoming student table and coordinator table and auth table | None |
| Explore Partner University Directory & Details [#25](https://github.com/isom472-fall2026/team2/issues/25) | GPT Luna | 210K Tokens | Partner universities table schemas and its RLS policies | None |
| Interactive World Map & Nearest Airport Lookup [#26](https://github.com/isom472-fall2026/team2/issues/26) | GPT Luna and Antigravity | 123K Tokens | Partner universities table schemas and its RLS policies + MapBox UI Public API key | None |
| Switch Between Light and Dark Mode [#38](https://github.com/isom472-fall2026/team2/issues/38) | GPT Luna and Mais-code agent | 90K Tokens | whole frontend code | None |
| Coordinator Accepts System Invitation [#37](https://github.com/isom472-fall2026/team2/issues/37) | GPT Luna and Mais-code agent | 23K Tokens | whole frontend code | None |
| No home screen button [#48](https://github.com/isom472-fall2026/team2/issues/48) | GPT Luna and Mais-code agent | 9K Tokens | None | None |
| Adjust nominations to give out a bigger id [#50](https://github.com/isom472-fall2026/team2/issues/50) | GPT Luna and Mais-code agent | 2K Tokens | Student nominations table primary key column | None |
| Nominations must expire to ensure they dont get reused ever [#51](https://github.com/isom472-fall2026/team2/issues/51) | GPT Luna and Mais-code agent | 14.26K Tokens | Student nominations table columns and exchange cycle table | None |
|  |  |  |  |  |

## Phase 3

| Story | Assistant used | What it used (tokens, requests, or your own estimate) | What we gave it (files, story, schema) | What we would do differently |
|---|---|---|---|---|
| Blog "Record exact token usage" | GPT Luna | 58.1K Tokens | the method that student needs to follow | Nothing |
| Start Outbound Student Exchange Application [#32](https://github.com/isom472-fall2026/team2/issues/32) | GPT Luna 6 | 342.51K Tokens (out of a 700K token session) | Outbound application table columns and exchange cycle table | None |
| KU Student exports their submitted outgoing application as a PDF [#74](https://github.com/isom472-fall2026/team2/issues/74) | GPT Luna 6 | 80.2K Tokens (out of a 700K token session) | Outbound application table columns and exchange cycle table | None |
| KU Student’s application changes are saved automatically [#77](https://github.com/isom472-fall2026/team2/issues/77) | GPT Luna 6 | 277.29K Tokens (out of a 700K token session) | Outbound application table columns | None |
| Incoming student can view submitted application and status [#95](https://github.com/isom472-fall2026/team2/issues/95) | Copilot SDK in VS Code | 8.21K tokens | Inbound application summary, status, submission date, and document details; issue description | Have an authenticated incoming-student account available for end-to-end verification. |
| KU student can view submitted application and status [#94](https://github.com/isom472-fall2026/team2/issues/94) | Copilot SDK in VS Code | 2K tokens | Outbound application details and status; issue description | Have an authenticated KU-student account available for end-to-end verification. |
| Inbound Student Exchange Application [#34](https://github.com/isom472-fall2026/team2/issues/34) | Copilot SDK in VS Code | 110K tokens | Outbound application flow as a reference, inbound application fields, and `db/schemanew.sql` | Verify the nomination-to-submission flow with an authenticated incoming-student account. |
| Incoming student can export their application as a PDF [#93](https://github.com/isom472-fall2026/team2/issues/93) | Copilot SDK in VS Code | 73K tokens because new pdf visualizing package was added | Inbound application summary and submitted documents; outbound PDF implementation as a reference | Test the generated PDF with real submitted attachments and an authenticated account. |
| Incoming student applications are saved automatically [#92](https://github.com/isom472-fall2026/team2/issues/92) | Copilot SDK in VS Code | 14K tokens | Inbound application form, draft-saving flow, and `db/schemanew.sql` | Test draft save, reload, and coordinator visibility with authenticated accounts. |
| KU student requests to withdraw their application [#109](https://github.com/isom472-fall2026/team2/issues/109) | GPT Luna and Mais-code agent | 72.2K Tokens | Outboundapplication and coordinator | None |
| KU student requests to withdraw their application [#87](https://github.com/isom472-fall2026/team2/issues/87) | GPT Luna | 69.12K Tokens | inboundapplication and coordinator | None |
| Implement Zustand store and Ensure updated libraries and availability [#108](https://github.com/isom472-fall2026/team2/issues/108) | GPT Luna and Mais-code agent | 12.5K Tokens | Outboundapplication and coordinator | None |
| KU Coordinator Views Historical Application Log [#39](https://github.com/isom472-fall2026/team2/issues/39) | GPT Luna and Mais-code agent | 93.41K Tokens | Outboundapplication and inbound and coordinator | None |
| Coordinator exports a student’s application as a PDF
 [#73](https://github.com/isom472-fall2026/team2/issues/73) | GPT Luna agent | 31.77K Tokens | Outboundapplication and inbound and coordinator | None |
 | Partner coordinator sees whether each nominee has applied [#107](https://github.com/isom472-fall2026/team2/issues/107) | GPT Luna agent | 20.8K Tokens | inbound application only | None |
  | KU coordinator can review application withdrawals and accept or reject them [#110](https://github.com/isom472-fall2026/team2/issues/110) | GPT Luna agent | 33.53K Tokens | inbound application and outbound application | None |
  | Coordinator is signed out after inactivity [#106](https://github.com/isom472-fall2026/team2/issues/106) | GPT Luna agent | 10.22K Tokens | coordinator table | None |
| Drafts rejected when applications close [#116](https://github.com/isom472-fall2026/team2/issues/116) | GPT Luna agent | 4.1K Tokens | application tables | None | 
| Coordinator edits their own account details [#118](https://github.com/isom472-fall2026/team2/issues/118) | GPT Luna agent | 91.4K Tokens | application tables | None | 
|  |  |  |  |  |

## Phase 4

| Story | Assistant used | What it used (tokens, requests, or your own estimate) | What we gave it (files, story, schema) | What we would do differently |
|---|---|---|---|---|
|  |  |  |  |  |

## Phase 5

| Story | Assistant used | What it used (tokens, requests, or your own estimate) | What we gave it (files, story, schema) | What we would do differently |
|---|---|---|---|---|
|  |  |  |  |  |

## Phase 6

| Story | Assistant used | What it used (tokens, requests, or your own estimate) | What we gave it (files, story, schema) | What we would do differently |
|---|---|---|---|---|
|  |  |  |  |  |
