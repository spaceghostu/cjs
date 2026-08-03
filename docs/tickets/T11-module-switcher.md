# T11 — Module switcher dialog

**Depends on:** T02, T10
**Blocks:** T12.

## Context

The design's framing: "add and remove in the same place… Owned modules show Remove with
equal weight to Add." The switcher is where the product's central promise is either
credible or not.

Opened from "Add a module" in the sidebar footer.

## Scope

### Dialog

`760px` wide, max height `740px`, `--surface-overlay`, border `--border-strong`, radius
`14px`, shadow `0 24px 64px rgba(0,0,0,.5)`, over a `rgba(8,9,11,.62)` scrim.

### Header

Title "Modules" at 20/500. Subtitle stating the count in plain language — "You have 3. Add
or remove any of them here — one tap either way." Below it a `36px` "Find a module" filter
field.

### Body — categorised

Group label at 11px uppercase `0.1em` `--text-muted`, then rows at `12px 14px`, radius
`10px`, gap `14px`.

**Owned row.** Background `--surface-raised`, 18px icon in the module accent, name at 14/500
`--text-primary`, description at 12px, price in mono `--text-muted`, then a **Remove**
button — secondary, bordered `--border-strong`, `--text-secondary`.

**Available row.** No background, icon `--text-muted`, name at 14/400
`--text-strong-secondary`, same description and price, then an **Add** button in `--brand`,
white, weight 500.

Remove is a real, equally reachable button. It is not hidden in a menu, and it is not
styled as destructive — removal is reversible and the design says so.

### Footer

`--surface-card`, top border. The running total in mono — "R450**/month today**" — then the
proration promise in 12px: "You're only charged for the days you have a module. Remove one
and the next bill drops." Right-aligned: "Owners and billing admins only".

That last line is not decoration. `core_member.role` gates the buttons: staff see the
catalogue and see that they cannot change it.

## Out of scope

What happens after Add or Remove is clicked — the confirmation, the arithmetic, the toast
(T12, T13).

## Acceptance criteria

- [ ] Categories and rows come from T10; adding a module to the catalogue needs no UI change.
- [ ] Owned and available rows are visually distinct but equally weighted in affordance.
- [ ] Filter narrows across name and description.
- [ ] A staff member sees the dialog with controls disabled and the reason stated.
- [ ] The footer total matches the sidebar total exactly, from the same function.
- [ ] Dialog traps focus, closes on `Esc`, returns focus to the trigger.
- [ ] Body scrolls; header and footer do not.
- [ ] Storybook stories: owner, staff, empty catalogue, all-owned, filtered.
- [ ] `bun run check` clean.

## Files

- `src/lib/components/modules/ModuleSwitcher.svelte`
- `src/lib/components/modules/ModuleRow.svelte`
- `src/routes/(app)/modules/+page.server.ts`
- `src/stories/ModuleSwitcher.stories.svelte`
