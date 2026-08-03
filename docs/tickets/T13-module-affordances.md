# T13 — Undo, locked state, contextual add

**Depends on:** T12
**Blocks:** —

## Context

Three small surfaces that carry most of the design's argument about how modularity should
feel. Each is short; together they are the difference between a platform and a paywall.

## Scope

### 1. Post-add toast — undo stays available

`--surface-overlay`, border `--border-strong`, radius `10px`, padding `14px 16px`, shadow
`0 12px 32px rgba(0,0,0,.4)`. A settled-green check, then two lines — "Payroll added — it's
ready in People" and "4 people and your tax settings came across" — then **Undo** in
`--brand` at 13/500.

Undo closes the subscription period as if it never opened, and charges nothing. Uses
`sonner`, already installed in T02. Give it a real dismissal window, not three seconds.

### 2. Locked module — calm, not a paywall

The design's heading is the specification. `--surface-card`, border `--border-default`,
radius `10px`, padding `28px`, left-aligned, gap `10px`.

A 22px module icon in its accent. Then, at 16px: "Payroll isn't part of your workspace
yet". Then, at 13px `--text-secondary`, max-width 380px, the value stated concretely for
_this_ business: "It would arrive with your 4 people already loaded. R120/mo, removable any
time." Then a **secondary** button: "See what Payroll does".

Note what is absent: no primary CTA, no urgency, no interstitial. The secondary button
explains before it sells. The entitlement gate from T05 routes here for a never-owned
module.

For a **removed** module the state is different and must not reuse this component: the data
is still there, read-only and exportable, and the message says so.

### 3. Contextual add — at the moment of need

Appears inline where a capability is actually missing. From the design: after "Quote
QT-1041 was accepted by Waterkant Property Group", an inset panel offering "Turn it into an
invoice", with the cost stated plainly in 12px — "Needs Invoicing · R150/mo · new total
R600/mo" — and a **secondary** "Add and continue" button.

Then, critically, the escape hatch below it in 12px `--text-muted`:

> Or download the accepted quote as a PDF and invoice it yourself — no module needed.

That line is the design's whole ethic. It is not optional copy.

**Open question (README #3):** the design's "new total R600/mo" assumes Invoicing is not
owned, while every other screen shows Thornhill owning it at R150 within a R450 total. Read
it as a different tenant state and compute the figure live — never hardcode it.

## Out of scope

The quote-accepted flow itself (T18). PDF generation (T17).

## Acceptance criteria

- [ ] Undo fully reverses an add: period closed, no charge, sidebar total restored.
- [ ] The undo window is long enough to actually use, and dismissal is explicit.
- [ ] The locked state has no primary CTA and no urgency language.
- [ ] Locked copy names real carried-over data for the acting business.
- [ ] A removed module renders the read-only/exportable state, not the locked state.
- [ ] Contextual add always computes its total live from T12.
- [ ] The "no module needed" escape hatch is present and works.
- [ ] `bun run check` clean.

## Files

- `src/lib/components/modules/ModuleAddedToast.svelte`
- `src/lib/components/modules/LockedModule.svelte`
- `src/lib/components/modules/RemovedModule.svelte`
- `src/lib/components/modules/ContextualAdd.svelte`
