# T24 — Stock count flow

**Depends on:** T03, T07, T23
**Blocks:** —

## Context

The design calls this out as the pattern-setter:

> A multi-step money flow: progress is visible, nothing commits until reviewed, and it's
> interruptible.

Whatever shape this takes becomes the template for every future multi-step flow in the
platform — pay runs, VAT returns, bank reconciliation. Worth building carefully.

## Scope

### Header band

Module eyebrow in `#D9A445`, "Inventory". Title "Stock count · July" at 24/600. Then the
promise, plainly: **"Nothing changes in your stock until you've reviewed it at step 3."**
Right-aligned: "Started Tuesday · saved automatically".

### Stepper

Four steps, connected by `56px` `#33363E` rules:

| Step | Marker                                      | Label          |
| ---- | ------------------------------------------- | -------------- |
| 1    | Settled-green tick on a 18% tint            | Prepare        |
| 2    | `--brand` filled circle, white mono numeral | Count          |
| 3    | Outlined `--border-strong`, `--text-muted`  | Review changes |
| 4    | Outlined                                    | Update stock   |

20px circles. Completed steps are ticked, current is filled, future is outlined. The labels
are verbs in plain language — "Update stock", not "Commit".

### Reassurance line

A settled-green tick, then two statements: **"42 of 48 items match what we expected."** and
"6 are different — they're at the top of the list."

Variances sort to the top. The interface does the triage, so the person does not scroll
looking for problems.

### Variance table

Columns `1fr 150px 100px 120px 110px 130px` — Item, Where, Expected, You counted,
Difference, Value effect.

| Cell            | Rendering                                                                        |
| --------------- | -------------------------------------------------------------------------------- |
| Expected        | Mono, `--text-secondary`, right                                                  |
| You counted     | **An input.** Mono, bordered `--border-strong`, radius `6px`, padding `5px 10px` |
| Not yet counted | `not yet` in `--text-muted`, **dashed** `#33363E` border                         |
| Difference      | Mono; `--state-attention` when negative, `--text-secondary` when positive        |
| Value effect    | Mono, `--text-primary`, signed with U+2212                                       |

The dashed border for uncounted is doing real work — it reads as "awaiting input", not as a
value. Keep it.

Final row collapses the matches: "42 items matched exactly · All locations · — · — · 0" with
"Show them" on the right.

### Sticky footer

`--surface-sunken`, top border. Left: **"Saved automatically — leave and come back
whenever."** with "47 of 48 counted · net effect on stock value −R8 000" beneath. Right:
"Finish later" (secondary) and "Review 5 changes" (primary).

The primary names the count. Not "Continue".

### Steps 3 and 4

Not drawn in the design; build them in the same register. **Review** lists exactly what will
change and what it is worth, and is the last point of return. **Update stock** applies
atomically, then confirms what happened.

## Out of scope

Mobile counting. The design does not attempt it, and counting stock on a phone while
standing at a rack is a genuinely different design problem — worth doing later, properly.

## Acceptance criteria

- [ ] Nothing writes to stock before step 4, verifiable by inspecting levels mid-count.
- [ ] The count survives closing the tab at any step, on any device.
- [ ] Variances sort to the top automatically.
- [ ] "not yet" is visually and semantically distinct from a counted zero.
- [ ] The footer running total updates live and matches the review step exactly.
- [ ] Applying is atomic — a failure part-way leaves nothing changed.
- [ ] Every count input is keyboard-reachable and labelled for screen readers.
- [ ] The worked example reproduces: 47 of 48, net −R8 000, 5 changes to review.
- [ ] `bun run check` clean.

## Files

- `src/routes/(app)/inventory/counts/[id]/+page.svelte`
- `src/routes/(app)/inventory/counts/[id]/+page.server.ts`
- `src/lib/components/inventory/**`
- `src/lib/components/flow/Stepper.svelte` (reusable — this is the template)
