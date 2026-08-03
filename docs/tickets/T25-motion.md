# T25 — Skeletons and motion

**Depends on:** T01, T02
**Blocks:** — (but every screen ticket should be checked against it)

## Context

The design gives motion two sentences and both are rules, not suggestions:

> Motion: 150–200ms, ease-out, forward only. Acknowledge every input inside 400ms, even
> when the work takes longer.

And, in the primitives block:

> Loading — a skeleton, never a spinner over content.

Run this ticket after the screens exist, as a sweep — but read it before building them.

## Scope

### The 400ms rule

Every input gets a visible acknowledgement within 400ms, regardless of how long the work
takes. Button press states, optimistic transitions, a skeleton appearing. The failure mode
this prevents is the user pressing a button twice because nothing happened.

Audit every action across the product against this. Where the work is genuinely long
(applying a stock count, generating a PDF), the acknowledgement is a state change, not a
completion.

### Skeletons

Never a spinner over content. Skeleton bars at `10px` high, radius `5px`, in
`--border-default` / `--surface-raised` / `#24272D` at varying widths inside the real
container.

A skeleton mirrors the shape of what is coming — matching row counts, matching column
widths — so nothing jumps on arrival. Layout shift on load is the thing skeletons exist to
prevent; a skeleton that causes it is worse than none.

Every panel on Home loads independently (T14), so each needs its own.

### Transitions

150–200ms, ease-out, forward only. **Forward only** is a specific claim: no reversing
animation, no bounce, no spring. Dialogs and toasts appear and dismiss; they do not
rebound.

Define the timing and easing as tokens in T01 so no component invents its own.

### `prefers-reduced-motion`

Not mentioned in the design, and required regardless. Honour it: transitions become
instant, skeletons stay (they are content, not motion).

## Out of scope

Decorative animation. Page transitions between routes — the design shows none.

## Acceptance criteria

- [ ] Every interactive element acknowledges within 400ms — enumerated and tested, not
      assumed.
- [ ] No spinner is rendered over existing content anywhere in the product.
- [ ] Every async surface has a skeleton matching its loaded shape.
- [ ] Cumulative layout shift on load is effectively zero on Home, the invoice list, and
      the stock count.
- [ ] All transitions are 150–200ms ease-out, from tokens.
- [ ] Nothing reverses, bounces or springs.
- [ ] `prefers-reduced-motion` is honoured throughout.
- [ ] `bun run check` clean.

## Files

- `src/routes/layout.css` (motion tokens)
- `src/lib/components/ui/skeleton/`
- skeleton components alongside each screen
