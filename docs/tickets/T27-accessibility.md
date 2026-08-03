# T27 — Accessibility pass

**Depends on:** every screen ticket
**Blocks:** —

## Context

The design states a contrast floor and publishes ratios for its text ramp, which is more
rigour than most designs bring. It also, in one respect, does not meet its own bar — and
that needs fixing at the token level rather than screen by screen.

`@storybook/addon-a11y` is already installed.

## Scope

### 1. The helper-text contrast defect

The foundations block states a **4.6:1 floor** and that `#96989F` is the quietest text
permitted — "no text goes quieter". But `#7D7F88` is used for nearly every 12px helper line
and timestamp across every screen.

Measured (WCAG 2.x relative luminance):

| Foreground | Surface        | Ratio      | AA normal text (4.5:1) |
| ---------- | -------------- | ---------- | ---------------------- |
| `#7D7F88`  | `#1B1D22` card | **4.22:1** | **fails**              |
| `#7D7F88`  | `#0E0F12` base | 4.80:1     | passes                 |
| `#96989F`  | `#1B1D22` card | 5.85:1     | passes                 |
| `#96989F`  | `#0E0F12` base | 6.65:1     | passes                 |

Most helper text sits on cards, where it fails — and at 12px it is normal text, so the 3:1
large-text allowance does not apply.

**Fix at the token, not the screen.** T01 already specifies no `#7D7F88` text token. This
ticket verifies nothing reintroduced it, and confirms the design's stated ratios hold for
the ramp that shipped.

### 2. Contrast sweep

Every text-on-surface pair in both themes, including status badges (semantic colour on a
15% tint of itself is the riskiest combination in the system) and module accents used as
text.

### 3. Keyboard

Every interactive element reachable and operable. Visible focus rings throughout — the
design specifies 2px `--brand-focus-ring` at 2px offset. Dialogs trap focus and restore it
on close. The command bar (T09) is fully keyboard-driven. Tables are navigable.

### 4. Screen readers

Real semantics, not styled `div`s. The design is built almost entirely from `div` and
`span` with inline styles — that is normal for a design canvas and must not survive into
the implementation. Tables are tables, buttons are buttons, headings nest correctly. Status
badges announce their meaning, not just their colour. Live regions for autosave, toasts and
count progress.

### 5. Touch targets

44px minimum on mobile, per T08 and T22.

### 6. Colour is never the only signal

The design mostly respects this — status badges carry text as well as colour. Verify the
exceptions: the 6px module dots on Home and in the timeline, and the difference column in
the stock count, where `−4` in `--state-attention` versus `+6` in `--text-secondary` is
currently distinguished by colour _and_ sign. The sign carries it; confirm that holds
everywhere.

### 7. Motion

`prefers-reduced-motion`, per T25.

## Out of scope

A formal external audit. WCAG AAA.

## Acceptance criteria

- [ ] No text pair below 4.5:1 anywhere, in either theme, on the surface it actually sits on.
- [ ] `#7D7F88` appears in no text token and no text rule.
- [ ] The design's published ratios are verified against the shipped tokens.
- [ ] Every screen is fully keyboard-operable with visible focus.
- [ ] Dialogs trap and restore focus.
- [ ] Screen-reader pass on Home, the invoice list, the invoice detail and the stock count.
- [ ] All mobile targets at least 44px.
- [ ] No information conveyed by colour alone.
- [ ] `@storybook/addon-a11y` reports zero violations across all stories.
- [ ] `bun run test:stories` passes in both light and dark projects.
- [ ] `bun run check` clean.

## Files

- `src/routes/layout.css`
- sweep across `src/lib/components/**` and `src/routes/**`
