# T14 — Home dashboard

**Depends on:** T03, T05 (`fanout.ts`), T07, T10
**Blocks:** —

## Context

"Friday evening, Chantal. Everything across your business, in one place."

Home is the design's thesis in one screen: the default state is _nothing needs you_, and
the interface says so confidently instead of manufacturing urgency. It also reads from
every owned module at once, which is why `client.ts` and `fanout.ts` exist.

## Scope

Header: "Home" at 24/600, then a greeting line at 14px `--text-secondary`.

### 1. The all-clear panel

`--surface-card`, border `--border-default`, radius `12px`, padding `32px`, gap `28px`.

A 30px settled-green check, then "You're all clear." at 20/500 and, at 14px with `1.55`
line-height and max-width 520px: "Nothing needs you today. Checked a minute ago — if that
changes, you'll see it here first."

Below a `--border-subtle` rule, a three-column grid of reassurances — a 14px statement and a
12px explanation each:

| Statement                   | Explanation                              |
| --------------------------- | ---------------------------------------- |
| 3 quotes waiting on clients | Sent 4 to 11 days ago. None chased yet.  |
| VAT return prepared         | Due 25 August. Nothing to do until then. |
| Stock levels healthy        | 48 items counted, none running low.      |

These are **derived, not decorative**. Each owned module contributes its own reassurance,
and each must be able to contribute a _concern_ instead. Design the not-all-clear variant
now: the same panel, the same calm register, stating what needs attention.

### 2. Pick up where you left off

Eyebrow, then resume cards — `--surface-card`, radius `10px`, padding `14px 16px`, gap `14px`.
Module-accented 17px icon, title at 14px, a 12px context line ("Draft saved 21:47 yesterday
· 3 of 5 items priced"), and "Resume" in `--brand` at 13/500.

Any module can contribute a draft. The context line names concrete progress.

### 3. This month, plainly

Three cards, `--surface-card`, radius `10px`, padding `18px`, gap `8px`. Label at 13px,
amount at 24px mono, footnote at 12px.

| Label               | Tone      | Footnote                           |
| ------------------- | --------- | ---------------------------------- |
| Money owed to you   | `#3FB3A8` | Across 6 invoices · none overdue   |
| Money you owe       | default   | 2 supplier bills · first due 8 Aug |
| Paid to you in July | default   | June was R131 400                  |

Only the receivable is coloured. The design's rule from the invoice list applies here too:
money is neutral; colour flags the exception.

### 4. Coming up — 336px right column

A `--surface-card` panel, padding `6px 16px`, rows divided by `--border-subtle`. Each row: a
46px mono date in `--text-muted`, then the item at 13px. Rows may carry a second line
("VAT return · already prepared" / "Review it whenever you like").

### 5. Your modules

Same panel treatment. Per row: a 6px accent dot, the name, the price in mono. Final row:
the total — "R450**/month**" with the unit in `--text-muted` — and "Add or remove" in
`--brand`, opening T11.

## Out of scope

The module screens themselves. The VAT return — referenced in copy, not designed. Supplier
bills — "Money you owe" implies an Expenses module that does not exist; render zero-state
honestly rather than inventing data.

## Acceptance criteria

- [ ] Every panel is composed from module contributions; a business with one module gets a
      coherent Home, not gaps.
- [ ] The all-clear panel has a designed not-all-clear variant in the same register.
- [ ] "Money you owe" renders an honest empty state when no Expenses module exists.
- [ ] All queries go through `fanout.ts` and respect its concurrency bound.
- [ ] Each panel loads independently with a T25 skeleton — never a spinner over content.
- [ ] One slow module cannot block the rest of the page.
- [ ] Amounts use T03; every numeral is mono and tabular.
- [ ] `bun run check` clean.

## Files

- `src/routes/(app)/+page.svelte`
- `src/routes/(app)/+page.server.ts`
- `src/lib/components/home/**`
- `src/lib/server/core/home.ts`
