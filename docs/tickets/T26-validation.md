# T26 — Validation and error states

**Depends on:** T02
**Blocks:** — (sweep, but read before building forms)

## Context

The design shows one validation example, and it is doing a lot of work:

> **Caught before saving** — `2026/13/02` — _There's no 13th month — did you mean 2 Dec
> 2026?_

Three things at once: caught _before_ saving, explains _why_ it is wrong, and offers the
likely intent. That is the standard for every message in the product.

`zod` v4 is already a dependency, and the coding standards require schema-based validation
at every system boundary.

## Scope

### The message standard

Every validation message must:

1. Say what is wrong in plain language — "There's no 13th month", not "Invalid date format".
2. Offer the probable intent where one exists — "did you mean 2 Dec 2026?"
3. Appear before the save attempt, not after it.

Never surface an exception, a field path, or a schema error verbatim.

### Field states

From T02: invalid border `#8A4A3F`, message beneath in `--state-wrong` at 12px. The field
keeps what the person typed — never clear input to "fix" it.

### Money and quantity input

`parseMoneyInput`, `parseQuantityInput` and `parseUnitPriceInput` already exist in the money
core and already return a `ParseResult`. Wire the UI to that result rather than
re-implementing parsing in components. South African conventions are already handled —
space thousands separator, comma decimal.

### Server-side validation

Every action validates server-side with zod regardless of client validation. The client
check is a courtesy; the server check is the boundary.

### Error states beyond fields

| Situation              | Behaviour                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Save failed            | Say so, keep the work, offer retry. Never silently lose a draft.                                           |
| Mail could not be sent | Honest refusal, per `mail.ts`. Never a false success.                                                      |
| Not entitled           | The calm locked state from T13, not an error.                                                              |
| Not permitted (staff)  | State the reason — "Owners and billing admins only".                                                       |
| Not found              | Distinguish "does not exist" from "not yours" _in the UI copy only_ — never leak existence across tenants. |

### Empty states

Distinct from errors, and distinct from each other. A module with no records yet is not the
same as a filter that matched nothing. The design's register applies: calm, specific, never
scolding.

## Out of scope

Retry and offline strategy. Error monitoring and alerting.

## Acceptance criteria

- [ ] No raw schema or exception text reaches a user.
- [ ] Validation fires before save; invalid input is preserved, not cleared.
- [ ] Where a probable intent exists, it is offered.
- [ ] Money and quantity inputs use the money core's parsers exclusively.
- [ ] Every server action validates independently of the client.
- [ ] A failed save never loses work.
- [ ] "Not found" copy never reveals that another tenant's record exists.
- [ ] Empty states are distinct from error states and from each other.
- [ ] `bun run check` clean.

## Files

- `src/lib/core/validation/`
- `src/lib/components/ui/form/`
- per-screen error and empty states
