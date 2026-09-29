# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 15 (App Router) + TypeScript, Tailwind CSS + shadcn/ui, Prisma + PostgreSQL. Installable PWA for the site app. Deployed on Railway. See the kickoff prompt for the full stack.

## Users

- **Owner** — the contractor who runs the company. He has 8–10 premium residential sites (₹2 Cr+ homes) running in parallel in Tamil Nadu. His job is to know which sites are on track, which are slipping and why, without phoning anyone. He uses a laptop in the office and a phone in the car or at sites.
- **Project Manager** — has about three sites each. Plans activities, approves the daily reports from their sites, chases materials and quality. Moves between sites all day, mostly on a phone.
- **Site Engineer** — one per site, on the phone the whole day, outdoors in Tamil Nadu sun, often with dusty hands and patchy mobile data. The job is to file the Daily Progress Report (DPR) in about one minute: work done per activity, labour, material used, photos, issues. The Site Engineer is not a desk user and does not want to see finances.
- **Supporting roles** — Store Keeper, Procurement, Quality Engineer, Accounts, HR, Admin, Marketing. These are mostly desktop or tablet users doing focused list-and-form work.
- **Client** (the homeowner) — read-only view of their own home: approved progress, selected photos, released documents.

## Product Purpose

BUILDFlow replaces the WhatsApp photos, Excel sheets and phone calls that the owner uses today to track progress across sites. It is a project-wise construction operating system:

Client → Project → WBS → Activity → daily operations (DPR, labour, material, procurement, quality, issues, delays, equipment, documents).

Success means:
- The owner opens one screen and trusts what it tells him about every site.
- Every engineer files a DPR every day because it takes about a minute.

## Positioning

Built only for construction contractors, not a generic ERP. The daily report from the site is the single source that drives portfolio progress, stock, and quality status. The architecture is headless and agent-ready: a Phase 2 AI assistant will operate on the same typed functions.

## Operating Context

- **Outdoor use:** bright sunlight, dust, one hand holding the phone.
- **Devices:** often mid-range Android phones.
- **Connectivity:** mobile data is unreliable on site, so DPR, photos, labour, material requests and issues must work offline and sync later.
- **Office use:** laptops.
- **Demo:** the first demo is to the owner this evening. He watches while Kasi drives the app, and the portfolio-progress screen is the moment that matters.
- **Workflows:**
  - DPR: engineer submits, PM approves, progress and stock update.
  - Material: material request → purchase request → quotations → purchase order → receipt → stock → issue to activity → invoice → payment.
  - Quality: inspection → NCR → corrective action → rectification → reinspection → closure.

## Capabilities and Constraints

- Everything is project-wise. Site Engineers see only their assigned projects.
- Cost data is hidden from engineers, store, quality, admin and client roles.
- There are no duplicate DPRs per project per day, inventory never goes negative, and master data comes from controlled selection rather than free text.
- UI language is English only. Indian number formatting (₹, lakh/crore) is used throughout.
- The Site Engineer has no DPR history screen; they see today's report only.
- **Not in Phase 1:** analytics or AI modules, except a clearly labelled "Ask BUILDFlow" preview. There is no Tally integration.

## Brand Commitments

- **Colours:** the client's brand colours are dark blue (navy) and green. Exact hex values are not yet supplied, so all colours live in one token file to be swapped later.
- **Theme:** users can toggle between dark and light themes.
- **Name:** the product name is BUILDFlow.

## Evidence on Hand

- There are no real customer data, testimonials, logos or photos yet.
- All demo data is seeded, flagged `isDemo`, and marked with a visible DEMO badge.
- Do not fabricate client names, logos or metrics beyond the labelled demo data.

## Product Principles

1. **The one-minute DPR is sacred.** Every field on the engineer's screen must earn its place.
2. **The owner should never have to call a site.** The portfolio screen answers "where are we, what's slipping, why" at a glance.
3. **Data should be trustworthy by construction.** Invariants live in the database, and the UI prevents bad input rather than reporting it later.
4. **Show each role only what serves its job.** Hiding costs and complexity is a feature.
5. **Operate mode everywhere.** Scanability and consistency beat decoration, and the brand lives in precise details.

## Accessibility & Inclusion

- **Engineer screens:** built for outdoor legibility:
  - At least 7:1 text contrast in the light theme.
  - Touch targets of at least 56px.
  - No hover-only affordances and no colour-only status.
- **All screens:** WCAG 2.1 AA in both themes, and `prefers-reduced-motion` is respected.
