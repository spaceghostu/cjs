/**
 * THE SECOND DOOR, AND THE ONLY OTHER ONE.
 *
 * `ctx.ts` opens the door for a signed-in person acting for a business. This one opens it for
 * somebody who is not a user at all: a client, holding a link, reading the quote they were
 * emailed. The catalogue promises "branded quotes clients can accept online", so that surface
 * has to exist — and it must not be a hole in the floor.
 *
 * It is a separate file rather than two more functions in `ctx.ts` for the reason zone 8 keeps
 * the system principal in one: the blast radius of an unauthenticated path should be visible
 * in the file list, not buried among the functions every route uses.
 *
 * WHAT MAKES IT SAFE IS THE DATABASE, NOT THIS FILE
 * -------------------------------------------------
 * `runWithShareToken` sets `cjs.share_token` and nothing else — no business id, no user. The
 * four `document_share` policies in `0006_quote_sharing.sql` admit exactly one quote, its
 * lines, its customer and its business. Every other table, and every other row of those four,
 * evaluates `business_id = NULL` and returns nothing. So the reach of the public page is a
 * property of the schema, which is the only version of that claim worth making.
 *
 * SELECT ONLY through `readShared`. Answering a quote is a WRITE and goes through
 * `actAsSharedTenant`, which resolves the tenant from the token and then runs one bounded
 * update under the ordinary `tenant_isolation` policy — with no user attached, because there
 * genuinely is not one.
 */
import { runScoped, runWithShareToken } from './db/client';
import type { Tx } from './db/tx';

export type { Tx } from './db/tx';

/**
 * Read what a share token opens.
 *
 * The hash, never the token: the database stores the hash, and nothing that reaches this
 * function is reversible into a link.
 */
export function readShared<T>(tokenHash: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
	return runWithShareToken(tokenHash, fn);
}

/**
 * Write, as the business, on behalf of a client who answered.
 *
 * The `businessId` must have come from a row the TOKEN admitted — never from a request. Passing
 * one from anywhere else would be exactly the shortcut this whole arrangement exists to avoid,
 * so the only callers are in `modules/quoting/accept.ts`, immediately after a token lookup.
 *
 * No user id. An audit row that says "no user" is more honest than one attributed to whoever
 * happens to own the business.
 */
export function actAsSharedTenant<T>(businessId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
	return runScoped(businessId, null, fn);
}
