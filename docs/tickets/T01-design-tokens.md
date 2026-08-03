# T01 — Design tokens and theme system

**Depends on:** —
**Blocks:** T02, T03, and every screen ticket.

## Context

`src/routes/layout.css` is stock shadcn-svelte `neutral` — pure greyscale, `--chart-1`
through `--chart-5` all grey. The design supplies a complete, deliberate token system that
replaces it wholesale. Getting this right once means, in the design's own words, "a new
module should need no new visual decisions".

Dark is the primary experience and the default. Light is derived from the same tokens, not
a separate design.

## Scope

Rewrite the token layer in `src/routes/layout.css`, install the missing font, and expose a
per-tenant brand hook.

### Surfaces — depth by layer, not shadow

| Token               | Dark      | Role                                       |
| ------------------- | --------- | ------------------------------------------ |
| `--surface-base`    | `#0E0F12` | Page background, top bar                   |
| `--surface-sunken`  | `#131417` | Sidebar, preview gutters, sticky footers   |
| `--surface-card`    | `#1B1D22` | Cards, table rows, inputs                  |
| `--surface-raised`  | `#292C33` | Active nav row, selected chip, module rows |
| `--surface-overlay` | `#23262C` | Dialogs, toasts                            |

### Borders

| Token              | Dark      | Role                             |
| ------------------ | --------- | -------------------------------- |
| `--border-subtle`  | `#292C33` | Section dividers, shell seams    |
| `--border-default` | `#2D3037` | Card and table outlines          |
| `--border-control` | `#33363E` | Inputs, quiet chips              |
| `--border-strong`  | `#3E4149` | Overlay edges, secondary buttons |
| `--border-row`     | `#24272D` | Table row separators             |
| `--border-hover`   | `#4C4F58` | Secondary button hover           |

### Text

| Token                     | Dark      | Role                                  |
| ------------------------- | --------- | ------------------------------------- |
| `--text-primary`          | `#F2F3F5` | Default                               |
| `--text-strong-secondary` | `#D6D8DE` | Inactive-but-present rows             |
| `--text-secondary`        | `#ADAFB8` | Supporting prose                      |
| `--text-muted`            | `#96989F` | Labels, eyebrows — **contrast floor** |

**Do not add a token for `#7D7F88`.** It measures 4.22:1 on `--surface-card`, below both
WCAG AA and the design's own stated 4.6:1 floor, and the design uses it for nearly all 12px
helper text. Map helper text to `--text-muted` (`#96989F`, 5.85:1 on card). See README open
question 4. If a decorative non-text use for `#7D7F88` appears, name it
`--decoration-quiet` so it can never be applied to a glyph.

### Brand and semantic

| Token                | Dark      | Role                                        |
| -------------------- | --------- | ------------------------------------------- |
| `--brand`            | `#5B6CFF` | Primary action. **Per-tenant overridable.** |
| `--brand-hover`      | `#6E7DFF` |                                             |
| `--brand-active`     | `#4A5AE0` |                                             |
| `--brand-focus-ring` | `#A6B0FF` | 2px outline, 2px offset                     |
| `--state-settled`    | `#35B37E` | Paid, all-clear, matched                    |
| `--state-attention`  | `#E0A93C` | Due soon, variance                          |
| `--state-wrong`      | `#E0685C` | Overdue, destructive, validation            |

Status pill backgrounds are the semantic colour at 15% alpha; `Sent` and `Draft` use
`--surface-raised` and `#24272D` respectively with `--text-secondary` / `--text-muted`.

### Module accents — wayfinding only, never fields of colour

Fixed across all tenants, unaffected by the brand override.

| Module         | Accent    |
| -------------- | --------- |
| Quoting        | `#6E8CF0` |
| Invoicing      | `#3FB3A8` |
| Inventory      | `#D9A445` |
| Payroll        | `#A177E8` |
| Expenses       | `#E07A6E` |
| Bookings       | `#56B57E` |
| Home (neutral) | `#9A9CA4` |

Accent tint background is the accent at 18% alpha.

### Light mode — derived

Base `#FBFBFA`, card `#FFFFFF`, borders `#E7E6E3`, text `#1A1A1C`, accents at full
saturation. Same token names, same layout. Held to the same contrast bar.

The document-preview paper (`#FBFBF9` with `#1A1A1A` text, `#E4E2DC` / `#EFEDE7` rules) is
**always light in both themes** — it is what the client receives. Name those tokens
separately, e.g. `--paper-*`, so theme switching cannot touch them.

### Type

Inter for words, JetBrains Mono for numbers. Inter is already installed;
`@fontsource-variable/jetbrains-mono` is not — add it.

| Size / weight                | Use                                 |
| ---------------------------- | ----------------------------------- |
| 32 / 600, `-0.02em`          | Hero                                |
| 24 / 600, `-0.02em`          | Page title                          |
| 20 / 500, `-0.01em`          | Section heading                     |
| 16 / 400                     | Body                                |
| 14 / 400                     | Default interface text, table cells |
| 12 / 400                     | Helper, timestamps                  |
| 11 / 500, `0.1em`, uppercase | Eyebrow labels                      |

Every numeral — money, quantity, dates in tables, document numbers, keyboard hints — is
JetBrains Mono with `font-variant-numeric: tabular-nums`.

### Space, radius, motion

Spacing scale 4 / 8 / 12 / 16 / 24 / 32. Radius `8px` controls, `12px` cards, `14px`
dialogs and shell frames. Motion 150–200ms, ease-out, forward only.

### Per-tenant brand

Only `--brand` (and its hover/active/focus derivatives) changes per tenant. Module accents
and neutrals stay fixed so a client's colour can sit on a quote without fighting the
interface. Expose the override as an inline custom property on the shell root so it can be
set from tenant data server-side without a flash. Palette from the design's own prop
options: `#5B6CFF`, `#2E8FA8`, `#8A63C4`, `#2E8F63`.

## Out of scope

Components (T02). Any screen. The per-tenant brand _storage_ — T01 only provides the CSS
hook; T10 stores the value.

## Acceptance criteria

- [ ] `layout.css` defines every token above for both `:root` (dark) and the light variant.
- [ ] Dark is the default; `mode-watcher` respects an explicit user choice.
- [ ] `@fontsource-variable/jetbrains-mono` installed and loaded.
- [ ] shadcn's own semantic names (`--background`, `--card`, `--primary`, `--border`,
      `--ring`, …) are mapped onto these tokens so unmodified shadcn components inherit the
      system.
- [ ] `--paper-*` tokens are theme-invariant.
- [ ] No component anywhere needs a raw hex value.
- [ ] A Storybook page renders the full foundations block — surfaces, text ramp, brand,
      semantics, accents, type scale, spacing, radii — in both themes.
- [ ] `bun run check` clean.

## Files

- `src/routes/layout.css`
- `package.json`
- `src/lib/components/theme/` (brand override helper)
- `src/stories/Foundations.stories.svelte`
