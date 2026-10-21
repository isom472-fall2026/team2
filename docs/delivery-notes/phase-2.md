
# Phase 2 delivery note

## What was delivered
The system supports three user groups: outbound KU students(Ahmad), incoming international exchange students(Sarah), and exchange program coordinators(Areej).
All three user groups can register accounts, sign in, and delete their profiles, with account data stored in `KUStudentAuth`, `incomingstudentAuth`, and `Coordinator`.
Coordinators can create, edit, and delete exchange cycle schedules, which are stored in `exchange_cycle`.
Coordinators can also submit, update, and delete student nominations, which are stored in `studentnominations`.Students can browse partner universities and see them on an interactive map with the nearset airport. and The portal works in light and dark mode.


## Who did what
| Name | Wrote | Assigned to build (Phase 3) |
|---|---|---|
| Almaha Alajmi | #32 #33 | |
| Aysha Jan | #25 #26 #27 #28 #47 ||
| Rawan Abdrabou | #37 #39 ||
| Hadi Haidar | #19 #20 #21 #22 #23 | |
| Yousef Almohammed | #44 #45 |  |
| Fatma Alsammari | #34 #38 #62 |  |

Some of the programming was done by several team members on Hadi's laptop. Hadi is the Build Lead and in charge of the logic, and his AI agents already had the full context of the project's features and access control. Working there saved tokens that would otherwise go to analysis and exploration.

## The eleven things

| | Done | Where it is |
|---|---|---|
| Personas | ☑ | [docs/personas.md](../personas.md) |
| User stories with testable acceptance criteria | ☑ | [Issues tab](https://github.com/isom472-fall2026/team2/issues) (19 stories: 15 done, 4 open) |
| Backlog copy saved at the phase tag | ☑ | [docs/backlog.md](../backlog.md) |
| Database schema documented and committed | ☑ | [db/schema.sql](../../db/schema.sql) and [docs/schema.md](../schema.md) |
| Row Level Security (RLS) turned on for every table | ☑ | [docs/schema.md](../schema.md#3-row-level-security-policies-who-what--why) |
| Seed data in Supabase | ☑ | Supabase project |
| HTML prototype and screen list | ☑ | [prototype/README.md](../../prototype/README.md) |
| Split of work across all team members | ☑ | see "Who did what" table above |
| Token plan | ☑ | [docs/finops-ledger.md](../finops-ledger.md) |
| First entry in the FinOps ledger | ☑ | [docs/finops-ledger.md](../finops-ledger.md) |
| Tag cut for this phase | ☑ | `phase-2` (created after pull request #71 merged) |


## The tag cut for this phase

`phase-2` , created by Almaha after pull request #71 merged.


## Anything not finished, and where it went
  
Phase 2 Stories Postponed to Phase 3:
- #28 Real-Time Outbound Eligibility Verification
- #32 Start Student Exchange Application
- #34 Inbound Student Exchange Application
- #39 Coordinator Views Historical Application Log
    

 

 



     
