# T16 — Quote editor

**Depends on:** T02, T03, T07, T15
**Blocks:** T17.

## Context

The design's framing: _"the document is client-facing, so it leads."_ The editor is a
two-pane screen — form on the left, live client-facing preview on the right — because what
the client receives is the thing being made.

## Scope

### Header band

Padding `28px 32px 20px`, bottom border `--border-subtle`.

Module eyebrow: a 14px Quoting icon in `#6E8CF0` and the word "Quoting" at 12px in the same
accent. Then the title at 24/600 — "Quote for Fynbos Interiors". Then, with a settled-green
tick, the save state in 13px: **"All changes saved · 21:47. You can close this and come
back."**

That sentence is a promise the implementation must keep. Autosave, and never lose work.

Right: "Preview PDF" (secondary) and "Send to client" (primary).

### Left pane — the form

**Who it's for.** Two-column grid. A Client select at `38px` with a chevron, and a Send-to
field. Below, in 12px: "Filled in from your customer list. Change it here and we'll ask if
you want it saved."

**What you're quoting.** A bordered table, radius `10px`, columns `1fr 68px 108px 108px` —
Item, Qty, Unit price, Total. Header row on `--surface-card`. Each line: description at
14px with a 12px provenance line beneath, then three mono right-aligned numerals. Rows
divided by `--border-row`.

Final row is the add affordance: a plus icon and "Add a line — or pick from Inventory". When
Inventory is not owned, that becomes a T13 contextual add rather than disappearing.

**The numbers.** A 300px column: "Before VAT", "VAT at 15%", then above a `--border-default`
rule, "Client pays" at 14/500 with the total at 20px in `#6E8CF0`. All from `priceDocument`.

**Terms.** Two fields — "Valid until" with helper "Your usual 14 days", and "Deposit" with
the computed amount as helper ("R24 380 on acceptance"). The helper recomputes live.

### Right pane — what the client sees

`520px`, `--surface-sunken` gutter, left border `--border-subtle`, padding `24px`. Eyebrow
"What the client sees" with "Your branding, applied" right-aligned.

The document itself renders on **paper** — the theme-invariant `--paper-*` tokens from T01.
Detailed in T17; this ticket embeds it and keeps it in sync as the form changes.

## Out of scope

The document renderer and PDF (T17). Sending (T18). Inventory picking beyond the seam.

## Acceptance criteria

- [ ] Autosave is real: kill the tab mid-edit and everything typed is still there.
- [ ] The save indicator reflects actual persistence, never an optimistic guess.
- [ ] Totals come from `priceDocument`; no arithmetic in the component.
- [ ] The preview updates as the form changes, with no full re-render flash.
- [ ] The paper preview stays light in dark theme.
- [ ] Changing a client-derived field offers to save it back; declining leaves the customer
      record untouched.
- [ ] With Inventory unowned, the add-line row offers the contextual add.
- [ ] Table is keyboard-navigable; every field is labelled.
- [ ] `bun run check` clean.

## Files

- `src/routes/(app)/quoting/[id]/+page.svelte`
- `src/routes/(app)/quoting/[id]/+page.server.ts`
- `src/lib/components/quoting/**`
