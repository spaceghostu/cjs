# T03 — Money and number display

**Depends on:** T01, T02
**Blocks:** T14, T16, T20, T21, T22, T24.

## Context

`src/lib/core/money/` is already built and tested, and it already produces exactly what the
design shows. `THOUSANDS_SEPARATOR` is a space, so `formatZar` renders `R84 200` verbatim.
`priceDocument` implements ZA VAT per group with a named, versioned policy
(`za_vat_per_group_half_away_v1`). `Money` is an object type, so `amount * 0.15` is a
compile error rather than a rounding bug.

What is missing is the _presentation_ layer: the design has firm rules about how numbers
look, and repeating them at every call site guarantees drift.

## Scope

A small set of display components that wrap the existing money core. **No new arithmetic.**
Anything that computes belongs in `src/lib/core/money/`, not here.

### `<Amount>`

Renders a `Money`. JetBrains Mono, `font-variant-numeric: tabular-nums`.

| Prop       | Effect                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| `size`     | `sm` 13px · `md` 14px · `lg` 20px · `xl` 24px · `hero` 32px (`-0.02em` at lg and up)                         |
| `tone`     | `default` → `--text-primary` · `owed` → `#3FB3A8` · `settled` → `--state-settled` · `muted` → `--text-muted` |
| `signed`   | Renders `−R7 120` / `+R1 140` for variances. Uses U+2212 minus, not hyphen.                                  |
| `decimals` | Screen amounts round to whole rand (`R84 200`); document amounts show cents (`24 800.00`).                   |

The design is deliberate that **money is neutral** — colour only flags an exception. Default
tone is plain text. `owed` teal is used for receivable totals; do not colour every number.

### `<Qty>` and `<UnitPrice>`

Mono, tabular, right-aligned in tables. Wrap `formatQty` / `formatUnitPrice`.

### `<StatDelta>`

The `R450 → R570` pattern from the add-module confirmation: old value in `--text-muted` at
20px, an arrow, new value at 32px in the relevant accent, then a plain-language unit label
in Inter.

### Empty and unknown

`—` in `--text-muted` for a value that does not exist (a draft with no amount). `None` in
words where the design says `None` (the "Overdue" summary stat). These are different: one
is absent, one is a meaningful zero, and the design distinguishes them.

## Out of scope

Any calculation. Currency other than ZAR — `CurrencyCode` is a union of one today and
widening it is deliberately a feature, not a migration.

## Acceptance criteria

- [ ] `<Amount>` renders `R84 200`, `R48 760.00`, `−R7 120`, `+R1 140` exactly as designed.
- [ ] Every numeral is mono and tabular; columns of numbers align on the decimal.
- [ ] No component imports from `money/ctor` — the ESLint restriction stays intact.
- [ ] Unit tests cover each `tone`, `size`, `signed` and `decimals` combination.
- [ ] Storybook story showing a column of mixed-magnitude amounts proving alignment.
- [ ] `bun run check` clean.

## Files

- `src/lib/components/money/`
- `src/lib/components/money/*.test.ts`
- `src/stories/Money.stories.svelte`
