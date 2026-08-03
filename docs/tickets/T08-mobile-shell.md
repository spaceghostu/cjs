# T08 — Mobile shell

**Depends on:** T07
**Blocks:** T22.

## Context

The design is explicit that mobile is **not the desktop workflow shrunk**. It names the
three questions mobile answers: _is it clear, did they pay, send this._ Reference frame is
390 × 844.

## Scope

### Header

Padding `18px 20px 12px`. A 30px rounded tenant square (`9px` radius), the tenant name at
15/500, and a 30px round avatar. No sidebar, no ⌘K chip.

Below it, when AI is enabled, a full-width `44px` search field — `--surface-card`, border
`--border-control`, radius `10px`, "Search, or ask a question". Note this is 44px on mobile
versus 34px on desktop: it is a touch target, not a hint.

### Bottom navigation

Top border `--border-subtle`, background `--surface-sunken`, padding `8px 4px 14px`. Five
equal items, each a 20px icon over an 11px label. Active is `--text-primary` at weight 500;
inactive is `--text-muted`.

The design's five: **Home, Quotes, Invoices, Stock, More**. Labels are always visible —
consistent with choosing recognition over recall in the shell decision.

With more than four modules owned, the first four keep slots and the rest move under
"More". Derive this; do not hardcode.

### Primary action in the thumb zone

Screens with one obvious action float it at the bottom: `50px` tall, radius `12px`, full
width, `--brand`, over a gradient fade to `--surface-base` so content scrolling underneath
does not collide with it.

### Tables become cards

No horizontal scrolling of a desktop table. Each row becomes a card: title, status badge,
amount at 22px in mono, a mono meta line, and — on the row that needs action — two
side-by-side `44px` secondary buttons.

### Breakpoint

One breakpoint between the mobile and desktop shells. Both are real layouts; there is no
intermediate tablet design, so pick the desktop shell above the breakpoint and let the
content area handle its own narrowing.

## Out of scope

The mobile invoice screens themselves (T22). Any module content.

## Acceptance criteria

- [ ] Bottom nav derives its items from owned modules; overflow lands in "More".
- [ ] Every touch target is at least 44px.
- [ ] The floating primary action never obscures the last row of content.
- [ ] Turning AI off removes the mobile search field, same as desktop.
- [ ] No horizontal scroll at 390px on any shell surface.
- [ ] `bun run test:mobile` passes.
- [ ] `bun run check` clean.

## Files

- `src/lib/components/shell/MobileNav.svelte`
- `src/lib/components/shell/MobileHeader.svelte`
- `src/lib/components/shell/PrimaryAction.svelte`
- `src/routes/(app)/+layout.svelte`
