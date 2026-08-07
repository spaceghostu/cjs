/**
 * WRITING QUOTES.
 *
 * "All changes saved · 21:47. You can close this and come back."
 *
 * That sentence is on the editor, and everything in this file exists to make it true. Three
 * consequences, each of which shaped a function below:
 *
 *  1. A SAVE IS A WHOLE DOCUMENT. Not a stream of field patches. Two autosaves that land out
 *     of order must not resurrect a line somebody deleted — see `$lib/core/quoting/wire.ts`.
 *
 *  2. A SAVE IS ONE TRANSACTION. The header, every line and every archival commit together or
 *     not at all. A quote whose header says three lines and whose table holds two is a
 *     document nobody can price.
 *
 *  3. THE TIME SHOWN IS THE TIME WRITTEN. `saveDraft` returns the `updated_at` the database
 *     produced, from the `touch_updated_at` trigger. An optimistic `new Date()` in the browser
 *     would show "saved" for a save that failed, which is the one thing the sentence promises
 *     cannot happen.
 *
 * NOTHING IS DELETED. Removing a line sets `archived_at`; discarding a draft does the same to
 * the header. The application role holds no DELETE, so this is not a convention that could be
 * forgotten — it is the only thing that compiles.
 */
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { VAT_POLICY } from '$lib/core/money';
import { STANDARD_VAT_RATE_PPM, addDays, todayIn } from '$lib/core/quoting';
import type { DraftPatch, PromotableField } from '$lib/core/quoting/wire';
import { customer as customerTable } from '$lib/server/core/db/schema/core';
import { quote, quoteLine } from '$lib/server/core/db/schema/quoting';
import type { Tx } from '$lib/server/core/db/tx';
import type { Business } from '$lib/server/core/db/map';
import { loadSettings } from './queries';

/**
 * A quote that has been sent is frozen.
 *
 * The client has a PDF. Editing the document they are looking at — silently, from the other
 * side — is the single worst thing this module could do, so it is refused here rather than
 * guarded in each route. `sent`, `viewed`, `accepted`, `declined` and `expired` all mean
 * somebody outside the business has, or had, a copy.
 */
export class QuoteNotEditable extends Error {
	constructor(readonly status: string) {
		super(
			`This quote has already been sent, so it can't be changed. ` +
				`Make a copy if you need a different version.`
		);
		this.name = 'QuoteNotEditable';
	}
}

/**
 * A new draft.
 *
 * The pricing contract is decided HERE, once, and snapshotted onto the row — never read from
 * configuration when the quote is rendered. A rate change, a policy bump or a business that
 * deregisters for VAT must not alter a document that already exists.
 *
 * The tax engine follows the business's VAT registration. `core_business.vat_number` is
 * nullable on purpose (registration is compulsory only above the R1m turnover threshold), and
 * `priceDocument` under engine `none` collapses the whole document into a single no-VAT group
 * so a non-vendor cannot accidentally print a rate. VAT Act s58(1)(a) makes representing tax
 * where none is payable a criminal offence, which is too serious a thing to leave to a
 * template remembering to branch.
 */
export async function createDraft(
	tx: Tx,
	business: Business,
	options: { now?: Date; customerId?: string | null } = {}
): Promise<string> {
	const { now = new Date(), customerId = null } = options;
	const settings = await loadSettings(tx);
	const today = todayIn(now);

	const [row] = await tx
		.insert(quote)
		.values({
			businessId: business.id,
			customerId,
			status: 'draft',
			validUntil: addDays(today, settings.validityDays),
			depositRatePpm: settings.depositRate?.ppm ?? null,
			pricingMode: 'exclusive',
			taxEngine: business.vatNumber ? 'za_vat' : 'none',
			vatRatePpm: STANDARD_VAT_RATE_PPM,
			vatPolicy: VAT_POLICY,
			currency: business.currency
		})
		.returning({ id: quote.id });

	if (customerId) await copyCustomerOntoQuote(tx, row.id, customerId);
	return row.id;
}

/**
 * Copy the address book entry onto the quote — snapshot 1, taken once.
 *
 * Runs when the client is chosen and never again. From that moment the quote owns what it
 * says about the customer, which is what makes the editor's promise honest: "Change it here
 * and we'll ask if you want it saved."
 */
async function copyCustomerOntoQuote(tx: Tx, quoteId: string, customerId: string): Promise<void> {
	const [c] = await tx.select().from(customerTable).where(eq(customerTable.id, customerId));
	if (!c) return;

	await tx
		.update(quote)
		.set({
			customerId: c.id,
			customerName: c.name,
			customerContactPerson: c.contactPerson,
			customerEmail: c.email,
			customerPhone: c.phone,
			customerVatNumber: c.vatNumber,
			customerAddressLine1: c.addressLine1,
			customerAddressLine2: c.addressLine2,
			customerCity: c.city,
			customerPostalCode: c.postalCode,
			customerCountry: c.country,
			// The address book's contact is the default send-to. Overridable on the quote,
			// which is the whole point of the field being separate.
			sendToName: c.contactPerson,
			sendToEmail: c.email
		})
		.where(eq(quote.id, quoteId));
}

/**
 * THE AUTOSAVE.
 *
 * One transaction: the header, every line that is still there, and an archival sweep for every
 * line that is not. The caller supplies the transaction, so this composes with sending — which
 * saves and then freezes in the same commit.
 *
 * Line reconciliation is by id, and the id is minted in the BROWSER. That is what makes the
 * save idempotent: replaying the same payload writes the same rows, so a retry after a flaky
 * connection cannot double a line. It is safe because the id is only ever used within a quote
 * this transaction has already proved the caller may write — a guessed id belongs to another
 * tenant, and RLS returns zero rows for it.
 */
export async function saveDraft(
	tx: Tx,
	businessId: string,
	quoteId: string,
	patch: DraftPatch
): Promise<Date> {
	const [header] = await tx.select().from(quote).where(eq(quote.id, quoteId)).limit(1);
	if (!header) throw new Error(`No such quote: ${quoteId}`);
	if (header.status !== 'draft') throw new QuoteNotEditable(header.status);

	// Choosing a client for the first time takes the snapshot. Choosing a DIFFERENT one
	// retakes it — the document is now for somebody else, and carrying the previous client's
	// address across would be worse than any edit it might overwrite.
	if (patch.customerId && patch.customerId !== header.customerId) {
		await copyCustomerOntoQuote(tx, quoteId, patch.customerId);
	}

	await tx
		.update(quote)
		.set({
			customerId: patch.customerId,
			customerName: patch.customer.name,
			customerContactPerson: patch.customer.contactPerson,
			customerEmail: patch.customer.email,
			customerPhone: patch.customer.phone,
			customerVatNumber: patch.customer.vatNumber,
			customerAddressLine1: patch.customer.addressLine1,
			customerAddressLine2: patch.customer.addressLine2,
			customerCity: patch.customer.city,
			customerPostalCode: patch.customer.postalCode,
			sendToName: patch.sendToName,
			sendToEmail: patch.sendToEmail,
			validUntil: patch.validUntil,
			depositRatePpm: patch.deposit.kind === 'rate' ? patch.deposit.ppm : null,
			depositAmountCents: patch.deposit.kind === 'amount' ? patch.deposit.cents : null
		})
		.where(eq(quote.id, quoteId));

	await reconcileLines(tx, businessId, header.currency, header.vatRatePpm, quoteId, patch);

	// Read the timestamp back rather than assuming it. The trigger set it, and the trigger is
	// the only thing that knows when.
	const [saved] = await tx
		.select({ updatedAt: quote.updatedAt })
		.from(quote)
		.where(eq(quote.id, quoteId));

	return saved.updatedAt;
}

/**
 * Lines in, missing lines archived.
 *
 * `onConflictDoUpdate` on the primary key makes insert-or-update one statement per line, which
 * matters because the alternative — select, branch, write — is a round trip per line per
 * keystroke-batch on a screen that autosaves.
 *
 * The archival sweep is a single `UPDATE … WHERE id NOT IN (…)`, and the empty case is spelled
 * separately: `NOT IN ()` is not valid SQL, and a quote with every line removed is exactly
 * when the sweep matters most.
 */
async function reconcileLines(
	tx: Tx,
	businessId: string,
	currency: string,
	vatRatePpm: number,
	quoteId: string,
	patch: DraftPatch
): Promise<void> {
	for (const line of patch.lines) {
		await tx
			.insert(quoteLine)
			.values({
				id: line.id,
				businessId,
				quoteId,
				position: line.position,
				description: line.description,
				provenance: line.provenance,
				documentDescription: line.documentDescription,
				qtyE6: line.qtyE6,
				unitPriceMicros: line.unitPriceMicros,
				currency,
				taxTreatment: line.taxTreatment,
				// The RATE IS NOT THE CLIENT'S TO SEND. It is the one this quote was created
				// under, snapshotted on the header, and a browser that offered a different one
				// would be changing the tax on a document.
				vatRatePpm,
				sourceItemId: line.sourceItemId,
				sourceCapturedAt: line.sourceItemId ? new Date() : null
			})
			.onConflictDoUpdate({
				target: quoteLine.id,
				set: {
					position: line.position,
					description: line.description,
					provenance: line.provenance,
					documentDescription: line.documentDescription,
					qtyE6: line.qtyE6,
					unitPriceMicros: line.unitPriceMicros,
					taxTreatment: line.taxTreatment,
					// An archived line whose id comes back is a line somebody un-deleted, which
					// an undo does. Clearing it here is what makes that work.
					archivedAt: null
				}
			});
	}

	const keep = patch.lines.map((l) => l.id);
	const stillHere = and(eq(quoteLine.quoteId, quoteId), isNull(quoteLine.archivedAt));

	await tx
		.update(quoteLine)
		.set({ archivedAt: sql`now()` })
		.where(keep.length === 0 ? stillHere : and(stillHere, notInArray(quoteLine.id, keep)));
}

/**
 * "Change it here and we'll ask if you want it saved" — the yes.
 *
 * The ONLY path from a quote back to `core_customer`. It runs on an explicit act, it writes a
 * closed list of columns (`PROMOTABLE_FIELDS`), and it copies from the quote rather than from
 * the request — so a promotion cannot smuggle a value the person never saw on the document
 * they were looking at.
 */
export async function promoteCustomerFields(
	tx: Tx,
	quoteId: string,
	fields: readonly PromotableField[]
): Promise<boolean> {
	const [header] = await tx.select().from(quote).where(eq(quote.id, quoteId)).limit(1);
	if (!header?.customerId) return false;

	const source: Record<PromotableField, string | null> = {
		name: header.customerName,
		contactPerson: header.customerContactPerson,
		email: header.customerEmail,
		phone: header.customerPhone,
		vatNumber: header.customerVatNumber,
		addressLine1: header.customerAddressLine1,
		addressLine2: header.customerAddressLine2,
		city: header.customerCity,
		postalCode: header.customerPostalCode
	};

	// `core_customer.name` is NOT NULL and non-blank. A quote whose client name has been
	// cleared is a legitimate draft state; promoting that emptiness would break every other
	// document that reads the same customer, so it is skipped rather than refused — the person
	// asked to save the fields they filled in.
	const updates = Object.fromEntries(
		fields.filter((f) => !(f === 'name' && !source.name)).map((f) => [f, source[f]])
	);
	if (Object.keys(updates).length === 0) return false;

	await tx.update(customerTable).set(updates).where(eq(customerTable.id, header.customerId));
	return true;
}

/** Discard a draft. An archive, because there is no delete anywhere in this database. */
export async function archiveQuote(tx: Tx, quoteId: string): Promise<void> {
	await tx
		.update(quote)
		.set({ archivedAt: sql`now()` })
		.where(and(eq(quote.id, quoteId), eq(quote.status, 'draft')));
}

/**
 * Bring stored statuses in line with the calendar.
 *
 * `effectiveStatus` already derives expiry on read, so nothing depends on this having run —
 * which is the point. This is bookkeeping that makes the stored value agree with what every
 * screen is already showing, so a query that filters on `status = 'expired'` is not lying.
 */
export async function sweepExpired(tx: Tx, now: Date = new Date()): Promise<number> {
	const today = todayIn(now);

	const updated = await tx
		.update(quote)
		.set({ status: 'expired' })
		.where(
			and(
				inArray(quote.status, ['sent', 'viewed']),
				isNull(quote.archivedAt),
				sql`${quote.validUntil} is not null and ${quote.validUntil} < ${today}`
			)
		)
		.returning({ id: quote.id });

	return updated.length;
}
