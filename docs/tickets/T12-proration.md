# T12 — Proration and the add/remove confirmation

**Depends on:** T03, T10, T11
**Blocks:** T13.

## Context

The design's own heading: _"Adding a module — the confirmation is where trust is won."_ Its
rules are specific and each one is a decision, not a style:

> New total, not the delta. Proration, data-on-removal and how it arrives, all answered
> before being asked.

## Scope

### Proration engine

Daily proration. From the design's worked example: adding Payroll (R120/mo) on 31 July
charges **R4 now for the last day of July**, then R570 on 1 August. So the unit is a day,
the divisor is days-in-month, and July has 31 — R120/31 = R3.87, shown as R4.

Decide and document the rounding rule, and put it in `money/` with the same treatment
`priceDocument` gets: a named, versioned policy constant. Money that changes behaviour
silently between releases is the failure mode this codebase is built to prevent.

Removal mirrors it: "Remove it today and you're not charged at all."

### Confirmation dialog

`560px`, `--surface-overlay`, radius `14px`, padding `28px`, gap `24px`.

**Title.** Module icon in its accent, then "Add Payroll" at 20/500.

**The total.** A `--surface-raised` panel, radius `10px`, padding `20px`. Eyebrow "Your new
monthly total". Then the `<StatDelta>` from T03: old total at 20px `--text-muted`, arrow,
**new total at 32px in the module accent**, then "per month" in Inter at 14px.

The design shows the _new total_, not "+R120". Do not add a delta.

**Three answers, always, in this order:**

| Heading                | Content                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| When it takes effect   | Today. The prorated charge now, then the new total on the 1st. Real numbers.                                     |
| If you remove it later | Data stays. Module turns read-only and exportable. Switchable back on any time. Remove today, no charge.         |
| It arrives ready       | What carries over from modules already owned — company details, VAT number, people. "There's nothing to set up." |

The third is generated, not static. It must name what actually carries over for _this_
business, or it is a lie.

**Footer.** Above a `--border-strong` rule: "Remove it from the same place you added it."
then Cancel (secondary) and the primary confirm.

### Removal confirmation

The same dialog, inverted: new lower total, when it stops being charged, and what happens
to the data. Removal is not destructive and must not be styled as if it were.

## Out of scope

Taking payment. Invoicing the business for its own subscription. The undo toast (T13).

## Acceptance criteria

- [ ] Proration is a named, versioned policy constant in `money/`, with property tests
      (`fast-check` is already a dependency) proving no rounding drift across a year.
- [ ] Adding Payroll on 31 July charges R4 and quotes R570 from 1 August.
- [ ] Removing on the day of adding charges nothing.
- [ ] The dialog shows the new total, never a delta.
- [ ] "It arrives ready" names real carried-over data for the acting business.
- [ ] Removal uses the same dialog shape and is not styled destructively.
- [ ] Staff cannot reach either dialog.
- [ ] Subscription period rows are correct after add, remove and re-add.
- [ ] `bun run check` clean.

## Files

- `src/lib/core/money/proration.ts` + tests
- `src/lib/components/modules/AddModuleDialog.svelte`
- `src/lib/components/modules/RemoveModuleDialog.svelte`
- `src/lib/server/core/modules/subscribe.ts`
