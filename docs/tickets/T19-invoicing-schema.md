# T19 — Invoicing schema

**Depends on:** T15
**Blocks:** T20, T21, T22.

## Context

Invoices are tax records. `.env.example` already states why the database must be physically
in South Africa — SARS GN 787 rule 4.1 — and the platform's blanket `REVOKE DELETE` exists
so that "business records are never destroyed" is structural. Invoicing is the module those
decisions were made for.

The schema barrel reserves a `ledger` schema for `core_posting` / `core_allocation`,
described as "unused until Invoicing". This is where it gets used.

## Scope

### `invoice`

Customer, contact, number from `core_document_number` (`INV-1042`), issue date, due date,
status, and the originating quote where there is one — the design shows "Created from quote
QT-1036".

Statuses from the design's own filter tabs and badges: `draft`, `sent`, `viewed`, `paid`,
`overdue`, `cancelled`. Note that `overdue` is **derived from the due date**, not stored —
storing it guarantees a stale row somewhere. The list shows "Overdue 0" as a real count.

An invoice, once sent, is immutable. Corrections are credit notes, not edits. The design
supports this: "Recording a payment can be undone for 30 days. Cancelling an invoice can't
— we'll ask you to confirm."

### `invoice_line`

As `quote_line`, plus the resolution of **README open question 1**.

The desktop document reconciles: `16 400 + 4 600 + 0 = 21 000`, VAT `3 150`, due `24 150`.
So the amount column is the **line total**, and the mobile rendering of `Shelving unit ×2 →
R9 200` is the error. Store quantity and unit price; derive the line total. T22 renders
`R4 600` for that line.

Also here: `±0.00`. A line at zero that is deliberately included ("Fitting and finishing")
is not the same as a missing price. Model it as an explicit no-charge flag so the document
can render it meaningfully rather than showing a bare `0.00`.

### `invoice_payment`

Amount, date, method, reference, and who recorded it. Reversible for 30 days — so a
reversal is a row, never a delete. After 30 days the reversal path closes.

### `invoice_event`

The activity timeline in T21: created, emailed (to which address), opened (with a count —
"Twice · last 26 Jul, 08:41"), reminded, paid, cancelled. Append-only.

### `ledger`

`core_posting` / `core_allocation` — the double-entry backing that lets "The numbers behind
it" in T21 be true rather than a display calculation. Materials, labour, and what the
business keeps, each traceable to a posting.

### Cost of sale

The design's margin panel needs the cost side: materials "came from Inventory at the price
you paid". When Inventory is owned, cost comes from the stock item's cost at the time the
line was added — a snapshot, like T15's price snapshot. When it is not, the panel must
degrade honestly rather than guess.

## Out of scope

All UI (T20, T21, T22). Payment provider integration — none is implied by the design.
Credit notes beyond reserving the concept.

## Acceptance criteria

- [ ] Passes `scripts/invariants.sql`.
- [ ] `overdue` is derived, never stored.
- [ ] A sent invoice cannot be edited; the attempt fails at the database, not just the UI.
- [ ] Payment reversal creates a row; nothing is ever deleted.
- [ ] Reversal is refused after 30 days.
- [ ] Cancellation is irreversible and requires explicit confirmation.
- [ ] INV-1042 reproduces exactly: `21 000` before VAT, `3 150` VAT, `24 150` due.
- [ ] The margin figures reconcile to ledger postings, not to a display calculation.
- [ ] With Inventory unowned, cost of sale degrades honestly.
- [ ] `bun run check` clean.

## Files

- `src/lib/server/core/db/schema/invoicing.ts`
- `src/lib/server/core/db/schema/ledger.ts`
- `drizzle/**`
- tests alongside
