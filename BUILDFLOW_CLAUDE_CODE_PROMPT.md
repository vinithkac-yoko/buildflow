# BUILDFlow — Phase 1 Kickoff Prompt for Claude Code

> **Setup:** push the contents of `buildflow-kit.zip` to a new GitHub repo, start a Claude Code cloud session on it, and paste everything below the line (or ask it to read this file).
>
> The kit contains the design skills in `.claude/skills/`, plus `PRODUCT.md` and `docs/UX_RESEARCH.md`.
>
> The prompt is written to be followed milestone by milestone, with a working deploy after each one.

---

## 0. Context

You are building **BUILDFlow**, a mobile-first construction operating system for a contractor who builds **premium residential homes (budgets above ₹2 Cr) in Tamil Nadu**.

This is **not a generic ERP**. Every screen and table exists to run construction projects.

**The client's #1 pain is tracking progress across multiple projects at once.** He runs 8–10 sites in parallel, each with its own PM. Today he tracks them through WhatsApp photos, Excel sheets, and phone calls, so the numbers are scattered, late, and unverifiable.

The Owner/PM portfolio progress view (§6) is the centrepiece of the demo. Every flow ultimately exists to feed accurate numbers into it, so give it the most design care after the Site Engineer DPR screen.

- **Today's goal:** a working, deployed demo on Railway by this evening. It must have real project-wise data relationships, not mockups.
- **Phase 2 (later, not now):** an agent-native layer. Chat-first AI agents will call typed tools over this same data. Every architectural choice below keeps that door open. Do not build AI now, except the one preview screen in §11.

Work in milestones (§14). After each milestone:
1. Run the app.
2. Run the checks.
3. Commit.
4. Tell me what to click to verify it.

Do not jump ahead. Do not ask me for permission on anything already decided in this document.

---

## 0.5 Design inputs (read before any UI work)

This folder already contains:
- **`PRODUCT.md`** — the product brief, in impeccable's format. It is confirmed; do not re-interview for it.
- **`docs/CLIENT_SPEC.md`** — the client's original Part 1 spec. This prompt refines it; where they differ, this prompt wins, and the difference should already be listed in §12.
- **`docs/UX_RESEARCH.md`** — field-UX research and binding design rules: colour tokens with measured contrast, touch sizes, per-screen rules, and a bounded design process.
- **`.claude/skills/ui-ux-pro-max/`** — a searchable design database.
  - Generator: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system -p "BUILDFlow" --persist`
  - Domain search: `... "<query>" --domain ux|chart|typography`
- **`.claude/skills/impeccable/`** — design commands: `/impeccable shape|critique|audit|polish|adapt …`.

Rules for using them:
1. Scaffold the Next.js app **into this folder**, preserving `.claude/`, `PRODUCT.md`, and `docs/`. Commit all of them.
2. **Precedence for any conflict:** `docs/UX_RESEARCH.md` → this prompt → skill output.
   - The client's brand and field-legibility research outrank generic recommendations.
   - In particular, **never use `#22C55E` for text or thin lines on a light background**. It measures only 2.3:1 contrast.
3. **Follow the bounded design process in `docs/UX_RESEARCH.md` §3 exactly.** The impeccable skill says to "go all out". Here that means craft **within** those passes, not extra loops. This is a same-day demo, and working flows come first.
4. If a skill's script fails, don't debug it for more than a few minutes. Proceed with `docs/UX_RESEARCH.md` alone and note the failure in `docs/DECISIONS.md`.

---

## 1. Stack (fixed — do not substitute)

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router) + TypeScript (strict) |
| UI | Tailwind CSS + shadcn/ui + lucide-react icons |
| Database | PostgreSQL (Railway Postgres plugin) |
| ORM | Prisma + Prisma Migrate. **`prisma/schema.prisma` is the single source of truth.** |
| Auth | Custom email + password auth: bcrypt hashes, a signed httpOnly session cookie (`jose`), and a `Session` table so sessions can be revoked. **No third-party auth provider.** |
| Validation | zod. Every input is validated server-side, whatever the client sends. |
| Offline | PWA with a hand-written service worker, plus IndexedDB (`dexie`) as the offline outbox |
| Files | Local disk at `UPLOAD_DIR` (a Railway volume mounted at `/data/uploads`). Files are served **only** through an authorized route handler, never from `/public`. |
| Package manager | pnpm |

Single company, single tenant. No multi-tenancy.

---

## 2. Architecture rules (these make Phase 2 possible)

1. **Headless core.** All business logic lives in `src/core/<module>/` as plain, typed service functions. Each one has the shape `(ctx: Ctx, input: ZodValidated) => Result`, where `Ctx = { userId, role, projectIds, now }`.
   - UI server actions and route handlers are **thin wrappers**: parse the input, build `ctx`, call the service, return the result.
   - No business logic in React components.
2. **Every service function authorizes itself.** It checks role permission and project assignment inside the function, not only in the UI or middleware. A future agent will call these same functions.
3. **Every mutating service writes an `AuditLog` row in the same DB transaction.** The row records userId, projectId, activityId (if any), action, entity, entityId, before/after JSON, and timestamp.
4. **Database invariants live in the database too.** Create `prisma/invariants.sql`, applied through a Prisma migration, with:
   - A trigger or constraint that makes negative stock impossible, per project + storage location + material.
   - `UNIQUE(projectId, reportDate)` on the DPR table.
   - A `CHECK` constraint on labour hours (0 < hours ≤ 16 per log line) and on non-negative quantities.
   - A unique `clientTxnId` on every table that can be written offline, so sync is idempotent.

   The app validates these first so users get friendly errors. The database is the final guard.
5. **Controlled master data.** Anywhere a master record exists (material, vendor, subcontractor, activity, cost code, trade, UOM, storage location), the UI uses a searchable select bound to an ID. Never use free text.
6. **Maintain `docs/BUSINESS_FLOW.md` as you build.** For each module, describe the entities, the states and allowed transitions, who can do what, and which invariants apply. This file becomes the agent's context in Phase 2, so keep it accurate and in plain English.
7. **Maintain `docs/DECISIONS.md`.** Every place where you or this prompt resolved an ambiguity in the client's spec gets one line: the decision, the reason, and "confirm with client: yes/no". Start it with the list in §12.

---

## 3. Non-negotiable rules (from the client)

- Everything is project-wise: Client → Project → WBS → Activity → operations.
- Every project transaction stores Project ID, User ID, and created date/time. It also stores Activity ID where applicable.
- A Site Engineer sees **only** assigned projects. The Owner sees everything.
- Accounts and cost data are protected. Internal rates, budgets, costs, and margin are **never** sent to roles that are not allowed to see them. Strip these fields in the service layer, not just in the UI.
- Inventory is project-wise and can **never** go negative.
- No duplicate DPR for the same project and date.
- Mobile-first for the Site Engineer. That interface is the simplest in the app, and a daily report must take about **one minute**.
- No analytics or AI modules in Phase 1 (except §11).
- Don't invent major modules. Don't redesign this architecture.

---

## 4. Data model

Build these Prisma models with proper relations, indexes, and enums. Use `cuid` IDs, plus a human-readable `code` where the spec asks for one. Use `Decimal` for all money and quantities. Add `createdAt`, `updatedAt`, and `createdById` everywhere.

**Identity & access**
- User
- Role (enum): OWNER, MARKETING, PROJECT_MANAGER, SITE_ENGINEER, ACCOUNTS, PROCUREMENT, QUALITY_ENGINEER, HR, STORE_KEEPER, ADMIN, CLIENT
- Session
- ProjectAssignment (user ↔ project, many-to-many)
- AuditLog

**Masters**
- Client
- Project
- WbsNode (self-referencing tree)
- Activity
- ActivityBoqLink (many-to-many)
- BoqItem
- BoqRevision
- Material
- MaterialCategory
- Uom
- CostCode
- Trade
- Employee
- ContractLabourGang
- Vendor
- Subcontractor
- Equipment
- StorageLocation (per project)
- QualityChecklist
- ChecklistItem
- Sop
- Document
- DocumentVersion

**Operations**
- Dpr
- DprActivityProgress
- DprPhoto
- LabourLog
- MaterialBom (activity ↔ material, with coefficient and wastage %)
- InventoryLedger (append-only)
- MaterialRequest
- PurchaseRequest
- PurchaseRequestItem
- VendorQuotation
- PurchaseOrder
- PurchaseOrderItem
- MaterialReceipt
- MaterialReceiptItem
- VendorInvoice
- VendorPayment
- WorkOrder (subcontractor)
- WorkOrderMeasurement
- SubcontractorBill
- SubcontractorPayment
- EquipmentAssignment
- EquipmentLog (usage, maintenance, breakdown)
- QualityInspection
- InspectionResult
- Ncr
- NcrAction
- Issue
- Delay

**Rules**
- **Inventory ledger** is append-only. Transaction types:
  - OPENING_STOCK
  - PO_RECEIPT
  - TRANSFER_IN
  - TRANSFER_OUT
  - ACTIVITY_ISSUE
  - ACTIVITY_RETURN
  - WASTAGE
  - THEFT_LOSS

  Current stock is computed from the ledger, with a materialized `StockBalance` table updated in the same transaction and guarded by the DB check. A project-to-project transfer writes a paired TRANSFER_OUT/TRANSFER_IN in one transaction. Valuation uses moving weighted average.
- **Status enums** follow the client spec exactly:
  - Project: PLANNING, ACTIVE, ON_HOLD, DELAYED, COMPLETED, CANCELLED
  - Activity: NOT_STARTED, IN_PROGRESS, HALTED, COMPLETED
  - DPR: DRAFT, SUBMITTED, APPROVED, REJECTED
  - Inspection result: PASS, CONDITIONAL_PASS, REJECTED_NCR
  - NCR severity: MINOR, MAJOR, CRITICAL
  - Equipment ownership: COMPANY, RENTAL, SUBCONTRACTOR
- **State transitions** are enforced in services through a small transition map per entity. Illegal transitions throw.
- **Delays** record category, dates, days lost, critical-path impact, cost impact, evidence, responsible function, and corrective action. **Never a person as the party to blame.**

---

## 5. Permissions

Implement a single `can(ctx, action, resource, projectId?)` function driven by a permission matrix in `src/core/auth/permissions.ts`. It is used by every service.

Field-level cost visibility goes through a `redact(ctx, entity)` helper.

| Role | Projects visible | Can see costs, rates, and budgets? | Main powers |
|---|---|---|---|
| Owner | All | Yes (all) | Everything |
| Admin | All | **No** | Users, roles, assignments, masters |
| Project Manager | Assigned | Yes, for assigned projects | Planning, WBS, activities, BOQ, approve DPR, raise PR, issues, delays |
| Site Engineer | Assigned | **No** | DPR, labour, material usage, photos, issues, material requests, raise inspections |
| Accounts | All | Yes | Vendor invoices, payments, subcontractor bills, payables and receivables views |
| Procurement | All | PO rates only | PR → quotation → PO, vendors, receipts |
| Store Keeper | Assigned | **No** | Receipts, issues, returns, transfers, stock counts |
| Quality Engineer | Assigned | **No** | Checklists, inspections, NCR lifecycle |
| HR | All | Wages only | Employees, contract labour gangs |
| Marketing | None (project data) | **No** | Clients (read/write) |
| Client | Own projects | Contract value and client BOQ rate only | Read-only: approved DPRs, client-visible photos, released documents, progress |

**Sensitive fields** — visible only to roles marked "Yes":
- BOQ internal budget rate
- Activity planned cost
- Labour cost
- Material cost and valuation
- PO rates (visible to Procurement only as noted in the table)
- Margin

---

## 6. Screens and navigation

Use a bottom tab bar on mobile and a sidebar on desktop. Navigation is role-specific, exactly as in the client spec (§25 of the original).

**Site Engineer** — build this first and polish it most. On a phone:
1. **My Projects** — cards: project name, today's DPR status chip.
2. **Today's Work** — planned or in-progress activities for today, each showing progress toward planned quantity.
3. **DPR** — a single scrolling form:
   - Weather (4 big chips)
   - For each activity worked: activity select, quantity (numeric keypad, UOM shown), and labour (trade + headcount + hours, with a "same as yesterday" button)
   - Material used (material select + quantity; shows available project stock)
   - Photos (camera capture, compressed client-side to about 300KB)
   - Issues (quick add)
   - Remarks
   - A big **SUBMIT DAILY REPORT** button
4. Tabs for Labour, Materials, Quality, Photos, Issues.
5. No money is shown anywhere in this role.
6. Touch targets are at least 56px; the primary action is a 64px full-width bar. Use chips and bottom-sheet pickers, not dropdowns (see `docs/UX_RESEARCH.md` §2.2).
7. **No DPR history screen for the Site Engineer.** They see only today's DPR and its status. Past DPRs are visible to the PM and Owner in the approval list and on the project pages.

**Owner / PM Portfolio Progress** — the hero screen. Premium, information-dense, and readable at a glance on both laptop and phone.
- **One row or card per project**, sortable, showing:
  - Project name and client
  - Contract value (Owner only)
  - **Planned % vs actual %** to date, as a dual progress bar
  - Days ahead or behind
  - Baseline finish vs current finish
  - Health score chip
  - Last DPR date, with a red flag if there has been no approved DPR for more than 1 day
- **Progress computation:** quantity-weighted by activity planned cost. Fall back to planned mandays when cost is hidden or zero. Planned % comes from activity planned dates, interpolated linearly. Show both methods' definitions in a tooltip.
- **Portfolio S-curve:** one small line chart per project of cumulative planned vs actual % over time, built from approved DPR history. Use recharts.
- **"Needs attention" list across all projects:**
  - Activities behind schedule, with the critical-path ones first
  - DPRs pending approval
  - Missing DPRs
  - Open NCRs by severity
  - Critical issues
  - Low-stock materials
- **Filters:** status and PM. **Default view is grouped by PM** (collapsible groups with a per-PM summary: number of projects, and how many are on track, slightly behind, or behind). A toggle switches to a flat, sortable list. The layout must stay scannable with 10+ projects.
- **Freshness strip** at the top: "Updated from N approved DPRs today · last update HH:MM". This is the direct replacement for chasing updates on WhatsApp and phone calls.
- **Drill-down:** tapping a project opens the **Project Dashboard** (client spec §9). It shows the header facts, WBS-level progress bars (planned vs actual per WBS node), and quick-access tiles to each module.

**All other modules:** clean list, detail, and create screens with filters (project, status, date).

Use Indian number formatting throughout: ₹, lakh/crore (₹2.45 Cr), and dates as DD-MMM-YYYY.

---

## 7. The four demo flows (must work end-to-end on the deployed app)

Each flow must be clickable start to finish using the seeded demo users. Write a Playwright smoke test for each (§13).

**Flow A — DPR**
1. Site Engineer logs in on a phone-sized viewport.
2. Opens a project, fills in a DPR (2 activities, labour, 1 material, photo), and submits.
3. PM approves it.
4. On approval:
   - Activity progress and status update (NOT_STARTED → IN_PROGRESS; COMPLETED when cumulative quantity ≥ planned).
   - Material usage posts ACTIVITY_ISSUE ledger entries.
   - Labour mandays roll up to the activity.
   - If stock is insufficient, approval is blocked with a clear message.
5. A second DPR attempt for the same project and date is rejected. The engineer is instead taken to the existing draft or report.

**Flow B — Material**
1. Site Engineer raises a Material Request.
2. PM converts it to a Purchase Request.
3. Procurement adds 2 vendor quotations, picks one, and raises a PO.
4. Store Keeper records a Material Receipt, including a partial receipt, which posts PO_RECEIPT to project stock at the chosen storage location.
5. Stock is issued to an activity.
6. An attempt to issue more than stock shows a friendly error, and the DB would also reject it.
7. Accounts records the vendor invoice and payment against the PO.

**Flow C — Quality**
1. Quality Engineer runs a checklist inspection on an activity: X of Y checkpoints pass, and the result is computed.
2. The result is REJECTED_NCR, which auto-creates an NCR (linked to the subcontractor if any).
3. The NCR moves through Corrective Action → Rectification (with rework labour cost, material cost, and time lost) → Reinspection → Closure. Closure time is recorded.

**Flow D — Owner view**
1. Owner opens Portfolio Progress and sees all 9 projects grouped by PM: planned vs actual, S-curves, and the needs-attention list.
2. Owner drills into one project and sees the effects of flows A–C reflected: progress, stock, NCR, costs.
3. An approved DPR from Flow A visibly moves that project's actual % and S-curve.
4. Log in as **Client** and confirm that internal costs are invisible (also check the network response).

---

## 8. Offline (Site Engineer)

- The PWA is installable and has a manifest (name "BUILDFlow", theme colour, icons).
- The service worker caches the app shell plus the engineer's assigned projects, activities, materials, and trades, refreshed on each online load.
- These can be created offline: DPR, photos, labour logs, material requests, issues.
  - Each record gets a client-generated `clientTxnId` (UUID) and is stored in an IndexedDB outbox.
  - A sync banner shows the pending count.
  - When back online, the outbox sends to `/api/sync` in order.
  - The server upserts by `clientTxnId` (idempotent), so a retry never duplicates.
- Conflicts, such as a DPR for that date already existing, are returned per item and shown to the engineer. Nothing is silently dropped.
- For the demo, a manual **"Simulate offline"** toggle in the engineer's profile menu is acceptable in addition to real offline.

---

## 9. Security

- Passwords are bcrypt-hashed.
- The session cookie is httpOnly, secure, and SameSite=Lax. Sessions expire after 7 days and can be revoked (logout deletes the row).
- Every route handler and server action goes through the service layer, and therefore through `can()`.
- File downloads check project access before streaming.
- Upload validation: MIME type allow-list (images, PDF, DWG/DXF), 15MB limit, and randomized stored filenames.
- Audit log viewer (Owner and Admin): filter by project, user, entity, and date.
- Rate-limit the login endpoint (in-memory is acceptable).

---

## 10. Seed / demo data

`pnpm db:seed` creates realistic data. Every seeded record has `isDemo = true`, and the UI shows a small **DEMO** badge on such records and in the header.

**Clients and projects** (premium residential, Tamil Nadu). Seed **9 projects**, assigned across **3 PMs** (3 projects each), with one Site Engineer per active project:

| Project | Value | Status |
|---|---|---|
| G+2 luxury villa, RS Puram, Coimbatore | ₹3.4 Cr | ACTIVE, about 45% complete |
| Duplex villa with basement, Avinashi Road, Tiruppur | ₹2.6 Cr | ACTIVE, about 20% complete, critical-path delay |
| Contemporary villa, Saravanampatti, Coimbatore | ₹2.9 Cr | ACTIVE, about 70% complete (finishing stage), ahead of schedule |
| Courtyard home, Race Course, Coimbatore | ₹4.1 Cr | ACTIVE, about 55% complete, on track |
| G+1 villa, Peelamedu, Coimbatore | ₹2.3 Cr | ACTIVE, about 35% complete, slightly behind |
| Luxury bungalow, Kumaran Nagar, Tiruppur | ₹3.0 Cr | ACTIVE, about 10% complete (foundation stage) |
| Villa with pool, Vadavalli, Coimbatore | ₹3.6 Cr | ACTIVE, about 85% complete, one open major NCR |
| Farmhouse residence, Pollachi | ₹2.2 Cr | PLANNING |
| Heritage-style home, Erode | ₹2.5 Cr | ON_HOLD (client-side approval pending) |

Each project has its own private client. The active projects must look deliberately different on the portfolio screen: some ahead, some on track, some slightly behind, and one clearly behind. One project must have no DPR yesterday, so the missing-DPR flag shows. The needs-attention list should never be empty in the demo.

**Structure and operations data:**
- **WBS:**
  - Site Preparation
  - Foundation (Excavation, PCC, Footing, Plinth beam)
  - Superstructure (Columns, Beams, Slabs per floor)
  - Masonry
  - Plastering
  - MEP (Plumbing, Electrical)
  - Flooring (Italian marble, wooden deck)
  - Finishes (Painting, False ceiling)
  - External works
- **Activities:** about 25 per active project (generate these programmatically from a WBS template, scaled to each project's stage), with realistic UOMs (cum, sqm, rmt, kg, nos), planned quantities, dates, and productivity.
- **BOQ:** about 30 items per project, with client rate and internal budget rate.
- **Materials:** about 30, including cement OPC 53, TMT Fe550D (8/10/12/16mm), M-sand, P-sand, 20mm aggregate, AAC blocks, red bricks, RMC M25, CPVC pipes, FRLS wires, Italian marble, and tiles. Each has a BOM coefficient for key activities.
- **People and partners:**
  - Vendors: 6
  - Subcontractors: 4 (shuttering, bar bending, plumbing, electrical)
  - Equipment: 5 (mixer, vibrator, bar-bending machine, rental JCB, scaffolding set)
- **Checklists:** 3 (Pre-concrete pour, Brickwork, Plastering), each with 8–12 checkpoints.
- **History:** 6 weeks of approved DPRs (so the S-curves have shape) on the active projects, so dashboards show real numbers. Also: some open issues, one open NCR, and low stock on one material.

**One user per role.** All use password `demo1234`. The login page shows a **"Demo accounts"** quick-pick list (visible only when `DEMO_MODE=true`).

---

## 11. Phase 2 preview screen (the only AI-looking thing)

Add an **"Ask BUILDFlow"** screen for Owner and PM, labelled **"Preview — AI assistant coming in Phase 2"**.

- It offers 4 suggested questions:
  - Which activities are behind schedule?
  - What's low on stock?
  - Open NCRs this week?
  - Labour mandays by project this week?
- Each answer calls a **real** read function in `src/core/` and renders the result as a small card or table.
- There is no LLM and no free-text input, or free text is disabled with a tooltip.
- Name these read functions as future agent tools, and put them in `src/core/tools/` with zod input/output schemas and a one-line description each.

---

## 12. Decisions already made (copy into `docs/DECISIONS.md`)

The client's spec left these open. Implement them as stated, and mark every one "confirm with client".

1. **One DPR per project per day.** Several engineers on one project add to the same DPR while it is DRAFT. The first submitter locks it.
2. **The PM approves DPRs.** Stock and progress effects post **on approval**, not on submit. This avoids double counting from rejected reports.
3. **Health score v0 formula** (displayed as a 0–100 score):
   - Schedule: 50 points, based on actual vs planned quantity-weighted progress to date.
   - Open critical/major NCRs: 20 points.
   - Open critical issues: 15 points.
   - DPR submission compliance over the last 7 days: 15 points.

   This is a simple rule, not analytics. The formula is shown in a tooltip.
4. **Billing and receivables.** These appear in the client's navigation, but the spec defines no module. Phase 1 builds **payables** (vendor invoices and payments; subcontractor bills and payments), which the procurement and subcontractor workflows require. Receivables and client RA bills are a **read-only placeholder** page. Confirm scope with the client.
5. **Marketing** gets the Clients module only. Leads, follow-ups, and quotations are deferred (not specified in Part 1).
6. **Admin** manages users and masters but cannot see cost data.
7. **Mandays** = headcount × hours ÷ 8. Hours per log line must be at most 16.
8. **Stock valuation** uses moving weighted average.
9. **Client-visible content:**
   - Photos are client-visible only when the PM marks them.
   - Documents are client-visible only when their status is RELEASED.
   - DPRs are client-visible only when APPROVED.
10. **GST:** POs carry a tax % per line (default 18%). No GST filing logic.
11. **Drawing version control:** uploading a new version supersedes the previous one. Only the latest version is marked CURRENT, and old versions remain viewable.
12. **No DPR history screen for the Site Engineer.** The engineer sees only today's report. The PM and Owner see the history.
13. **Progress % is cost-weighted.** It uses activity planned cost, falling back to planned mandays. Planned % is interpolated linearly from activity planned dates.

---

## 13. Quality bar

- `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass.
- Vitest unit tests cover:
  - Negative-stock rejection
  - Duplicate DPR rejection
  - Permission redaction: a Site Engineer and a Client never receive `internalBudgetRate` or cost fields
  - DPR approval side effects
  - Idempotent sync (the same `clientTxnId` sent twice results in one record)
- Playwright smoke tests cover flows A–D at a 390px viewport for engineer screens.
- No `any` in `src/core`.

---

## 14. Milestones (in this order; deploy after milestone 1 and keep deploying)

1. **Skeleton and deploy**
   - Next.js, Prisma, auth, sessions, roles, permission matrix, audit log, app shell with role navigation.
   - Railway config.
   - Push, then **guide Kasi through connecting Railway to this branch (§15)**. Confirm that login works on the live URL before milestone 2.
2. **Masters**
   - Clients, projects, assignments, WBS tree, activities, BOQ (with revisions and activity links), materials, UOM, cost codes, trades, vendors, subcontractors, equipment, storage locations, checklists.
   - Seed script.
3. **DPR and labour** — Flow A, including the approval side effects.
4. **Inventory and procurement** — ledger, invariants SQL, Flow B, including invoices and payments.
5. **Quality** — Flow C.
6. **Issues, delays, equipment logs, documents** (with versions and secure download), and subcontractor work orders with measurement → bill → payment.
7. **Dashboards** — Portfolio Progress (the hero screen; polish it), project dashboard with WBS progress, health score, and Client portal view (Flow D). If time allows, build a rough version of Portfolio Progress right after milestone 3, since it only needs DPR data.
8. **Offline PWA and sync.**
9. **Ask BUILDFlow preview, docs, tests, polish** — including one `/impeccable polish` pass and one `/impeccable adapt` pass (at 390px and 1440px), then stop.

**Design checkpoints:**
- Before building milestone 1's UI shell, run the ui-ux-pro-max `--design-system --persist` step, then apply the `docs/UX_RESEARCH.md` overrides.
- Before building the DPR screen (milestone 3) and Portfolio Progress (milestone 7), run one `/impeccable shape` on each.
- After milestone 7, run one `/impeccable critique` and one `/impeccable audit` on those two screens, and fix the findings in one batch.

If time runs short, protect in this order: Portfolio Progress → Flow A → Flow B → Flow C. Keep flows A–D solid and reduce milestone 6 items to list and create screens. **Never ship a flow that looks done but doesn't persist.**

---

## 15. Environment and Railway deployment

**Where you run:** you are in a Claude Code **cloud session** (Ubuntu VM) with this GitHub repo cloned.
- **Git:** `git push` works only to this session's working branch. Commit and push to it after every milestone.
- **Network:** Railway's domains are **not** reachable from here, so never use the Railway CLI. Kasi configures Railway in its dashboard. Railway deploys automatically from this branch on every push.
- **Local database:** PostgreSQL 16 is preinstalled but not running. Start it with `service postgresql start`, create a `buildflow` database and user, and write `DATABASE_URL` to `.env` (gitignored). Run migrations, the seed, unit tests and Playwright against it.
- **Playwright:** install browsers with `pnpm exec playwright install --with-deps chromium`. If that is blocked, skip the e2e run, say so, and keep the tests in the repo.

**Railway configuration** (commit it as `railway.json`, with Nixpacks or a Dockerfile — whichever builds first time):
- Build: `pnpm install --frozen-lockfile && prisma generate && next build`.
- Start: `prisma migrate deploy && pnpm db:seed:if-empty && next start -p $PORT`.
  - `db:seed:if-empty` seeds only when there are no users, so the first deploy gets demo data with no CLI.
  - The full `db:seed` wipes and reseeds only records with `isDemo = true`.
- **Reset demo data:** add a button on Owner → Settings (visible only when `DEMO_MODE=true`, with a confirmation dialog) that reruns the seed. Kasi can reset the data right before the demo.
- Environment variables (Kasi sets these in the Railway dashboard):
  - `DATABASE_URL` — a reference to the Postgres plugin
  - `SESSION_SECRET` — 32+ random chars
  - `UPLOAD_DIR=/data/uploads`
  - `DEMO_MODE=true`
  - `APP_URL`
- A Railway volume is mounted at `/data`.
- `/api/health` checks the database and is set as Railway's health check path.
- **After milestone 1**, write `docs/DEPLOY.md` and **tell Kasi, step by step, exactly what to click in Railway.** Include the branch name to deploy from, which is this session's branch. Then wait for him to confirm the live URL works before continuing.

---

## 16. Design language — modern, futuristic, premium

**Design skills and rules:** see §0.5. The ui-ux-pro-max and impeccable skills in `.claude/skills/` handle layout, spacing, components, motion and polish. `docs/UX_RESEARCH.md` is binding for colour tokens, sizes and per-screen rules. The client's brand palette and the Site Engineer legibility rules always win over any skill output.

**Overall direction:** a mission-control feel for construction. Think cockpit display, not a spreadsheet: precise, luminous data on deep surfaces. Restrained and expensive-looking, never gamer-neon.

- **Brand palette — the client's colours are dark blue and green:**
  - Put every colour in **one theme token file** (CSS variables in `src/styles/theme.css`, mapped into the Tailwind config), so the exact brand hex codes can be swapped in later in one place.
  - Use the **exact token table in `docs/UX_RESEARCH.md` §2.1**, which gives both themes with measured contrast ratios. Navy `#0B1F3A` / `#06121F` and green `#22C55E` apply in dark mode. In light mode, green is `#15803D` for fills and `#166534` for text.
- **Theme toggle** (dark ⇄ light) sits in the top bar on every screen, is available to every role, and has a smooth cross-fade.
  - The choice is saved per user in the database (`User.themePreference`), so it follows the user across devices. Also set it in a cookie so there's no flash of the wrong theme on load.
  - Defaults: dark for office roles, light for the Site Engineer. The user can override either.
- **Dark theme** (office default):
  - Background: deep navy gradient (`--brand-navy-deep` → `--brand-navy`), with a very faint blueprint grid texture at about 3% opacity.
  - Surfaces: layered navy panels with 1px hairline borders (`rgba(255,255,255,0.06)`) and a subtle inner glow. Use glassmorphism (backdrop blur) **only** for floating layers: nav bar, sheets, dialogs, command palette. Never on data cards.
- **Light theme:**
  - Background: pure white (`#FFFFFF`). Research shows off-white and grey wash out in sunlight.
  - Text: navy.
  - Accents: the same green.
  - Very high contrast, with a "Sunlight mode" option for extra-bold text on engineer screens.
- **Accent usage:**
  - **Brand green** is the signature: primary buttons, the "actual" progress line and bar, focus rings, the live pulse dot.
  - A **light steel-blue** (`#7DA2D6`) is used for "planned" and informational elements, so blue means plan and green means reality.
- **Status colours:**
  - Ahead / on track: brand green
  - Slightly behind: amber `#F5A524`
  - Behind / critical: coral red `#F0524F`
  - Planning / on hold: slate

  Because green is also the brand colour, **status chips always carry an icon and a label**. Never use colour alone.
- **Type:**
  - Fira Sans for UI and headings (600).
  - Fira Code for codes, IDs and aligned numbers (PRJ-0007, PO-2026-0142).
  - This pairing follows the design-database recommendation for data dashboards.
  - Tabular numbers for every quantity and amount.
  - Big numerals on KPI tiles: 40–56px, light weight.
- **Data visualization:**
  - Progress shown as thin dual bars (planned in steel blue, actual in brand green) with a glowing leading edge.
  - Health score as a circular gauge ring.
  - S-curves as smooth lines with a soft gradient area fill beneath.
  - Charts are minimal: no gridline clutter, hover crosshair, and a mono-font tooltip.
- **Motion** (via framer-motion; subtle and purposeful, all under 250ms, respecting `prefers-reduced-motion`):
  - Staggered fade-up as cards load.
  - Number count-up on KPIs.
  - Progress bars animate from 0 on first view.
  - Micro-feedback on DPR submit: a check morph and a haptic call via `navigator.vibrate` where supported.
- **Signature touches:**
  - A **command palette** (⌘K / Ctrl-K) to jump to any project, activity, or PO, for office roles.
  - A live-status pulse dot next to "Updated HH:MM".
  - Skeleton loaders with a shimmer sweep.
  - Empty states with a thin-line construction illustration (SVG, brand-green stroke).
- **Engineer screens:**
  - Large tap targets (56px or more).
  - One primary action per screen.
  - No tables — use cards.
  - The DPR submit button is a full-width brand-green slab pinned to the bottom.
- **Owner screens:** dense but calm, following a 12-column grid on desktop.
- **Phone layout:** everything collapses to a single column with a bottom tab bar.
- **Accessibility:** WCAG AA contrast on both themes. Never communicate status by colour alone — always pair it with an icon or label.

Start with milestone 1 now.
