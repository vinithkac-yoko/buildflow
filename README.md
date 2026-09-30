# BUILDFlow

Mobile-first construction operating system for premium residential contractors.
See `PRODUCT.md`, `BUILDFLOW_CLAUDE_CODE_PROMPT.md` and the `docs/` folder.

## What is in it

| Area | Who uses it |
|---|---|
| Daily progress report, labour, materials used, photos, issues — works offline | Site Engineer |
| Approvals, progress, planning (WBS, activities, BOQ), delays, equipment, documents, work orders | Project Manager |
| Portfolio progress, health, needs-attention list, Ask BUILDFlow (preview) | Owner, Project Manager |
| Material requests, purchase orders, receipts, stock, vendor invoices | Procurement, Store Keeper, Accounts |
| Inspections, NCRs, rework | Quality Engineer |
| Payables, subcontractor bills and payments | Accounts |
| Approved progress, shared photos, released documents | Client |
| Users, assignments, master data | Admin |

## Run locally

```bash
pnpm install
cp .env.example .env            # then set DATABASE_URL and SESSION_SECRET (32+ chars)
pnpm exec prisma migrate dev
pnpm db:seed
pnpm dev
```

With `DEMO_MODE=true` the sign-in page lists demo accounts. Every password is `demo1234`, for example
`owner@`, `pm1@`, `engineer1@`, `procurement@`, `store@`, `quality@`, `accounts@`, `client@` … `@buildflow.demo`.
Demo data comes back automatically when the seed version rises, and Settings → Demo has a reset button.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test      # unit tests, plus integration tests when TEST_DATABASE_URL is set
pnpm build && pnpm start                      # then, in another terminal:
pnpm test:e2e                                 # Playwright at 390 px (phone) and 1440 px (desktop)
```

Start the server for the end-to-end run with `LOGIN_RATE_LIMIT_IP=1000 LOGIN_RATE_LIMIT_EMAIL=1000 DEMO_MODE=true`
so the many test logins are not throttled. Integration tests need a separate empty Postgres database in
`TEST_DATABASE_URL` (never the one you use for the app).

## How the code is laid out

- `src/core/<module>` — the business rules. Plain functions `(ctx, input) => result`, no web code. Every function checks permission (`can`), strips fields the caller may not see (`redact`) and writes an audit row in the same transaction.
- `src/core/tools` — the four read-only questions behind **Ask BUILDFlow**, written as future agent tools (name, description, zod input and output).
- `src/actions`, `src/app/api` — thin wrappers that build the context and call the core.
- `prisma/invariants.sql` — rules the database itself enforces (no negative stock, an append-only stock ledger, no over-measuring or over-paying, …); it is appended to the migrations.
- `public/sw.js`, `src/lib/offline` — the offline outbox and service worker.

## Docs

`docs/DECISIONS.md` (every choice the client spec left open — confirm each with the client) ·
`docs/BUSINESS_FLOW.md` (how the flows work, in plain language) · `docs/DEPLOY.md` (Railway) ·
`docs/UX_RESEARCH.md` (binding design rules) · `docs/DPR_SHAPE.md`, `docs/PORTFOLIO_SHAPE.md` (design briefs).
