# T05 — Tenant context and request plumbing

**Depends on:** T04
**Blocks:** T06, T07, and every server-side ticket.

## Context

`client.ts` documents an access model that does not exist yet:

> Module code takes a `Ctx` from `withModule(event, key, intent)`; there is no other route
> to the database, and `unsafeDb` is not assignable to the branded `Tx` that scoped code
> requires.

That sentence is the whole security model. `unsafeDb` is already ESLint-banned outside its
directory, and `assertDatabaseRoleIsSafe()` already proves at boot that the connection
cannot bypass RLS. What is missing is the thing module code actually holds.

`fanout.ts` is also referenced — the dashboard streams one short transaction per owned
module, and the fan-out is deliberately bounded so it can never demand more connections
than the pool has.

## Scope

### `Ctx` and the branded `Tx`

`withModule(event, key, intent)` opens a transaction, sets the RLS session variables via
`SET LOCAL`, and hands module code a `Ctx` carrying a branded `Tx`. The brand is what makes
`unsafeDb` structurally unusable in module code — not a convention, a type error.

`intent` distinguishes read from write so the entitlement gate can refuse a write to a
module the business does not own, without refusing the read that renders its read-only
archive. The design requires exactly this: removing a module leaves its data "read-only and
exportable".

### Session variables

Set with `SET LOCAL` inside the transaction — never plain `SET`, which leaks across pooled
connections. At minimum: the business id (drives every RLS policy) and the acting user id
(drives audit attribution).

### Request plumbing

`hooks.server.ts` resolves the session through better-auth, then resolves which business
this request is acting for, and puts it on `locals`. A signed-in user with no business goes
to onboarding (T06); a user with several picks one, and that choice persists.

### `fanout.ts`

Bounded parallel loading for the Home dashboard, which needs one query per owned module.
The bound must be a function of the pool size, and exceeding it must queue rather than
exhaust the pool.

### Entitlement gate

A single function answering "does this business own this module right now". Every module
route calls it. T10 supplies the data; T05 supplies the shape and the failure mode, which
is the calm locked state from the design, not an error.

## Out of scope

The module catalogue itself (T10). Any UI. Billing (T12).

## Acceptance criteria

- [ ] Module code cannot reach `unsafeDb` — proven by a type test, not just ESLint.
- [ ] `withModule` always uses `SET LOCAL`; a test proves the variable does not survive the
      transaction on a pooled connection.
- [ ] A request with no resolved business cannot read any tenant row.
- [ ] A user who belongs to business A cannot act for business B by editing the request.
- [ ] `intent: 'write'` against an unowned module is refused; `intent: 'read'` succeeds.
- [ ] `fanout.ts` never opens more concurrent transactions than the configured bound.
- [ ] Integration tests run against real Postgres via `bun run db:dev`.
- [ ] `bun run check` clean.

## Files

- `src/lib/server/core/ctx.ts`
- `src/lib/server/core/fanout.ts`
- `src/lib/server/core/entitlement.ts`
- `src/hooks.server.ts`
- `src/app.d.ts`
- `eslint.config.js`
- `src/lib/server/core/*.test.ts`
