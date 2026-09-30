# DPR screen — shaped brief (impeccable `shape`, one pass)

Sources: `PRODUCT.md`, `docs/UX_RESEARCH.md` §2.2, kickoff prompt §6. No interview was run; the answers are in those documents. Assumptions are marked **(assumed)**.

## 1. Job and audience
- **Mode: Operate.** A Site Engineer, outdoors in bright sun, one hand on a mid-range Android phone, dusty fingers, patchy data.
- Job: file today's Daily Progress Report in about one minute. Anything that does not help finish that in a minute does not belong on the screen.

## 2. Outcome and proof
- Primary action: **SUBMIT DAILY REPORT**. Success: the PM sees quantities, labour, material, photos and issues for today, and approval moves the project's actual % on the portfolio screen.
- Truth specific to this product: yesterday's work is almost always today's work. The screen starts **pre-filled from yesterday** (activities, labour crew) so the engineer mostly types quantities.

## 3. Direction (inside the established BUILDFlow world)
- Visual authority: `theme.css` tokens, light theme + Sunlight mode. Brand green only for the primary slab, the actual/progress fill, focus rings. Steel-blue means plan, green means reality.
- Structure: **one scrolling column**, five sticky-headed sections in the order the work happens: Weather → Work done (activity + quantity + labour) → Material used → Photos → Issues & remarks. The submit slab is pinned to the bottom, full width, 64px, above the safe area.
- Focal moment: the submit slab, and the success screen (check morph, `navigator.vibrate(10)`, "Report sent to <PM name> for approval").
- Inputs: chips for small sets (weather, trade, source, hours, severity), a bottom-sheet picker with search for activities and materials ("Today's work" pinned first), numeric keypad with the unit inside the field, a +/- stepper for headcount.
- No money anywhere. No tables. No hover-only affordances. No swipe-only actions.

## 4. Scope and boundaries
- Production screen and full flow: draft → autosave → submit → (PM) approve/reject → engineer sees status. Offline outbox comes in milestone 8; the save/submit calls are already whole-report and idempotent so the outbox can replay them.
- Untouched: no DPR history screen for the engineer (today's report only).
- Anti-goals: no dashboard on this screen, no charts, no cost, no multi-step wizard.

## 5. States and ranges
- Report states: **not started**, **draft** (autosaved), **submitted** (read-only, waiting for PM), **approved** (read-only), **rejected** (reason shown, editable, resubmit).
- Typical day: 2–4 activities, 1–2 labour rows each, 0–3 material lines, 0–6 photos, 0–2 issues. Maximum handled: about 12 activities.
- Empty/first-run: no activities yesterday → the screen opens with **Add activity** and "Today's work" suggestions.
- Errors name the problem and the fix, e.g. "Only 12 cum left on Footing concrete (planned 92, done 80). Enter 12 or less, or ask your PM to raise the planned quantity."

## 6. Interaction and layout
- Autosave on change (debounced) with a calm "Saved on server 4:02 PM" line; a failed save shows "Not saved yet — tap to retry". The submit slab is disabled until there is at least one quantity (or "No work today" with a remark).
- "Same as yesterday" on each activity copies yesterday's crew; a "Copy all from yesterday" sits at the top of Work done.
- Material rows show **available stock** for that material in the project; a soft warning appears when the quantity exceeds it (approval will block, submit will not).
- Photos: the camera opens directly; images are compressed on the phone to about 300 KB; each thumbnail shows its own upload state.
- Second engineer on the same project/day edits the same draft (their own rows only). After the first submit the report is locked.

## 7. Constraints and decisions a builder must not reopen
- Touch targets ≥ 56px, primary bar 64px, body text ≥ 17px, quantities ≥ 28px tabular.
- One DPR per project per day (database-enforced). Stock and progress post on **approval**, not submit.
- Weather chips: Sunny, Cloudy, Rain, Heavy rain. Weather defaults to the last used.
- Labour hours per line > 0 and ≤ 16; mandays = headcount × hours ÷ 8.
- Material lines are issued to a named activity; stock is taken from Main Store first, then other locations.
