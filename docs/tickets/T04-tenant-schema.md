# T04 — Business, membership and RLS

**Depends on:** — (parallel with T01–T03)
**Blocks:** T05, T10, T15, T19, T23.

## Context

The database currently has exactly one domain: `identity`, the better-auth tables, which
are deliberately outside every platform invariant. Everything else — the _floor_ the schema
barrel calls M2 — is designed in comments but not built.

Several things reference machinery that does not exist yet. This ticket builds the parts
that are pure schema; T05 builds the request-time parts.

| Referenced in                                            | Missing                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `drizzle/0001_identity_grants.sql`, `schema/identity.ts` | `scripts/invariants.sql`                                                  |
| `schema.ts` barrel                                       | `core`, `billing`, `ledger`, `audit` schemas                              |
| `money/index.ts`                                         | `db/map.ts` (rows → domain, the only sanctioned `Money` constructor site) |

`auth.ts` is explicit about the membership model: better-auth's `organization` plugin is
**not** installed, because it would create a second membership table and a second role
system alongside `core_member`, and any drift between them lands on the billing gate.
`core_member` is the single source of truth for the owner/staff role.

## Scope

### `core` schema

- **`core_business`** — the tenant. Name, trading details, VAT number, address, and the
  per-tenant brand token from T01 (one of `#5B6CFF`, `#2E8FA8`, `#8A63C4`, `#2E8F63`).
  The design's document header needs: name, street address, VAT number, phone.
- **`core_member`** — `(business_id, user_id)` with a role of `owner` or `staff`. The
  design gates module add/remove on "Owners and billing admins only", so the role has to
  answer that question.
- **`core_customer`** — clients. Name, contact person, email, billing address. Referenced
  by both Quoting and Invoicing; belongs to the floor, not to either module.
- **`core_document_number`** — the `QT-1043` / `INV-1042` sequence, per business, per
  document type. Allocation must be atomic; `client.ts` already notes that `SET LOCAL` and
  transactions were the reason node-postgres was chosen over neon-http.

### `audit` schema

Append-only row change log. Exempt from the `business_id` invariant by name, as documented.

### `scripts/invariants.sql`

The file every existing comment promises. It must assert:

1. Every table in every schema **except** `identity`, `app`, `audit` and `drizzle` carries
   `business_id uuid not null`.
2. Every such table has RLS **enabled and forced**.
3. The application role holds no `DELETE` outside `identity` — "business records are never
   destroyed" is structural, not a policy.
4. The application role is not superuser, not `BYPASSRLS`, and owns nothing.

Run it in CI and as a post-migration check, not just by hand.

### RLS policies

Tenant isolation policy on every `core` table, keyed off the session variable T05 sets.
Write the policy so a missing session variable yields **zero rows**, never all rows.

### `db/map.ts`

Row → domain mapping, and the only place outside `parseMoneyInput` allowed to construct
`Money`. The ESLint restriction already assumes this path exists.

## Out of scope

Module catalogue and subscriptions (T10). Quote, invoice, inventory tables — each lands
with its module. Request-time context and the `Ctx`/`Tx` types (T05).

## Acceptance criteria

- [ ] Migrations generate and apply cleanly against `bun run db:dev`.
- [ ] `scripts/invariants.sql` exists, passes, and **fails loudly** when a test table
      without `business_id` is added.
- [ ] Two businesses in one database cannot read each other's rows — proven by an
      integration test, not by inspection.
- [ ] With no session variable set, every tenant table returns zero rows.
- [ ] `DELETE` on any non-`identity` table is refused for the application role.
- [ ] `db/map.ts` is the only non-test importer of `money/ctor`.
- [ ] `bun run check` clean.

## Files

- `src/lib/server/core/db/schema/core.ts`
- `src/lib/server/core/db/schema/audit.ts`
- `src/lib/server/core/db/schema.ts` (barrel)
- `src/lib/server/core/db/map.ts`
- `scripts/invariants.sql`
- `drizzle/**`
- `src/lib/server/core/db/*.test.ts`
