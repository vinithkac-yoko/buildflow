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
