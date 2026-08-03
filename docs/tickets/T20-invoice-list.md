# T20 — Invoice list

**Depends on:** T03, T07, T19
**Blocks:** —

## Context

The design's rule for this screen, stated as its subtitle:

> Money is neutral; colour only flags the exception. "Overdue: none" is stated rather than
> hidden.

Both halves matter. Amounts are `--text-primary` by default — colour appears only where
something needs attention. And a zero count is shown as a reassurance, not omitted.

## Scope

### Header

Module eyebrow: 14px invoicing icon in `#3FB3A8`, "Invoicing" at 12px in the accent. Title
"Invoices" at 24/600. Then the state in one plain sentence: **"6 unpaid, none overdue. One
is due on Monday."** Generated, not templated into awkwardness — this line is the screen's
summary and must read like a person wrote it.

Right: "New invoice" primary with a plus icon.

### Summary bar

`--surface-card`, border `--border-default`, radius `10px`, padding `18px 20px`, gap `48px`.

| Stat          | Value    | Tone                     |
| ------------- | -------- | ------------------------ |
| Owed to you   | R84 200  | `#3FB3A8`                |
| Due this week | R24 150  | default                  |
| Overdue       | **None** | `--text-muted`, in words |

"Overdue" renders the word `None` — not `R0`. When there _is_ overdue money it becomes an
amount in `--state-wrong`. This is the neutrality rule in miniature.

Right-aligned: "Export CSV" secondary, then "Yours to take, any time" in 12px.

### Filter tabs

Counts inline, not badges: `All 24`, `Unpaid 6`, `Overdue 0`, `Paid 16`, `Drafts 2`. Active
is `--surface-raised`, radius `7px`, weight 500. `Overdue 0` is shown, not hidden.

### Table

Columns `110px 1fr 110px 130px 140px 140px` — Invoice, Client, Issued, Due, Status, Amount.
Header on `--surface-card`; rows divided by `--border-row`; the row needing attention gets a
`--surface-card` background.

| Cell         | Rendering                                                         |
| ------------ | ----------------------------------------------------------------- |
| Invoice      | Mono 13px. Drafts show `Draft` in `--text-muted`, not a number    |
| Client       | 14px                                                              |
| Issued / Due | 13px `--text-secondary`; a near due date goes `--state-attention` |
| Status       | T02 badge                                                         |
| Amount       | 14px mono, right-aligned; a draft with no amount shows `—`        |

Status copy from the design is relative and human: `Due in 3 days`, `Sent`, `Viewed by
client`, `Paid 24 Jul`, `Draft · needs an amount`. Not enum names.

### Pagination

24 invoices fit; a real business will have thousands. Add a bound and a paging affordance
now — an unbounded query is a defect waiting for a successful customer.

## Out of scope

Detail (T21). Mobile (T22). Creating an invoice — "New invoice" routes to the editor, which
reuses T16's shape.

## Acceptance criteria

- [ ] Amounts are neutral by default; colour appears only for attention and overdue.
- [ ] Zero counts are shown, never hidden.
- [ ] `Overdue` renders `None` in words at zero.
- [ ] Status copy is relative and human, computed from dates at render time.
- [ ] Drafts render `Draft` and `—` rather than a fabricated number or amount.
- [ ] The query is bounded and paged.
- [ ] CSV export is scoped by `Ctx` and matches the active filter.
- [ ] Sortable, keyboard-navigable, with a real table semantic for screen readers.
- [ ] `bun run check` clean.

## Files

- `src/routes/(app)/invoicing/+page.svelte`
- `src/routes/(app)/invoicing/+page.server.ts`
- `src/lib/components/invoicing/**`
