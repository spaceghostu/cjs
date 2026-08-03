# T07 — Desktop app shell

**Depends on:** T01, T02, T06
**Blocks:** T14, T16, T20, T21, T24.

## Context

The design presents two shells and picks one. **1a — sidebar, categorised** is marked
_recommended_: "Every module is a visible, labelled destination. Catalogue can grow without
reshaping the shell." **1b — top bar + module tabs** is documented as breaking past ~6
modules, where tabs overflow into a "More" menu, "which is recall, not recognition."

Build 1a. 1b is not built.

Source: `AppSidebar.dc.html` and `AppTopBar.dc.html`.

## Scope

### Sidebar — 272px, fixed

Background `--surface-sunken`, right border `--border-subtle`, padding `18px 14px 16px`,
gap `22px`.

**Header.** A 30px rounded square (`9px` radius, `--surface-raised`) holding the tenant's
initials, then the tenant name at 14/500 and a 12px subtitle giving role and location —
"Owner · Cape Town". Both come from `core_business` and `core_member`.

**Navigation.** Grouped, with an 11px uppercase `0.1em` label per group in `--text-muted`.
Groups from the design:

| Group        | Items              |
| ------------ | ------------------ |
| _(no label)_ | Home               |
| Sales        | Quoting, Invoicing |
| Operations   | Inventory          |
| People       | Payroll _(locked)_ |

Groups are **derived from the module catalogue**, not hardcoded — that is the whole point
of choosing 1a. A business owning no Operations module shows no Operations group.

**Rows.** Height `38px`, radius `8px`, gap `10px`, 17px icon, 14px label.

| State           | Style                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| Active          | `--surface-raised` background, `--text-primary`, weight 500, icon in the module accent |
| Owned, inactive | `--text-secondary`, icon `--text-muted`                                                |
| Locked          | `--text-muted`, icon `--text-muted`, trailing 12px "Add"                               |

Note: the design's own source has a no-op ternary that gives owned-inactive and locked
icons the same colour. Keep them the same — locked rows are distinguished by the label
colour and the "Add" affordance, which is calmer and matches the intent.

**Footer.** Above a `--border-subtle` rule: "Add a module" with the running monthly total
right-aligned in mono, "Export your data", "Settings". The monthly total is live from T10.

### Top bar — 56px

Background `--surface-base`, bottom border `--border-subtle`, padding `0 28px`.

Left: the command bar, `34px` tall, max-width `380px`, `--surface-card`, border
`--border-control`, radius `8px` — magnifier icon, "Search, or ask a question", and a `⌘K`
hint chip in mono. **Rendered only when AI is enabled.** Right: the date in 12px
`--text-muted`, then a 28px round avatar with the user's initials.

The design is firm that this is the only always-visible AI surface, and that turning AI off
removes it "without taking any capability with it". So the flag hides the bar and nothing
else — no feature may be reachable _only_ through it.

### Layout route

A `(app)` group owning the shell, with the module routes nested inside. Active nav state
derives from the URL. Content area scrolls; the shell does not.

## Out of scope

Command bar behaviour (T09). Mobile (T08). The module switcher the footer opens (T11).

## Acceptance criteria

- [ ] Sidebar groups and rows are generated from the catalogue, not hardcoded.
- [ ] Active state derives from the URL and survives a reload.
- [ ] A locked module renders muted with "Add" and routes to the locked state, not a 404.
- [ ] Turning AI off removes the command bar and nothing else; no capability is lost.
- [ ] The running monthly total in the footer matches the module switcher exactly.
- [ ] Keyboard navigation reaches every nav item with a visible focus ring.
- [ ] The shell does not scroll; only the content area does.
- [ ] Storybook stories for each active state and for AI on/off.
- [ ] `bun run check` clean.

## Files

- `src/routes/(app)/+layout.svelte`
- `src/routes/(app)/+layout.server.ts`
- `src/lib/components/shell/AppSidebar.svelte`
- `src/lib/components/shell/AppTopBar.svelte`
- `src/stories/Shell.stories.svelte`
