# BUILDFlow — Decisions log

One line per decision: what was decided, why, and whether the client should confirm it.
Items 1–13 come from the kickoff prompt (§12): the client spec left them open. Items 14+ were made while building.

| # | Decision | Reason | Confirm with client |
|---|---|---|---|
| 1 | One DPR per project per day. Several engineers on one project add to the same DPR while it is DRAFT. The first submitter locks it. | Spec requires UNIQUE(project, date); multiple engineers per site are possible. | yes |
| 2 | The PM approves DPRs. Stock and progress effects post on approval, not on submit. | Avoids double counting from rejected reports. | yes |
| 3 | Health score v0 (0–100): schedule 50, open critical/major NCRs 20, open critical issues 15, DPR compliance over 7 days 15. Formula shown in a tooltip. | Spec names a health score but no formula; a simple rule, not analytics. | yes |
| 4 | Phase 1 builds payables (vendor invoices/payments, subcontractor bills/payments). Receivables and client RA bills are a read-only placeholder. | Billing/Receivables appear in navigation but no module is defined in the spec. | yes |
| 5 | Marketing gets the Clients module only. Leads, follow-ups and quotations are deferred. | Not specified in Part 1. | yes |
| 6 | Admin manages users and masters but cannot see cost data. | Cost data is protected; Admin is a system role. | yes |
| 7 | Mandays = headcount × hours ÷ 8. Hours per log line ≤ 16. | Spec lists mandays and "impossible labour hours" without a formula. | yes |
| 8 | Stock valuation uses moving weighted average. | Spec is silent on valuation method. | yes |
| 9 | Client-visible content: photos only when the PM marks them; documents only when RELEASED; DPRs only when APPROVED. | Spec says "approved project information only". | yes |
| 10 | GST: POs carry a tax % per line (default 18%). No GST filing logic. | Needed for PO totals; filing is out of scope. | yes |
| 11 | Drawing versions: a new upload supersedes the previous; only the latest is CURRENT; old versions stay viewable. | Spec says "control drawing versions". | yes |
| 12 | No DPR history screen for the Site Engineer; only today's report. PM and Owner see history. | Keeps the engineer app minimal. | yes |
| 13 | Progress % is cost-weighted (activity planned cost, falling back to planned mandays). Planned % is interpolated linearly from activity planned dates. | Spec asks for progress without a method. | yes |
| 14 | Navigation for roles the client spec does not list: **Marketing** = Dashboard, Clients; **HR** = Dashboard, Employees, Contract Labour; **Store Keeper** = Dashboard, Receipts, Stock; **Admin** = Dashboard, Projects, Users, Assignments, Masters, Audit Log. Owner reaches the audit log from Settings. | Spec §25 gives navigation for only 7 of 11 roles. | yes |
| 15 | The ui-ux-pro-max generator output (blue #1E40AF / amber palette, Fira Code headings) is overridden by `docs/UX_RESEARCH.md`: navy + green tokens, Fira Sans headings. Its style pick (data-dense dashboard) and Fira Sans/Fira Code pairing are kept. Output is persisted in `design-system/buildflow/`. | Prompt §0.5 precedence: UX_RESEARCH → prompt → skill output. | no |
| 16 | Brand hex codes are placeholders (navy `#0B1F3A`/`#06121F`, green `#22C55E`). All colours live in `src/styles/theme.css`. | Client has not supplied exact hex values. | yes |
| 17 | shadcn/ui-style components (Button, Input, Card, Badge) are written by hand in `src/components/ui/` following shadcn conventions (cva + `cn`), rather than through the shadcn CLI. | The CLI fetches from a remote registry, which may not be reachable from the build environment; the components are tiny. | no |
| 18 | Passwords use `bcryptjs` (pure JavaScript) rather than native `bcrypt`. | No native build step, so the first Railway build cannot fail on it. | no |
| 19 | Prisma is pinned to 6.x and Tailwind to 3.4. | npm's `latest` for Prisma is currently a release candidate; the prompt asks for Tailwind config token mapping, which is the v3 model. | no |
| 20 | The session cookie is a signed JWT that carries only the session row id. The `Session` row is the source of truth (checked on every request), so logout and disabling a user take effect immediately. | Prompt §1/§9 require revocable sessions. | no |
| 21 | Login rate limit (in-memory): 8 attempts per email and 20 per IP per 10 minutes. Overridable with `LOGIN_RATE_LIMIT_EMAIL` / `LOGIN_RATE_LIMIT_IP` for automated tests. | Prompt §9 allows in-memory limiting. | no |
| 22 | A Project Manager sees cost fields only for assigned projects (enforced in `redact()`); Owner and Accounts see costs on all projects. | Prompt §5 matrix. | yes |
| 23 | A CLIENT login is tied to one Client record through `User.clientId`; its project scope is that client's projects. | Spec: "Client: approved project information only". | yes |
| 24 | Fonts (Fira Sans, Fira Code) are self-hosted through `@fontsource` packages rather than fetched from Google Fonts. | Works offline and in restricted build networks; matters for the offline PWA. | no |
| 25 | Screens not built yet are visible in navigation and open a clearly labelled "Not built yet — arrives in milestone N" page. Project module tiles are shown disabled with their milestone. | The prompt forbids screens that look done but do not persist. | no |
| 26 | Seeded project dates are relative to the day the seed runs, so the demo always looks current. | A fixed calendar would go stale. | no |
| 27 | Every seeded record carries `isDemo = true` and shows a DEMO badge; the full reseed removes only those rows. | Prompt §10. | no |
| 28 | The audit-log viewer redacts cost fields inside before/after snapshots, so Admin can read the trail without seeing cost data. | Rule: Admin never sees cost data (decision 6). | no |
| 29 | Only the Owner creates projects (creating one sets the contract value, which is cost data). Admin can edit a project's non-financial details but never sees or changes the contract value. | Admin must not see cost data (decision 6). | yes |
| 30 | A project's client is fixed at creation. | Changing the client would rewrite history on billing and documents. | yes |
| 31 | BOQ items keep one stable record per item code. A "revision" is a frozen snapshot of all quantities and rates (numbered 1, 2, …), so activity links survive revisions. | Spec says "support revisions" and "activity ↔ BOQ mapping"; snapshots keep both simple. | yes |
| 32 | zod is pinned to v3. | v4's error API differs; v3 is what the schemas are written against. | no |
| 33 | Activity status can be changed by hand only along the transition map (NOT_STARTED → IN_PROGRESS → COMPLETED, HALTED ↔ IN_PROGRESS, COMPLETED → IN_PROGRESS to reopen). DPR approval (milestone 3) will drive it automatically. | Prompt §4: illegal transitions throw. | no |
| 34 | While DEMO_MODE=true, records users create are also flagged isDemo, so "Reset demo data" returns the app to a clean state. A deployed demo also refreshes itself when the seed version changes (only isDemo records are touched). | A reset that leaves user records pointing at deleted demo masters would fail. | no |
| 35 | WBS codes are hierarchical (1, 1.1, 1.1.2) and generated by the app; activity codes are ACT-001… per project; other master codes use a prefix and counter (MAT-0001, VEN-0001 …). | Human-readable codes without free typing. | no |
| 36 | Every new project gets a "Main Store" storage location automatically. | Stock is per location, so the first receipt needs one. | no |
| 37 | Employees and contract-labour gangs use the `employee` permission (HR, Owner). Vendors and materials are Procurement's; checklists are the Quality Engineer's; storage locations are PM's and Store Keeper's. | Spec §24 role access, refined per master. | yes |
| 38 | Company-level masters (material standard cost, employee wage, gang rate) are visible to the cost-visible roles including PMs; everyone else gets the columns removed at the source. | PM cost visibility is per prompt §5; company masters have no single project. | yes |
| 39 | Vendor categories and equipment categories are fixed pick-lists, not free text. | Prompt §2.5: controlled master data. | no |
| 40 | Contract labour gangs are a master ("Contract Labour" in the spec); piece-rate and subcontractor labour sources arrive with labour logs in milestone 3. | Spec separates four labour sources. | no |
| 41 | Milestone 3 also contains the inventory ledger core (ledger, running balances, database guards), which the prompt lists under milestone 4. | DPR approval must issue material from stock (Flow A step 4) and block when it is short; receipts, transfers and procurement still arrive in milestone 4. | no |
| 42 | A report's "today" is the calendar date in India (IST), not UTC. | Sites and engineers work in IST; UTC would flip the date at 5:30 AM. | no |
| 43 | An activity can be reported up to 110% of its planned quantity in total; beyond that the report is stopped with a message saying what is left. | Spec: prevent "impossible output" but real sites overrun slightly. | yes |
| 44 | Material used is issued to a named activity, from the Main Store first and then other locations. Approval is blocked, with the exact shortage, if the project's total stock is short; nothing is partly posted. | Prompt Flow A step 4. | yes |
| 45 | Labour cost is computed by the server from the average daily wage of the trade (employees and gangs). Engineers never enter or see money. | Cost data is hidden from the site team. | yes |
| 46 | Several engineers can add to the same draft; each edits only their own lines, and the first submit locks the report. | Decision 1. | yes |
| 47 | A rejected report reopens as a draft when the engineer edits it, and can be submitted again. The PM's reason is shown to the engineer. | Keeps one report per day and one clear next step. | no |
| 48 | Issues raised inside the DPR are saved immediately, not with the draft. | An issue must never be lost or duplicated by autosave. | no |
| 49 | DPR photos accept JPEG, PNG and WebP only (checked by file signature), up to 15 MB; the phone shrinks them to about 300 KB first. Files live under UPLOAD_DIR and are served only through an authorised route. Drawings (PDF, DWG, DXF) arrive with documents in milestone 6. | Prompt §1/§9. | no |
| 50 | Days ahead/behind = the date on which the plan reached today's actual %, compared with today. Behind by 12 days means the plan expected today's progress 12 days ago. | A plain-language version of schedule variance. | yes |
| 51 | The portfolio screen is for the Owner and Project Managers; a PM sees only assigned projects. Engineers and clients never see it. | Prompt §6. | no |
| 52 | Health score v0 uses the formula in decision 3. Until NCRs exist (milestone 5) the NCR component is a full 20. Bands: 75+ Healthy, 50–74 Watch, below 50 At risk. | Needs thresholds to show a chip. | yes |
| 53 | Approving a report claims it with a single conditional update first, so a double click or two PMs cannot count it twice. | Data must be trustworthy by construction. | no |
| 54 | Clients see only approved reports, and only photos the PM has shared. | Decision 9. | yes |
| 55 | The inventory ledger can be deleted from only by the demo reset (it sets a session flag inside its own transaction). Everything else is blocked by a database trigger. | Append-only ledger vs. a resettable demo. | no |
| 56 | The demo history covers each project's whole life (about 1,750 approved reports), not only six weeks, so S-curves, stock and labour are consistent. Each site is solved to a chosen planned % and actual %, so the portfolio tells a different story per site. | Prompt §10 asks for at least six weeks. | no |

