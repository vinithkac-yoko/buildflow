# BUILDFlow — UX/UI Research & Rules

This document holds the research findings and the resulting design rules for BUILDFlow. **Claude Code must follow these rules when building any screen.**

Sources are listed at the end. Rules are marked **MUST** (non-negotiable) or **SHOULD** (default unless there is a strong reason).

---

## 1. What the research says

### 1.1 Field conditions change the rules
- Standard mobile guidance (44×44px targets, 4.5:1 contrast) is written for comfortable indoor use. Construction-specific guidance pushes further:
  - 60×60px or larger targets, with primary actions at about 72px and at least 16px between them
  - 7:1 contrast for sunlight
  - Pure white backgrounds with near-black text, because gradients and subtle shadows wash out outdoors
- Bright blues and greens "disappear" in sunlight. **This directly affects our brand green.** `#22C55E` on white is only **2.3:1**. It must never be used for text or thin lines in the light theme.
- Field guidance favours:
  - Single-purpose screens that finish in under 30 seconds
  - No swipe-only or multi-touch gestures
  - No hamburger-hidden actions
  - Avoiding dropdowns when possible — use big chips or bottom sheets instead
  - Numeric keypads, pre-filled forms, and big photo capture
- Font size for outdoor use is 16–18px minimum.

### 1.2 Offline and sync need visible, calm feedback
- Show connectivity state only where it matters, with four distinct states:
  - Offline (grey)
  - Syncing (blue, animated)
  - Synced (check)
  - Failed (amber)
- Reassure rather than alarm. For example: *"You're offline. Your report is saved and will upload when you're back online."*
- Errors must name the problem, say what to do, and offer an alternative. Never write "Something went wrong."

### 1.3 Owner dashboards: few KPIs, variance first, drill-down
- Construction KPI dashboards work when they:
  - Lead with schedule variance (planned vs actual)
  - Show project health at a glance
  - Surface exceptions rather than everything
- Trend over time → use a line or area chart. For more than 6 series, use small multiples, not one crowded chart. Differentiate planned vs actual by **line style** (dashed vs solid), not colour alone.

### 1.4 Indian site-management apps
Indian apps such as Powerplay centre the site engineer's daily progress report, material and labour tracking, and real-time sharing with the office. This confirms that the one-minute DPR is the core daily habit to design around.

### 1.5 The design database (ui-ux-pro-max) for "construction project management dashboard, field operations, data-dense, dark"
- **Recommended style:** dark navy base with green positive indicators. This is a close match to the client's brand.
  - Background `#020617`
  - Surface `#0F172A` / `#1E293B`
  - Accent `#22C55E`
  - Destructive `#EF4444`
  - Border `#334155`
- **Recommended fonts:** Fira Sans (UI) and Fira Code (data and codes), for data-dense dashboards.
- **Must-haves:**
  - 4.5:1 contrast minimum
  - Visible focus states
  - 44px+ targets with 8px+ spacing
  - `inputmode="numeric"` for numbers
  - Visible labels (never placeholder-only)
  - Errors shown next to the field
  - 150–300ms transitions
  - `prefers-reduced-motion` respected
  - Lucide SVG icons (never emoji)
  - Tables become cards or scroll horizontally on mobile
  - Predictable back-button behaviour
  - Bottom nav with 5 items or fewer
- **Anti-patterns:** light-only defaults on dashboards, slow rendering, colour-only status, hover-only affordances.

---

## 2. Resulting rules

### 2.1 Colour tokens (both themes; all in `src/styles/theme.css`)

| Token | Dark theme | Light theme | Why |
|---|---|---|---|
| `--bg` | `#06121F` | `#FFFFFF` | Pure white outdoors (research 1.1) |
| `--surface` | `#0B1F3A` | `#F4F6FA` | |
| `--surface-2` | `#12294A` | `#E9EDF4` | |
| `--border` | `rgba(255,255,255,0.08)` | `#D5DCE6` | |
| `--text` | `#F1F5F9` | `#0B1F3A` (16.5:1) | |
| `--text-muted` | `#94A3B8` (6.4:1) | `#475569` | |
| `--brand` (fills, buttons) | `#22C55E` with `#06121F` text (8.3:1) | `#15803D` with `#FFFFFF` text (5.0:1) | Brand green fails on white |
| `--brand-text` (green text, lines) | `#22C55E` (7.3:1 on navy) | `#166534` (7.1:1) | |
| `--planned` | `#7DA2D6` (6.3:1) | `#1E3A8A` (10.4:1) | Blue = plan, green = actual |
| `--warn` | `#F5A524` (8.1:1) | `#B45309` (5.0:1) | |
| `--danger` | `#F0524F` (4.7:1) | `#B91C1C` (6.5:1) | |

- **MUST:** no raw hex values in components. Use tokens only.
- **MUST:** planned vs actual is shown by colour **and** line style — planned dashed, actual solid.

### 2.2 Site Engineer (light theme default, "Sunlight mode" on by default)
- **MUST — touch targets:**
  - At least 56px for all targets
  - Primary action is a 64px full-width bar pinned above the safe area
  - At least 12px between targets
- **MUST — text:**
  - Body text at least 17px, labels at least 15px
  - Quantities in a large 28px+ tabular font
  - Sunlight mode adds weight +100 and pushes contrast to at least 7:1
- **MUST — no dropdowns for small sets:**
  - Weather, trade, and labour source use big chips.
  - Activity and material use a bottom-sheet picker with search and "Today's activities" pinned first.
- **MUST — numbers:**
  - `inputmode="decimal"` with the unit shown inside the field ("cum", "sqm")
  - A +/- stepper for headcount
- **MUST — DPR is one scrolling screen** with sticky section headers. It must be completable in about 60 seconds by a trained user:
  - Prefill labour from yesterday
  - Default the weather to last used
- **MUST — photos:**
  - Camera opens directly (`capture="environment"`)
  - Compress to about 300KB on the device
  - Show thumbnails with an upload state on each
- **MUST — offline banner:** follow research 1.2, with per-item state (Saved on phone → Uploading → Synced / Needs attention).
- **MUST — navigation:**
  - No swipe-only actions
  - No hamburger menus
  - Bottom nav limited to 4 items (My Projects, Today, DPR, More)
- **MUST — no money anywhere.**
- **SHOULD:**
  - After submit, show a success screen with the check morph and `navigator.vibrate(10)`.
  - Show a clear next step ("Report sent to [PM name] for approval").

### 2.3 Owner / PM Portfolio Progress (dark theme default)
- **MUST:** a 5-second read. Each project row answers three things:
  - Planned % vs actual %
  - Days ahead or behind
  - Health, shown as a chip with an icon and word
- **MUST — exceptions first:** the "Needs attention" list sits above the fold on laptop and directly under the summary on phone.
- **MUST — PM grouping:**
  - Collapsible groups
  - Group header summary: 3 sites · 2 on track · 1 behind
- **MUST — progress bars:**
  - Thin, with planned shown as a steel-blue tick or marker
  - Actual shown as a green fill
  - Numeric labels always visible — never hover-only
- **MUST — S-curves:**
  - One small multiple per project, not one crowded chart
  - Planned dashed blue, actual solid green, with a gradient fill of about 15% opacity
  - Hover or tap shows a mono-font tooltip
  - A "View as table" toggle for accessibility
- **MUST:** tables on laptop become cards on phone.
- **SHOULD — KPI numerals:** 40–48px, light weight, with count-up on first load only.
- **SHOULD:** a freshness strip with a live pulse dot: "Updated from 7 DPRs today · 5:42 PM".

### 2.4 All office screens
- **MUST:**
  - Visible labels on every form field
  - Errors shown inline next to the field
  - Disabled submit button with a spinner while pending
  - Toast on success
- **MUST:** list screens have filters (project, status, date), an empty state with one clear action, and skeleton loaders.
- **SHOULD:**
  - A command palette (Ctrl/⌘-K)
  - Keyboard shortcuts on approval lists (A approve / R reject)

### 2.5 Type
- **UI:** Fira Sans (per the design database recommendation for data dashboards).
- **Codes, IDs, quantities in tables:** Fira Code, with `font-variant-numeric: tabular-nums` everywhere numbers align.
- **Headings:** Fira Sans 600.
- Do not mix more than these two families.

### 2.6 Motion
- **MUST:**
  - 150–250ms ease-out
  - Animate only opacity and transform
  - `prefers-reduced-motion` turns off count-ups, staggers, and bar fills
- **SHOULD:**
  - Staggered card entrance on the portfolio (up to 30ms per card, capped at 300ms total)
  - Progress bars fill on first view

### 2.7 Copy (plain English for site staff)
- Buttons say what happens: "Submit today's report", "Approve & update progress", "Record receipt".
- Error messages name the fix. For example: *"Only 12 bags of Cement OPC 53 in Main Store. Reduce quantity or record a receipt first."*
- Offline copy reassures. For example: *"Saved on your phone. Will send automatically."*

---

## 3. Design process for Claude Code (bounded to fit the demo timeline)

1. **Before the first UI milestone:**
   - Run the ui-ux-pro-max design system generator with `--persist` so the tokens are recorded.
   - **Then override its colours and fonts with section 2 above.** This document wins where they differ, because brand and field research outrank generic recommendations.
2. **Before building the DPR screen and the Portfolio Progress screen:** run `/impeccable shape` on each. Keep it to one pass, and use this document plus PRODUCT.md as the brief. Do not interview Kasi; the answers are here.
3. **After milestone 7:** run `/impeccable critique` and `/impeccable audit` on those two screens only. Fix the findings in one batch.
4. **At milestone 9:** run `/impeccable polish` once across the app, plus `/impeccable adapt` for the 390px and 1440px views. Then stop polishing. Time goes to working flows.

---

## Sources

- AlterSquare — Mobile-First Design for Construction Management Software: https://altersquare.io/mobile-first-design-for-construction-management-software-field-usability-guide/
- Affective — How Should I Design Apps for Construction Workers?: https://weareaffective.com/learning-centre/how-should-i-design-apps-for-construction-workers
- Google Open Health Stack — Design Guidelines for Offline & Sync: https://developers.google.com/open-health-stack/design/offline-sync-guideline
- Powerplay — Site Engineer app: https://www.getpowerplay.in/site-engineer/
- CIPO — What Should Be In a Construction Project Dashboard?: https://ciposoftware.com/2025/07/10/what-should-be-in-a-construction-project-dashboard/
- ui-ux-pro-max skill data (ux-guidelines.csv, charts.csv, design-system generator), run on 29-Sep-2026
