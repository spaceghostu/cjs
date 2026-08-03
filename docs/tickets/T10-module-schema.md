# T10 — Module catalogue and subscriptions

**Depends on:** T04, T05
**Blocks:** T07 (nav groups), T11, T12, T13, T14.

## Context

Modularity is the product. The shell, the billing, the nav and the entitlement gate all
read from one catalogue, and the design's stated goal is that the catalogue "can grow
without reshaping the shell".

The schema barrel already reserves a `billing` schema for "subscriptions and entitlement".

## Scope

### Catalogue

Seven modules, categorised, with the design's own prices and accents:

| Module         | Category   | Price   | Accent    | Description (from the design)                |
| -------------- | ---------- | ------- | --------- | -------------------------------------------- |
| Quoting        | Sales      | R120/mo | `#6E8CF0` | Branded quotes clients can accept online     |
| Invoicing      | Sales      | R150/mo | `#3FB3A8` | Invoices, reminders and payment tracking     |
| Bookings       | Sales      | R90/mo  | `#56B57E` | Let clients book site visits from your quote |
| Inventory      | Operations | R180/mo | `#D9A445` | Materials, stock counts and reorder points   |
| Job scheduling | Operations | R110/mo | —         | Plan the week and see who's on what          |
| Payroll        | People     | R120/mo | `#A177E8` | Monthly pay runs, payslips, PAYE and UIF     |
| Expenses       | —          | —       | `#E07A6E` | Accent only; no catalogue row in the design  |

Only Quoting, Invoicing and Inventory have screens. The rest exist so the catalogue,
switcher and billing are real — they render, they price, they are addable, and their module
route is the locked state until someone builds them.

Prices are `Money`, constructed through `db/map.ts` like everything else. Never floats.

### Subscription

`billing_subscription` — which modules a business has, and **when**. The design's promise is
"You're only charged for the days you have a module", so the record is a period with a start
and an optional end, not a boolean. Removing a module closes a period; re-adding opens a new
one. History is never destroyed.

### Entitlement

Feed `entitlement.ts` from T05. Three states, and they are genuinely distinct:

| State       | Meaning             | Behaviour                                                                                             |
| ----------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| Owned       | Active period today | Full read/write                                                                                       |
| Removed     | Had a closed period | **Read-only and exportable.** Data stays; the design is explicit that "your payroll data stays yours" |
| Never owned | No period ever      | Locked state; nothing to show                                                                         |

The middle state is the one that is easy to get wrong and expensive to retrofit.

### Category ordering

Sales, Operations, People — the order the design uses in both the sidebar and the switcher.
Store it; do not sort alphabetically.

## Out of scope

Proration arithmetic and the confirmation dialog (T12). The switcher UI (T11). Payment
collection — no payment provider is chosen yet, and none of the design implies one.

## Acceptance criteria

- [ ] Catalogue is data, not code branches. Adding an eighth module touches no shell code.
- [ ] Adding then removing then re-adding a module leaves two distinct periods.
- [ ] A removed module's data is readable and exportable but not writable.
- [ ] A never-owned module returns the locked state, not an error.
- [ ] The running total (R450 for Quoting + Invoicing + Inventory) is computed from
      subscriptions, and one function produces it for both the sidebar and the switcher.
- [ ] Every price is `Money`; no arithmetic on raw numbers anywhere.
- [ ] `bun run check` clean.

## Files

- `src/lib/server/core/db/schema/billing.ts`
- `src/lib/server/core/modules/catalogue.ts`
- `src/lib/server/core/entitlement.ts`
- `drizzle/**`
- tests alongside
