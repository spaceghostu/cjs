# T02 — UI primitives

**Depends on:** T01
**Blocks:** every screen ticket.

## Context

`src/lib/components/ui/` is an empty directory. `components.json` is configured
(style `nova`, baseColor `neutral`, lucide icons) but nothing has been pulled in. Every
screen in the design is assembled from a small, closed set of primitives — the design's
"Primitives & states" block is the contract.

## Scope

Install the shadcn-svelte components the design actually uses, restyle them onto T01's
tokens, and give each a Storybook story covering the states the design specifies.

### Components to install

`button`, `input`, `label`, `select`, `dialog`, `badge`, `table`, `card`, `tabs`,
`tooltip`, `skeleton`, `separator`, `avatar`, `dropdown-menu`, `command`, `sonner`.

### Button variants — exact states from the design

| Variant     | Rest                                    | Hover                                      | Active           | Focus                                | Disabled                              |
| ----------- | --------------------------------------- | ------------------------------------------ | ---------------- | ------------------------------------ | ------------------------------------- |
| Primary     | `--brand`, white text, 500              | `--brand-hover`                            | `--brand-active` | 2px `--brand-focus-ring`, 2px offset | `--surface-raised` bg, `--text-muted` |
| Secondary   | 1px `--border-strong`, `--text-primary` | 1px `--border-hover` + `--surface-overlay` |                  | same ring                            |                                       |
| Quiet       | no border, `--text-secondary`           |                                            |                  | same ring                            |                                       |
| Destructive | 1px `#6E3B33`, `--state-wrong` text     |                                            |                  | same ring                            |                                       |

Control height `36px`, radius `8px`, horizontal padding `16px`. Mobile primary actions are
`50px` tall, radius `12px`, full width. **Minimum touch target 44px on mobile.**

### Input states

| State   | Border             | Background       | Note                                       |
| ------- | ------------------ | ---------------- | ------------------------------------------ |
| Rest    | `--border-control` | `--surface-card` | placeholder `--text-muted`                 |
| Focus   | `--brand`          | `--surface-card` | 2px `rgba(brand, .28)` outline, 1px offset |
| Invalid | `#8A4A3F`          | `--surface-card` | message below in `--state-wrong`           |

Height `38px`, radius `8px`. Inputs that hold numbers use JetBrains Mono.

### Status badge

Six variants, all `12px`, radius `5px`, padding `4px 9px`:
`Paid` (settled), `Sent` (raised surface / secondary text), `Due in N days` (attention),
`Overdue` (wrong), `Draft` (`#24272D` / muted), `Drafted for you · check it`
(quoting accent at 15%).

### Skeleton

The design is explicit: **a skeleton, never a spinner over content.** Bars at `10px` high,
radius `5px`, in `--border-default` / `--surface-raised` / `#24272D` at varying widths.

## Out of scope

Money rendering (T03). Anything composed of more than one primitive — app shell, dialogs
with real content, tables with real columns. Those live in their screen tickets.

## Acceptance criteria

- [ ] All listed components present under `src/lib/components/ui/`.
- [ ] Zero raw hex values in any component — tokens only.
- [ ] Every button variant renders all five states correctly in both themes.
- [ ] Focus rings are visible on every interactive element and survive theme switch.
- [ ] Mobile variants meet the 44px touch minimum.
- [ ] A Storybook story per component, with the `a11y` addon reporting no violations.
- [ ] `bun run test:stories` passes in both light and dark projects.
- [ ] `bun run check` clean.

## Files

- `src/lib/components/ui/**`
- `src/stories/**`
