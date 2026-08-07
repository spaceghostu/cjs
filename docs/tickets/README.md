# CJs Platform — implementation tickets

Derived from the Claude Design project **CJs modular business platform**
(`8b9f697b-94d8-4968-9682-86699b140994`), file `CJs Platform.dc.html` plus its two
imported components, `AppSidebar.dc.html` and `AppTopBar.dc.html`.

`support.js` in that project is the Claude Design canvas runtime (a React renderer for
`<x-dc>`, `sc-for`, `sc-if`, `dc-import`). It carries no design content and nothing is
ported from it.

## Agreed constraints

| Decision           | Choice                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Depth              | **Full product.** Real schema, RLS, server actions, working flows. Not fixtures.                     |
| Undesigned screens | **Stubbed.** Sign-in, onboarding, settings and export get minimal functional pages, revisited later. |
| Theming            | **Both, dark default.** Light derived from the four values the design states.                        |
| Shell              | **1a (sidebar).** The design marks it recommended; 1b is documented as breaking past ~6 modules.     |

## Order

Tickets are dependency-ordered. Phase N generally needs Phase N-1, but tickets within a
phase are often parallel — each ticket states its own dependencies.

| #   | Ticket                                                                     | Phase              |
| --- | -------------------------------------------------------------------------- | ------------------ |
| T01 | [Design tokens and theme system](T01-design-tokens.md)                     | 0 · Foundation     |
| T02 | [UI primitives](T02-ui-primitives.md)                                      | 0 · Foundation     |
| T03 | [Money and number display](T03-money-display.md)                           | 0 · Foundation     |
| T04 | [Business, membership and RLS](T04-tenant-schema.md)                       | 1 · Platform floor |
| T05 | [Tenant context and request plumbing](T05-tenant-context.md)               | 1 · Platform floor |
| T06 | [Stub screens: sign-in, onboarding, settings, export](T06-stub-screens.md) | 1 · Platform floor |
| T07 | [Desktop app shell](T07-app-shell.md)                                      | 2 · Shell          |
| T08 | [Mobile shell](T08-mobile-shell.md)                                        | 2 · Shell          |
| T09 | [Command bar](T09-command-bar.md)                                          | 2 · Shell          |
| T10 | [Module catalogue and subscriptions](T10-module-schema.md)                 | 3 · Modules        |
| T11 | [Module switcher dialog](T11-module-switcher.md)                           | 3 · Modules        |
| T12 | [Proration and the add/remove confirmation](T12-proration.md)              | 3 · Modules        |
| T13 | [Undo, locked state, contextual add](T13-module-affordances.md)            | 3 · Modules        |
| T14 | [Home dashboard](T14-home.md)                                              | 4 · Home           |
| T15 | [Customers and quoting schema](T15-quoting-schema.md)                      | 5 · Quoting        |
| T16 | [Quote editor](T16-quote-editor.md)                                        | 5 · Quoting        |
| T17 | [Document preview and PDF](T17-document-pdf.md)                            | 5 · Quoting        |
| T18 | [Send and accept a quote](T18-quote-send.md)                               | 5 · Quoting        |
| T19 | [Invoicing schema](T19-invoicing-schema.md)                                | 6 · Invoicing      |
| T20 | [Invoice list](T20-invoice-list.md)                                        | 6 · Invoicing      |
| T21 | [Invoice detail and payments](T21-invoice-detail.md)                       | 6 · Invoicing      |
| T22 | [Mobile invoicing](T22-mobile-invoicing.md)                                | 6 · Invoicing      |
| T23 | [Inventory schema](T23-inventory-schema.md)                                | 7 · Inventory      |
| T24 | [Stock count flow](T24-stock-count.md)                                     | 7 · Inventory      |
| T25 | [Skeletons and motion](T25-motion.md)                                      | 8 · Cross-cutting  |
| T26 | [Validation and error states](T26-validation.md)                           | 8 · Cross-cutting  |
| T27 | [Accessibility pass](T27-accessibility.md)                                 | 8 · Cross-cutting  |

## What the design does not cover

The catalogue lists seven modules. Three have screens: **Quoting**, **Invoicing**,
**Inventory**. Payroll, Bookings, Job scheduling and Expenses exist only as catalogue rows
and accent colours — Payroll is the worked example for the _add a module_ flow, but has no
module of its own. Nothing in these tickets builds them.

The shell also links to **Settings** and **Export your data**, and the product cannot be
reached without **sign-in** and **business creation**. None of those four are designed.
T06 stubs them.

## Open questions

Carried into the tickets that hit them. None block starting.

### 1. The invoice amount column — line total or unit price?

The desktop invoice detail reconciles cleanly:

```
Counter and bar top      1    16 400.00
Shelving unit           2     4 600.00
Fitting and finishing    1        ±0.00
                    Before VAT   21 000.00
                    VAT 15%       3 150.00
                    Amount due   24 150.00   ✓
```

So the **amount column is the line total**, and `4 600.00` is the total for two shelving
units. But the mobile version of the same invoice renders `Shelving unit ×2 → R9 200`,
which totals R28 750 against a header that still says R24 150.

**Recommendation:** desktop is authoritative — amount is the line total. Mobile's `R9 200`
is the error. Raised in T21 and T22.

### 2. `±0.00` on a line item

`Fitting and finishing` shows `±0.00`. Presumably "included, no charge". Needs a decided
representation — a zero-amount line, or a line flagged as included. Raised in T19.

### 3. The contextual-add total

The contextual add panel says adding Invoicing gives a "new total R600/mo". Thornhill owns
Invoicing at R150 in every other screen, and their total is R450. The arithmetic works
(450 + 150) but the tenant state contradicts the rest of the design. Read as a separate
hypothetical tenant. Raised in T13.

### 4. Helper text fails the design's own contrast floor

The foundations block states a **4.6:1 floor** and that `#96989F` is the quietest text
permitted — "no text goes quieter". But `#7D7F88` is used for essentially all 12px helper
text and timestamps across every screen.

Measured against the surfaces it actually sits on:

| Foreground | Surface        | Ratio      | AA (4.5:1) |
| ---------- | -------------- | ---------- | ---------- |
| `#7D7F88`  | `#1B1D22` card | **4.22:1** | fails      |
| `#7D7F88`  | `#0E0F12` base | 4.80:1     | passes     |
| `#96989F`  | `#1B1D22` card | 5.85:1     | passes     |
| `#96989F`  | `#0E0F12` base | 6.65:1     | passes     |

Most helper text in the design sits on cards, where it fails. Raised in T01 (token
definition) and T27 (the pass). **Recommendation:** lift the helper token to `#96989F` and
keep `#7D7F88` for non-text decoration only.

### 5. The margin panel's three figures do not reconcile

T21's "The numbers behind it" shows Materials R14 280, Labour R6 720 and **What you keep**
R6 150, on the invoice whose subtotal is R21 000. But:

```
14 280 + 6 720 = 21 000     — exactly the whole subtotal
```

So if those two are **costs**, the business kept nothing and R6 150 is impossible. If they
are instead a split of the revenue into materials-work and labour-work, then "what you keep"
is not derivable from them at all and R6 150 would have to come from a cost the panel never
shows. There is no reading under which all three are true together — the same species of
error as the mobile `R9 200` in open question 1.

**Decision (implemented):** Materials and Labour are **costs**, and

```
What you keep = revenue − materials − labour
```

always, with every figure read from a `core_posting` row rather than computed for display.
The panel then adds up on every invoice, which is the property that matters — a screen whose
three numbers do not reconcile teaches an owner not to trust the fourth. Where a line's cost
is unknown the panel says so and states the figure as an upper bound; where nothing is known
it shows no figures at all. Raised in T19 and T21; the reasoning lives in
`src/lib/core/invoicing/margin.ts`.

## Conventions

- Each ticket is self-contained: an implementer should not need to reopen the design.
- Exact design values are quoted in the ticket that needs them.
- Every ticket lists acceptance criteria that can be checked without asking anyone.
- `bun run check` must stay at zero errors, zero warnings after every ticket.
