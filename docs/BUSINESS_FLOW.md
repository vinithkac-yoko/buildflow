# BUILDFlow — Business flow (plain English)

This file describes what each module does, who can do what, and which rules always hold.
It is kept in step with the code and is the context a future AI agent will read.
Sections are added as each milestone ships.

---

## 1. Identity and access  *(milestone 1)*

**What it is.** Everyone signs in with an email and password. Each person has exactly one role.

**Roles.** Owner, Marketing, Project Manager, Site Engineer, Accounts, Procurement, Quality Engineer, HR, Store Keeper, Admin, Client.

**Sessions.** Signing in creates a session that lasts 7 days. Signing out deletes it, so the login stops working straight away. A disabled user is signed out on their next click.

**Which projects a person can see.**

| Role | Projects |
|---|---|
| Owner, Admin, Accounts, Procurement, HR | All |
| Project Manager, Site Engineer, Store Keeper, Quality Engineer | Only those they are assigned to (Project Assignment) |
| Client | Only projects that belong to their client record |
| Marketing | None (Clients module only) |

**What each role may do.** The single permission table is `src/core/auth/permissions.ts`. Every service checks it before doing anything, so a screen, an API call or a future agent all get the same answer. Summary:

| Role | Main powers |
|---|---|
| Owner | Everything |
| Admin | Users, roles, assignments, masters. No cost data. |
| Project Manager | Plan WBS, activities and BOQ; approve DPRs; raise purchase requests; issues and delays — on assigned projects |
| Site Engineer | Daily report, labour, material use, photos, issues, material requests, raise inspections — on assigned projects. No money anywhere. |
| Accounts | Vendor invoices and payments, subcontractor bills, payables and receivables views |
| Procurement | Purchase request → quotation → PO, vendors, receipts. Sees PO rates only. |
| Store Keeper | Receipts, issues, returns, transfers, stock counts |
| Quality Engineer | Checklists, inspections, NCR lifecycle |
| HR | Employees and contract labour gangs. Sees wages only. |
| Marketing | Clients |
| Client | Read-only: approved DPRs, shared photos, released documents, progress |

**Cost data is hidden at the source.** Internal budget rates, planned cost, labour cost, material cost and valuation, PO rates, margin and wages are removed from what a service returns to any role not allowed to see them (`redact()`), so they never reach the browser or the network. Project Managers see costs only on their own projects. Clients see contract value and the client rate, never internal figures.

**Audit trail.** Every change writes an audit row in the same database transaction: who, which project, which activity (if any), what action, which record, before and after values, when. Owner and Admin can browse it (Settings → Audit log) and filter by project, user, entity and date. Admin never sees cost fields inside the before/after values.

**Rules that always hold**
- A service never trusts the screen: it re-checks role and project assignment itself.
- Signing in is rate-limited.
- Passwords are stored only as bcrypt hashes.

---

## 2. Clients and projects  *(milestone 1 data model; create/edit screens in milestone 2)*

**Entities.** A Client can have many Projects. A Project has a code (PRJ-0001), a client, a type, a location, a contract value, baseline start and finish, a current finish, a status and a health score.

**Project status.** Allowed transitions (enforced in the service when project editing arrives in milestone 2):

| From | To |
|---|---|
| PLANNING | ACTIVE, CANCELLED |
| ACTIVE | ON_HOLD, DELAYED, COMPLETED, CANCELLED |
| ON_HOLD | ACTIVE, CANCELLED |
| DELAYED | ACTIVE, ON_HOLD, COMPLETED, CANCELLED |
| COMPLETED, CANCELLED | (final) |

**Assignments.** A user can be assigned to many projects and a project can have many users. Assignments decide project visibility for Project Managers, Site Engineers, Store Keepers and Quality Engineers.

**Who can do what.** Owner: everything. Admin: create and edit clients and projects and manage assignments. Marketing: clients only. Project Manager: update assigned projects. Everyone else with project access: read.

**Every project record stores** who created it and when. Every project transaction will carry the project, the user and the time (and the activity where relevant).
