# BUILDFlow — what we need you to confirm

The spec left these open, so we made a sensible choice for each. Tick **Agree**, or write what you want instead. The full list, with reasons, is in `DECISIONS.md`.

| # | Topic | What BUILDFlow does today | Agree | Change to |
|---|---|---|:-:|---|
| 1 | Daily report | One report per site per day. Several engineers add to it; the first to submit locks it. The PM approves, and stock and progress only update on approval. | ☐ | |
| 2 | Progress % | Weighted by each activity's planned cost. "Planned" is a straight line between an activity's start and finish dates. Days behind = the date the plan reached today's actual %. | ☐ | |
| 3 | Over-reporting | An activity can be reported up to 110% of its planned quantity, then the report is stopped. | ☐ | |
| 4 | Labour | Mandays = headcount × hours ÷ 8, at most 16 hours per line. Engineers never see or enter money. The server works out cost from each trade's average daily wage. | ☐ | |
| 5 | Health score | Out of 100: schedule 50, open Major/Critical NCRs 20, open critical issues 15, daily reports filed in the last 7 days 15. 75+ Healthy, 50–74 Watch, below 50 At risk. | ☐ | |
| 6 | Buying | A PO needs a chosen quotation, and at least two quotations must be in. GST is per line, default 18%. Stock is valued at the PO rate (before GST), by moving average. | ☐ | |
| 7 | Invoices and payments | An invoice needs a receipt and can't push the total above the PO. A payment can't exceed what is owed. A receipt can't exceed what is still due. | ☐ | |
| 8 | Who sees money | Owner and Accounts see everything. A PM sees money only on their own sites. Procurement sees PO rates but not payments. Admin, Store Keeper, engineers and clients see none. | ☐ | |
| 9 | Not built yet | Billing, Receivables, Expenses, Cash Flow, Reports and Notifications are placeholders. Marketing gets Clients only. Client Bills and Payments are placeholders. | ☐ | |
| 10 | Inspections and NCRs | All checkpoints pass = Pass. 80% or more = Conditional pass. Below 80% = Rejected, and an NCR is raised. An NCR goes Open → Corrective action → Rectification → Reinspection → Closed. | ☐ | |
| 11 | Rework and delays | Rework cost is visible to the Owner and the site's PM only. A delay names a responsible **function** (Site execution, Procurement, Design, Client side, and so on), never a person. | ☐ | |
| 12 | Subcontractors | The PM issues work orders and records measurements (never beyond the ordered quantity). Accounts bills from measured work with 5% retention by default. | ☐ | |
| 13 | Equipment | A machine is on one site at a time. The PM assigns it and logs hours, maintenance and breakdowns. | ☐ | |
| 14 | What the client sees | Only approved reports, only photos the PM shares, only released documents. The promised finish date shows next to the current expected one. No plan comparison, issues, NCRs, delays or money. | ☐ | |
| 15 | Drawings | A new upload replaces the current one and goes back for approval. Old versions stay viewable inside the company. | ☐ | |
| 16 | Projects and clients | Only the Owner creates a project (it sets the contract value). A project's client is fixed once created. Admin never sees contract value. | ☐ | |
| 17 | Offline | A report written offline and sent on another day is refused, not filed under today. Signing out clears what is saved on the phone. | ☐ | |
| 18 | Ask BUILDFlow | Owner and PM get a preview with four fixed questions (behind schedule, low stock, open NCRs, labour mandays). No typing yet; the AI assistant is Phase 2. | ☐ | |
| 19 | Brand | Colours are placeholders (navy and green). Send the brand hex codes and we swap them in one file. | ☐ | |

**Still to be specified by you:** what "Billing", "Receivables" and "Expenses" should contain, and whether Reports and Notifications are needed in the first release.
