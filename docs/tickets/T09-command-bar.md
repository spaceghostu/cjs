# T09 — Command bar

**Depends on:** T02, T07
**Blocks:** —

## Context

"Search, or ask a question", `⌘K`. The design states the constraint plainly:

> The command bar is the only always-visible AI surface, and turning it off removes it
> without taking any capability with it. Anything it drafts arrives in the normal form,
> labelled, for you to send.

Two hard rules follow. **Nothing may be reachable only through the command bar** — if it
can be done here, it can be done through the interface. And **nothing it produces is ever
sent, saved or committed by it** — output lands in the ordinary form, marked
`Drafted for you · check it` (the badge variant already built in T02), for a human to
review.

## Scope

### Search — always available when the bar is shown

Across the business's own records, scoped by `Ctx` so results can never cross tenants:
customers, quotes, invoices, inventory items, and navigation destinations. Ranked, grouped
by type, keyboard-driven. Uses the shadcn `command` primitive from T02.

### Ask — only when AI is enabled

Out of scope to _implement_ an assistant in this ticket. In scope: the seam it plugs into.

- A clear boundary between "this is a search query" and "this is a question".
- A defined shape for a drafted result: what it drafts, which form it opens, and the
  labelling that survives to the screen.
- Nothing auto-commits. The design's phrasing is "arrives in the normal form, labelled, for
  you to send".

### Shortcut

`⌘K` / `Ctrl+K` opens; `Esc` closes; arrows move; `Enter` selects. Focus returns to where
it was on close.

### The off state

When AI is disabled, the bar does not render on desktop or mobile. Search remains reachable
from within each module's own screens. Verify no route or action becomes unreachable.

## Out of scope

The assistant itself — model calls, prompts, tools. Any generation. This ticket delivers
search plus the seam.

## Acceptance criteria

- [ ] `⌘K` opens from anywhere in the shell; `Esc` restores prior focus.
- [ ] Results are scoped by `Ctx`; a cross-tenant result is impossible by construction.
- [ ] Every destination reachable from the command bar is also reachable without it —
      enumerated in a test, not assumed.
- [ ] With AI disabled, the bar is absent and nothing is unreachable.
- [ ] Nothing the bar produces is committed without an explicit human action.
- [ ] Fully keyboard-operable; screen-reader announces result counts and groups.
- [ ] `bun run check` clean.

## Files

- `src/lib/components/shell/CommandBar.svelte`
- `src/lib/server/core/search.ts`
- `src/routes/(app)/api/search/+server.ts`
