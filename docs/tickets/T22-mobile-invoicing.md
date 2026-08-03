# T22 — Mobile invoicing

**Depends on:** T08, T20, T21
**Blocks:** —

## Context

Two of the design's three mobile questions: _did they pay_, and _send this_. These screens
are not the desktop list and detail narrowed — they are different compositions answering
different questions.

## Scope

### Invoice list — 390 × 844

Header: "Invoices" at 20/600, "Export" at 13px on the right. Below, a horizontal filter
row of pills — active `--surface-raised` at 13/500; the rest bordered `--border-control`.
`Unpaid 6` leads, because that is the question being asked.

**Cards, not rows.** `--surface-card`, border `--border-default`, radius `12px`, padding
`16px`:

- Client name at 15px, status badge right-aligned
- Amount at 22px mono — `#3FB3A8` when it is money owed, `--text-primary` otherwise — with
  `INV-1042 · 1 Aug` in 12px mono `--text-muted`
- **Only on the card that needs action**, two side-by-side `44px` secondary buttons:
  "Remind them" and "Mark paid"

Actions appear on the one card that needs them. Every other card is information.

Floating primary: "New invoice", `50px`, radius `12px`, over a gradient fade to
`--surface-base`.

### Invoice detail

Header: back chevron, `INV-1042` at 15/500, "PDF" at 13px.

**Lead with the answer.** "Baraka Café owes you" at 14px, then the amount at **32px** mono
in `#3FB3A8`, then the due badge and "Opened twice" side by side.

**Line summary panel.** `--surface-card`, radius `12px`, padding `6px 16px`, rows divided by
`--border-subtle`. Description left at 14px `--text-secondary`, amount right in mono.

> **README open question 1 applies here.** The design renders `Shelving unit ×2 → R9 200`,
> which does not reconcile with the R24 150 header. The desktop document is authoritative:
> the amount column is the **line total**. Render `R4 600`. The `×2` in the description is
> fine and useful; the amount must be the line total.

**What's happened.** The same timeline as T21, trimmed to the two most recent events.

**Footer actions.** "Record a payment" primary at `50px`, "Send a reminder" secondary at
`48px`, then centred in 12px `--text-muted`: **"Both can be undone."**

## Out of scope

Mobile quote editing — the design does not attempt it, and a line-item table on a phone is
a separate design problem. Mobile stock counting (T24 notes this too).

## Acceptance criteria

- [ ] No horizontal scroll at 390px.
- [ ] Every touch target is at least 44px.
- [ ] Action buttons appear only on cards that need action.
- [ ] Line amounts are line totals and reconcile to the header — R24 150 for INV-1042.
- [ ] The floating action never obscures the last card.
- [ ] "Both can be undone." is present and true.
- [ ] `bun run test:mobile` passes for both screens.
- [ ] `bun run check` clean.

## Files

- `src/routes/(app)/invoicing/+page.svelte` (responsive branch)
- `src/routes/(app)/invoicing/[id]/+page.svelte` (responsive branch)
- `src/lib/components/invoicing/InvoiceCard.svelte`
