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

---

## 3. Masters  *(milestone 2)*

**What they are.** Company-wide reference lists. Every dropdown in the app picks from these, so people never type free text where a master exists.

| List | Who manages it | Notes |
|---|---|---|
| Clients | Marketing, Admin, Owner | One client can have many projects |
| Units of measure, cost codes, trades | Admin, Owner | Codes are typed once and reused |
| Material categories, materials | Procurement, Admin, Owner | Materials carry a unit, a standard unit cost (cost data) and a reorder threshold |
| Vendors | Procurement, Admin, Owner | Category from a fixed list; four 1–5 ratings: quality, delivery, price, service |
| Subcontractors | Admin, Owner (others read) | Each has one trade |
| Equipment | Admin, Owner | Ownership is Company, Rental or Subcontractor |
| Employees, contract labour gangs | HR, Owner | Wage and rate columns are cost data |
| Quality checklists | Quality Engineer, Admin, Owner | One checkpoint per line |
| SOPs | Admin, Owner | Reference notes |

**Rules.** Codes (MAT-0001, VEN-0001 …) are generated. A record with the same code or name as an existing one is refused with a message. Nothing is deleted; set a record to Inactive instead. Cost columns are removed for roles that may not see them, and a role that can't see a cost column can't overwrite it by editing the record.

---

## 4. Users and assignments  *(milestone 2)*

- **Users** (Admin, Owner): create a person with a role and a temporary password, change their role, disable them (they are signed out everywhere), reset their password. Only the Owner can create or change Owner accounts. You cannot disable yourself or the last Owner. A Client login must be linked to one client.
- **Assignments** (Admin, Owner): a person is assigned to a project to see it. Only Project Managers, Site Engineers, Store Keepers and Quality Engineers use assignments; other roles see projects by role. Assigning twice is refused. Removing someone takes the project away from them on their next click.

---

## 5. Projects, WBS, activities, BOQ  *(milestone 2)*

**Project.** Created by the Owner in Planning status with a Main Store. Status moves along the map in section 2. Owner, Admin and the assigned PM edit its details; the contract value is editable only by roles that can see it.

**WBS.** A tree per project. Top-level items are stages (Foundation, Superstructure …); activities attach to the lowest level. An item can be deleted only when it has no children and no activities.

**Activity.** Belongs to a project and a WBS item. Fields: name, trade, unit, cost code, planned quantity, planned start and finish, planned labour mandays, planned cost, target productivity, critical-path flag, status. Finish cannot be before start. Planned cost is cost data.

| Activity status | Can move to |
|---|---|
| NOT_STARTED | IN_PROGRESS, HALTED |
| IN_PROGRESS | HALTED, COMPLETED |
| HALTED | IN_PROGRESS |
| COMPLETED | IN_PROGRESS (reopen) |

Once daily reports arrive (milestone 3), approval will move activities along this map automatically.

**BOQ.** Items have a code, description, unit, original quantity, approved variation quantity, client rate and internal budget rate. Both rates are cost data (the client rate is also visible to the Client). "Save as revision" freezes the current BOQ as revision 1, 2, 3 …. An activity can link to several BOQ items and a BOQ item to several activities.

**Material BOM.** Per activity: each material with a coefficient (quantity per unit of activity quantity) and an allowable wastage %. Milestone 3/4 use it to compare actual use against standard.

**Storage locations.** Per project (Main Store, Yard, Floor Store, Warehouse, Other). Stock is always held in a location.

**Who can do what.** Owner: everything. PM: WBS, activities, BOQ and BOM on assigned projects. Site Engineer and Store Keeper: read the plan, with no cost columns and no BOQ. Admin: read only, no cost columns. Client and others: no access to planning.

---

## 6. Demo data  *(milestone 2)*

Everything the seed creates is flagged DEMO and shows a DEMO badge. While the app runs in demo mode, records people create are flagged too. The Owner's **Settings → Reset demo data** button (demo mode only) deletes every DEMO record and recreates the starting data in one step; everyone is signed out and demo accounts keep the password `demo1234`.

---

## 7. Daily progress report (DPR)  *(milestone 3)*

**One report per project per day** (the database refuses a second). The Site Engineer opens it on a phone; several engineers on a project add to the same report while it is a draft.

**What goes in it.**
- Weather (Sunny, Cloudy, Rain, Heavy rain), and an optional "No work today" with a reason.
- **Work done:** for each activity, today's quantity and its labour — trade, number of people, hours (up to 16), and source (Company, Contract, Piece rate, Subcontractor — the subcontractor is named).
- **Material used:** material, quantity, and the activity it was used on. The screen shows what is in stock.
- **Photos:** taken on the phone, shrunk to about 300 KB, each with its own upload state.
- **Issues:** quick add; saved straight away.
- Remarks.

The screen starts filled from yesterday (yesterday's activities and crews), saves as you type, and submits with one big button.

**Life-cycle.**

| From | To | Who |
|---|---|---|
| (new) | DRAFT | any engineer on the project, by opening today's report |
| DRAFT | SUBMITTED | the engineer; the first submit locks it for everyone else |
| SUBMITTED | APPROVED | the PM of the project, or the Owner |
| SUBMITTED | REJECTED | the PM, with a reason the engineer sees |
| REJECTED | DRAFT | the engineer, by editing; then submit again |

**Checks before a report is accepted.** An activity can't be reported beyond 110% of its planned quantity in total (the message says what is left). Labour hours must be more than 0 and at most 16. Subcontractor labour needs a subcontractor. A material must name an activity. To submit: weather, and either a quantity or "No work today" with a reason.

**What approval does — all in one step, or not at all.**
1. The report is claimed so it can't be counted twice.
2. Each activity gets the quantity added. NOT_STARTED becomes IN_PROGRESS on its first quantity; it becomes COMPLETED when the total reaches the plan. A halted activity blocks approval until it is resumed.
3. Labour mandays (people × hours ÷ 8) are added to the activity.
4. Material is issued from project stock (Main Store first, then other locations) as ACTIVITY_ISSUE ledger entries. If any material is short, approval is stopped and the message lists every shortage; nothing is changed.
5. An audit row records who approved what.

**Who sees what.** Engineers see only today's report (no history) and no money. PMs and the Owner see every report for their projects, with labour cost. Clients see approved reports only, and only photos the PM has chosen to share.

---

## 8. Stock  *(ledger core in milestone 3; receipts and procurement in milestone 4)*

Stock is held per project, per storage location, per material. Every change is a line in an **append-only ledger**; the running balance is updated in the same transaction. Types that add stock: OPENING_STOCK, PO_RECEIPT, TRANSFER_IN, ACTIVITY_RETURN. Types that remove it: TRANSFER_OUT, ACTIVITY_ISSUE, WASTAGE, THEFT_LOSS. Valuation is a moving weighted average.

**Rules the database enforces:** a balance can never go below zero; ledger lines can't be edited or deleted; quantities are always positive; labour hours stay within 0–16.

**Screens.** "Stock" (Materials for site roles) shows each material's total, where it sits, and a low-stock flag when it is at or below its reorder threshold. Cost columns are shown only to roles that may see them.

---

## 9. Progress, days ahead/behind and health  *(milestone 3, polished in milestone 7)*

- **Actual %** = each activity's approved quantity ÷ planned quantity (capped at 100%), weighted by planned cost — or planned mandays if cost is unavailable, or equally if neither exists.
- **Plan %** = where the plan says the work should be today, interpolating each activity between its planned start and finish.
- **Days ahead/behind** = the date the plan reached today's actual %, compared with today.
- **Band:** Ahead (3+ points over plan), On track, Slightly behind (3–8 points under), Behind (8+ points under).
- **Health score (0–100):** schedule 50 (loses 2 points per point behind) + NCRs 20 + open critical issues 15 (10 lost per issue) + reports filed in the last 7 days 15.
- **Needs attention** lists activities that are 15+ points behind (critical-path first), reports waiting for approval, projects with no approved report for more than a day, serious open issues, and low stock.

The portfolio screen is for the Owner and PMs. It is grouped by PM by default, shows a "last updated" strip, and drills into each project's stage-by-stage progress and S-curve.

---

## 10. Issues  *(raised in milestone 3; delays and richer handling in milestone 6)*

An issue has a title, severity (Low, Medium, High, Critical), an optional activity, and moves OPEN → IN_PROGRESS → RESOLVED → CLOSED (and can be reopened). Engineers raise them from the daily report; PMs and the Owner change their status. Critical and High open issues appear in "needs attention".

