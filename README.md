# Student Exchange Portal
### Team 2 — Orange Juice

Client: Student Exchange Office under the Vice President for Academic Affairs (VPAA) and CBA (Dr. Kamel Rouibah and Ms. Areej Alkanderi).

A web-based portal that automates student exchange application intake, evaluates academic eligibility criteria, and streamlines coordinator review.

Where we are: Phase 2, the design sprint
 is being delivered. Phase 3, our first working increment, is due on Wednesday 21 October.
 The rules and phase requirements are in `docs/how-we-work.md`. 
This line gets updated at the start of every phase, because it is the first thing the team reads.
 

- Proposal page: https://isom472-fall2026.github.io/team2/docs/proposal.html
- Running system: https://isom472-fall2026.github.io/team2/
- Board: https://github.com/orgs/isom472-fall2026/projects/

## Where do I go?

| I need to… | Go to |
|---|---|
| set up my laptop, the page and Supabase — do this first | [docs/setup.md](docs/setup.md) |
| know how we work — branches, reviews, the rules | [docs/how-we-work.md](docs/how-we-work.md) |
| write something the system must do | Issues tab → **New issue** → *User story* |
| report something broken | Issues tab → **New issue** → *Bug* |
| see what is being worked on now | the Project board (link above) |
| write the proposal | [docs/proposal.md](docs/proposal.md) |
| write down who the users are | [docs/personas.md](docs/personas.md) |
| see what the team agreed to | [docs/team-agreement.md](docs/team-agreement.md) |
| record what the AI cost us | [docs/finops-ledger.md](docs/finops-ledger.md) |
| write the note for this phase | [docs/delivery-notes/](docs/delivery-notes/) |
| get unstuck | [docs/how-we-work.md](docs/how-we-work.md#when-you-are-stuck) |

`AGENTS.md` holds the same rules, written for your AI assistant. You do not need to read
it. Do not delete it.

## The team

| Role | Name | What they hand in |
|---|---|---|
| Client Lead | Almaha alajmi | the backlog of user stories |
| Design Lead | Aysha Jan | the prototype and the screen list |
| Data Lead | Rawan Abdrabou | the schema and seed data in Supabase |
| Build Lead | Hadi Haidar | the running system and release notes |
| FinOps Lead | yousef almohammed | the ledger |
| Quality Lead | Fatma Alsammari | bug issues, each closed as fixed, will-not-fix or not-a-bug |

At six members, every role is held by one person. At five, one person holds a combined
Quality and FinOps Lead. **At four there is no FinOps or Quality Lead at all:** whoever is
Phase Lead that phase also keeps that phase's ledger entry and files its bug issues, so both
duties rotate with the lead.
The **Phase Lead** rotates — one per phase. That phase's Lead writes the delivery note and
cuts the tag.

| Phase | Phase Lead | Due |
|:---|:---|:---|
| 1 — team, environment, proposal | Rawan Abdrabou | Wed 23 Sep |
| 2 — design sprint | Almaha Alajmi | Wed 7 Oct |
| 3 — sprint 1 | TODO | Wed 21 Oct |
| 4 — sprint 2 | TODO | Wed 4 Nov |
| 5 — sprint 3 | TODO | Wed 18 Nov |
| 6 — final sprint | TODO | Wed 9 Dec |

## What is in this repository

| Path | What it holds |
|---|---|
| `README.md` | This page — the front page of your team, kept current. |
| `AGENTS.md` | The same working rules, written for your AI assistant. |
| `.gitignore` | What must never reach this public repository. |
| `.github/` | The templates for pull requests and issues. |
| `docs/setup.md` | Your laptop, your GitHub identity, your public page, Supabase. |
| `docs/how-we-work.md` | How the team works. Read this once, in week 2. |
| `docs/team-agreement.md` | What each member committed to. Signed in Phase 1. |
| `docs/personas.md` | The two to four people who will use the system. |
| `docs/proposal.md` | The judged proposal, in eight sections. |
| `docs/index.html` | The published proposal page, served by GitHub Pages. |
| `docs/backlog.md` | A copy of the open stories, saved at the end of each sprint. |
| `docs/prompts.md` | Prompts you can copy into your AI assistant. |
| `docs/finops-ledger.md` | One section per sprint: the model you chose and what it cost. |
| `docs/delivery-notes/` | One note per phase, `phase-1.md` … `phase-6.md`. |
| `prototype/` | The Design Lead's HTML prototype and the screen list. |

The repository root is deliberately left free of an `index.html` — that address belongs to
your running system later in the course.

## Working rules

The short version. The full version is [docs/how-we-work.md](docs/how-we-work.md).

- One branch per story, named after its story number: `14-duplicate-orders`.
- Nobody merges their own work. A teammate reads it and says what they checked.
- The Client Lead accepts.
- Every pull request declares AI use.
- Every student commits under their own account.

The story number is the issue number. Issue #14 is story 14. GitHub gives it when the
issue is opened. Commit messages carry a type, a scope, what changed, and that number:

```
feat(orders): add duplicate-order check  [#14]
```

Phase tags are `phase-1` … `phase-6`. **The tag is what gets graded.** The Phase Lead
creates it — steps in [docs/how-we-work.md](docs/how-we-work.md#how-to-create-the-tag).
