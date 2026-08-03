# T15 — Customers and quoting schema

**Depends on:** T04, T05, T10
**Blocks:** T16, T17, T18, T19.

## Context

The first module with real documents. Everything here has to satisfy the platform floor —
`business_id`, forced RLS, no `DELETE` — and everything monetary has to go through
`priceDocument`.

`core_customer` belongs to the floor (T04), not to Quoting: both Quoting and Invoicing read
it, and the design shows a quote becoming an invoice.

## Scope

### `quote`

Header fields the design's editor and document both need:

- Customer, and the specific contact the quote is sent to
  (`renske@fynbosinteriors.co.za` is a _send-to_, distinct from the customer record).
- Document number from `core_document_number` — `QT-1043`.
- Status: draft, sent, viewed, accepted, declined, expired.
- Valid-until date, with the business's default term ("Your usual 14 days").
- Deposit terms — the design shows "50% to start" with the computed amount
  (R24 380 on a R48 760 total).
- Autosave timestamp. The editor's contract is "All changes saved · 21:47. You can close
  this and come back."

### `quote_line`

Description, an optional second line of provenance ("From Inventory · European oak, 40mm" /
"Labour · your standard day rate"), quantity, unit price, and the tax treatment
`priceDocument` needs.

Lines may originate from an inventory item. Store the link **and** a snapshot of the
description and price at the time of adding. A quote sent last month must not silently
change because someone edited a stock item — this is the same principle the money core
applies to its VAT policy.

### Totals

Never stored as the source of truth. Computed by `priceDocument` with `VAT_POLICY`, which
already produces the design's exact shape: before-VAT R42 400, VAT at 15% R6 360, total
R48 760. Persist a snapshot alongside the sent document for the audit trail, but recompute
for anything live.

### Customer defaults

The editor states: "Filled in from your customer list. Change it here and we'll ask if you
want it saved." So an override on a quote is local by default, with an explicit promotion
back to `core_customer`. Model both.

### Business document identity

The document header needs trading name, street address, VAT number and phone — all on
`core_business` from T04. Verify they are there; add what is missing.

## Out of scope

The editor UI (T16). PDF (T17). Sending and acceptance (T18). Invoices (T19).

## Acceptance criteria

- [ ] Passes `scripts/invariants.sql` — `business_id` on every table, RLS forced, no `DELETE`.
- [ ] Document numbers are gapless and unique per business under concurrent allocation,
      proven by a concurrency test.
- [ ] A quote line sourced from inventory keeps its snapshot when the source item changes.
- [ ] Totals recomputed from lines equal the stored snapshot for every seeded fixture.
- [ ] The design's worked example reproduces exactly: 24 800 + 8 600 + 9 000 → 42 400 →
      VAT 6 360 → 48 760, deposit 24 380.
- [ ] A customer override on a quote does not mutate `core_customer` without an explicit act.
- [ ] `bun run check` clean.

## Files

- `src/lib/server/core/db/schema/quoting.ts`
- `src/lib/server/core/db/map.ts`
- `drizzle/**`
- tests alongside
