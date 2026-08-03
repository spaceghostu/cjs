/**
 * The schema barrel.
 *
 * ONE file drizzle-kit reads, and one file you can `cat` to answer "what tables exist".
 * Deliberately a barrel rather than a glob: drizzle-kit never surprises you by picking up
 * a stray file, and `bun run new:module` appends exactly one line here.
 *
 * Ordering below mirrors the architecture:
 *   identity  — the one non-tenant domain (better-auth). See ./schema/identity.ts.
 *   core      — platform-owned tables every module shares (M2)
 *   billing   — subscriptions and entitlement (M2)
 *   ledger    — core_posting / core_allocation (M2, unused until Invoicing)
 *   audit     — append-only row change log (M2)
 *   modules   — one line per module, appended by the scaffold
 */
export * from './schema/identity';
export * from './schema/core';
export * from './schema/audit';
