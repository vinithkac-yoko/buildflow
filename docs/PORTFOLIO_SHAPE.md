# Portfolio, project dashboard and client portal — shaped brief (impeccable `shape`, one pass)

Sources: `PRODUCT.md`, `docs/UX_RESEARCH.md`, kickoff prompt §6 and §7 (Flow D). No interview was run; the answers are in those documents. Assumptions are marked **(assumed)**. Screens shaped from what the app already shows (screenshots taken at 1440 and 390).

## 1. Job and audience
- **Mode: Operate** (Owner, PM) and **Read** (Client).
- **Owner** on a laptop in the office, or a phone in the car: in about ten seconds, which sites are fine, which are slipping and why — without phoning anyone. **PM**: the same for their three sites, on a phone between sites. **Client**: a calm, honest view of their own home; no internal figures.

## 2. Outcome and proof
- Owner: open one screen and trust it. Proof: the demo's stories are visible without scrolling — one clearly behind site, one ahead, one with a missing report, an open major NCR, low paint stock.
- Product-specific truth: the numbers are only as fresh as approved reports, so freshness is part of the screen ("Updated from N approved reports today · last update HH:MM").

## 3. Direction (inside the established BUILDFlow world)
- Visual authority: `theme.css` tokens. Steel-blue = plan, green = reality, amber/red only for problems, never colour alone (icon + word on every chip).
- **Portfolio structure (top to bottom):** freshness strip → one-sentence verdict ("5 of 7 live sites on track, 1 slightly behind, 1 behind") with four counters → **Needs attention** (worst first, six visible, "show more") → **Projects**, grouped by PM (collapsible, with a per-PM summary) with a toggle to a flat, sortable list.
- **The main change:** rows get **dense**. Today each site takes ~180px, so 7 sites need two screens on a laptop and a 5,800px scroll on a phone. A site becomes one scannable line on the laptop (name and client, dual bar with plan/actual and days ahead/behind, a small S-curve, finish dates, health) and a compact card on the phone. Details that don't decide anything (engineer name, baseline vs current finish) move to a second line in small type.
- Focal moment: the dual bar and the days-behind chip; the needs-attention list.
- **Project dashboard:** header facts (with the *computed* health score, not "Not scored yet"), an **open items strip** (waiting reports, open issues, open NCRs, ongoing delays, low stock) that links to each list, health broken into its four parts, S-curve, stage-by-stage bars, module tiles.
- **Client portal ("Your home"):** overall progress in one number (approved work only — **no plan comparison, no days behind, no health, no costs**), progress by stage, latest approved updates with the photos the PM chose to share, released documents, expected finish date. Bills and Payments stay clearly labelled placeholders (decision 4).

## 4. Scope and boundaries
- Production screens; no new data model. Reuses `portfolioProgress`, `projectDetailProgress`, DPR photos with `clientVisible`, released documents.
- Untouched: the DPR screen, calculation rules (decisions 3, 13, 50, 52), planning screens.
- Anti-goals: no extra chart types, no gauges, no cards-inside-cards, no hover-only information, no money for anyone who may not see it.

## 5. States and ranges
- 7–10 sites now; must stay scannable at 12+. 3 PMs with 1–4 sites each. A PM sees only their own group.
- Attention list: never empty in the demo; empty state says so plainly. Missing data (no approved report yet, planning projects) shows a dash, not zero.
- Client: 1 project (up to a few); no approved report yet → "First update will appear here once your site team files and approves a report."

## 6. Interaction and layout
- Group headers are `details` (keyboard and touch friendly, ≥48px). Toggle "By PM / Worst first" stays a link (works without JS, shareable). Filters: status and PM.
- Health ring keeps its formula tooltip (also reachable by tap on phones: tooltip content is also in an expandable line).
- Laptop: row grid at ≥ 1024px; below that, cards. S-curve keeps a "view as table" alternative.
- Touch targets ≥ 48px on the portfolio (office/road use), 56px on engineer screens only.

## 7. Constraints and decisions a builder must not reopen
- Progress maths, bands and health formula are fixed by the decisions log.
- Client sees approved information only: approved reports, photos the PM shared, released documents, stage progress. Enforced in services, not just hidden.
- Indian formatting (₹, lakh/crore), dates DD-MMM-YYYY. Light theme and Sunlight mode must both work.
