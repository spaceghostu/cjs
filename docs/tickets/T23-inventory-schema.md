# T23 — Inventory schema

**Depends on:** T04, T05, T10
**Blocks:** T24, and the cost-of-sale half of T19.

## Context

Inventory is where the design's most careful flow lives — a stock count that "nothing
commits until reviewed". It is also the source of truth for two things other modules
depend on: quote line provenance (T15) and cost of sale (T19).

## Scope

### `inventory_item`

Name ("European oak, 40mm board", "Blackened steel bracket, 300mm", "Danish oil, 5L"), unit
of measure, cost price, sell price, reorder point, and a default location.

Cost and sell are both `UnitPrice` — millionths of a rand, per the money core. Materials
priced per board-metre do not divide evenly into cents, which is exactly why that type
exists.

### `inventory_location`

Named places: "Rack A", "Bin 4", "Bin 9", "Finishing room", "Yard". Free-form per business,
not a fixed taxonomy — a joinery's yard and a café's cold room are the same concept.

### `inventory_level`

Quantity on hand per item per location. **Derived from movements, never set directly.** A
directly-writable quantity column is how stock silently diverges from its own history.

### `inventory_movement`

Append-only. Every change carries a reason: a count adjustment, a quote or invoice
consuming stock, a purchase, a manual correction. This is the ledger for physical things,
and it is what makes "Materials came from Inventory at the price you paid" (T21) provable
rather than asserted.

### `stock_count` and `stock_count_line`

A count is a staged, resumable, four-step process (T24). The schema must support all four
states without committing anything until the last:

- `stock_count` — period, status (`preparing` / `counting` / `reviewing` / `applied`),
  started-at, applied-at, and the actor.
- `stock_count_line` — the item, the location, the **expected** quantity snapshotted when
  the count was prepared, the **counted** quantity (nullable — "not yet" is a real and
  distinct state from zero), and the derived difference and value effect.

Expected is snapshotted at preparation, not read live. Otherwise stock moving during a
count silently changes what the counter is comparing against.

Applying a count writes `inventory_movement` rows — one per varying line — and never
overwrites a level.

### Value effect

The design shows `−4` on European oak as `−R7 120` — R1 780 per board. Value effect is
`difference × cost price at count time`, in `Money`, via the money core. Cost price is
snapshotted on the line like everything else.

## Out of scope

Purchase orders and suppliers. Multi-warehouse transfers. Barcode scanning. Reorder
automation — the reorder point is stored, but acting on it is not in the design.

## Acceptance criteria

- [ ] Passes `scripts/invariants.sql`.
- [ ] `inventory_level` cannot be written directly; it is derived from movements.
- [ ] `counted` distinguishes "not yet counted" from "counted zero".
- [ ] Expected quantities are snapshotted at preparation and do not drift mid-count.
- [ ] A count in any state before `applied` has changed no stock level.
- [ ] Applying a count is atomic — all movements or none.
- [ ] The design's worked line reproduces: expected 18, counted 14, difference −4, value
      effect −R7 120.
- [ ] The full worked count nets to −R8 000 across 47 of 48 items counted.
- [ ] `bun run check` clean.

## Files

- `src/lib/server/core/db/schema/inventory.ts`
- `drizzle/**`
- tests alongside
