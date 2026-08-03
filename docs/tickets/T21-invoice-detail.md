# T21 — Invoice detail and payments

**Depends on:** T17, T19, T20
**Blocks:** T22.

## Context

_"The document, then the story of it."_ The design's subtitle states the two commitments:

> Recording a payment is reversible and says so; the reasoning behind every number stays
> one tap away.

## Scope

### Header band

Breadcrumb: "Invoicing" in `#3FB3A8`, a `/` in `#565963`, then `INV-1042` in mono
`--text-muted`. Title at 24/600 — **"Baraka Café · R24 150"**, client and amount together.
Then, at 14px: "Sent 18 July. Due Monday, 1 August. They opened it twice."

Right: "Send a reminder" (secondary), "Record a payment" (primary).

### Centre — the document

`--surface-sunken` gutter, the T17 paper at `560px`, centred. `TAX INVOICE`, banking details
in the footer, "Thank you — we appreciate your business."

### Right rail — 360px

**What's happened.** Reverse-chronological events, each a 6px dot — settled green for the
most recent, `#565963` for the rest — with a 13px line and a 12px timestamp:

- Opened by Baraka Café · Twice · last 26 Jul, 08:41
- Emailed to accounts@barakacafe.co.za · 18 Jul, 09:12
- Created from quote QT-1036 · 18 Jul, 09:04 · by you

Actor attribution ("by you") comes from the audit actor T05 sets on the session.

**The numbers behind it.** A `--surface-card` panel: Materials R14 280, Labour R6 720, then
above a rule, **"What you keep" R6 150**. Below, in 12px: "Materials came from Inventory at
the price you paid. See the workings."

Plain language over accounting vocabulary — "What you keep", not "gross margin". The figures
reconcile to ledger postings (T19), and "See the workings" opens them. When Inventory is not
owned the panel degrades honestly rather than guessing at cost.

**Reversibility, stated.** Above a rule, at 13px: "Recording a payment can be undone for 30
days. Cancelling an invoice can't — we'll ask you to confirm." Then: Download PDF ·
Duplicate · Cancel invoice, with Cancel using T02's destructive variant.

The interface states the consequence _before_ the action, not in a dialog after it.

### Record a payment

Amount (defaulting to the full outstanding), date, method, reference. Writes an
`invoice_payment` and an event; moves the invoice to `paid` when fully settled. Reversible
for 30 days via a reversal row.

### Send a reminder

Uses `mail.ts`, writes an event, and — as everywhere — never reports a send that failed.

## Out of scope

Credit notes. Mobile (T22). Partial-payment UI beyond recording an amount less than the total.

## Acceptance criteria

- [ ] Reversibility is stated on the screen before the action, not only in a dialog.
- [ ] Payment reversal works within 30 days and is refused after.
- [ ] Cancellation requires explicit confirmation and is irreversible.
- [ ] Timeline entries are real events with real actors; open counts are accurate.
- [ ] Margin figures reconcile to ledger postings; "See the workings" shows them.
- [ ] With Inventory unowned, the margin panel degrades honestly.
- [ ] A failed reminder is reported honestly and does not write a success event.
- [ ] Paper renders light in dark theme.
- [ ] `bun run check` clean.

## Files

- `src/routes/(app)/invoicing/[id]/+page.svelte`
- `src/routes/(app)/invoicing/[id]/+page.server.ts`
- `src/lib/components/invoicing/ActivityTimeline.svelte`
- `src/lib/components/invoicing/MarginPanel.svelte`
- `src/lib/components/invoicing/RecordPaymentDialog.svelte`
