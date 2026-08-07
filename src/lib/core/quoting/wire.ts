/**
 * WHAT THE EDITOR SENDS BACK.
 *
 * The autosave payload, as a type both sides can hold. The browser builds one of these; the
 * server validates it with zod (`modules/quoting/wire.ts`) and never trusts it before that.
 * Declaring the shape here rather than only in the validator means a change to the editor's
 * form and a change to what the server accepts do not compile independently of each other.
 *
 * WHY THE WHOLE DOCUMENT, EVERY TIME
 * ----------------------------------
 * Not "set field X to Y". A granular patch stream has to arrive in order to be correct, and
 * an autosaving editor on a train does not guarantee that — two in-flight saves that land
 * backwards would resurrect a line the person deleted. A full document is idempotent: the
 * last one to arrive is the truth, which is also the only rule a person can predict.
 *
 * The payload is small (a quote is a handful of lines) and the alternative is an ordering
 * protocol nobody can debug at 2am.
 *
 * MONEY CROSSES AS INTEGERS. `qtyE6` and `unitPriceMicros` are exact integers produced by
 * `parseQuantityInput` / `parseUnitPriceInput` in the browser — the sanctioned door for
 * human-typed money. The server re-validates the range and rebuilds the values through
 * `db/map.ts`, because a number that arrived over the network is an input like any other.
 */
import type { TaxTreatment } from '$lib/core/money';
import type { CalendarDate } from './types';

/** One line, as the editor holds it. `id` is minted in the browser for a new line. */
export type LinePatch = {
	readonly id: string;
	readonly position: number;
	readonly description: string;
	readonly provenance: string | null;
	readonly documentDescription: string | null;
	/** Millionths of a unit. */
	readonly qtyE6: number;
	/** Millionths of a rand. */
	readonly unitPriceMicros: number;
	readonly taxTreatment: TaxTreatment;
	/** The inventory item this line was picked from, if any. */
	readonly sourceItemId: string | null;
};

/** What this document says about the client — the quote's own copy, editable in place. */
export type CustomerPatch = {
	readonly name: string | null;
	readonly contactPerson: string | null;
	readonly email: string | null;
	readonly phone: string | null;
	readonly vatNumber: string | null;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly city: string | null;
	readonly postalCode: string | null;
};

export type DepositPatch =
	| { readonly kind: 'none' }
	| { readonly kind: 'rate'; readonly ppm: number }
	| { readonly kind: 'amount'; readonly cents: number };

export type DraftPatch = {
	readonly customerId: string | null;
	readonly customer: CustomerPatch;
	readonly sendToName: string | null;
	readonly sendToEmail: string | null;
	readonly validUntil: CalendarDate | null;
	readonly deposit: DepositPatch;
	readonly lines: readonly LinePatch[];
};

/**
 * What a save returns.
 *
 * `savedAt` is the database's `updated_at`, not the moment the browser sent the request. The
 * editor's promise — "All changes saved · 21:47. You can close this and come back." — is only
 * true if the time shown is a time something was actually written.
 */
export type SaveResult = {
	/** ISO 8601. */
	readonly savedAt: string;
};

/**
 * The customer fields a person may push back to the address book.
 *
 * A closed list rather than "whatever the client sends": promotion writes to a table every
 * other document reads from, so the set of columns it can touch is decided here and not by
 * the request.
 */
export const PROMOTABLE_FIELDS = [
	'name',
	'contactPerson',
	'email',
	'phone',
	'vatNumber',
	'addressLine1',
	'addressLine2',
	'city',
	'postalCode'
] as const;

export type PromotableField = (typeof PROMOTABLE_FIELDS)[number];
