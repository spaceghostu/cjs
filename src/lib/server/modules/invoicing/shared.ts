/**
 * THE CLIENT'S SIDE.
 *
 * Reading an emailed invoice. The second of the two surfaces in this product that runs for a
 * person with no account — `quoting/accept.ts` is the first — and the security is the work here
 * rather than a wrapper around it.
 *
 * WHY AN INVOICE NEEDS ONE AT ALL
 * ------------------------------
 * T21's timeline says "Opened by Baraka Café · Twice · last 26 Jul, 08:41", and T20's status
 * column says "Viewed by client". Neither sentence can be written without somewhere for the
 * client to open the invoice: a PDF attachment cannot report that it was read. So the invoice is
 * emailed as a link as well as a file, and following it is what "opened" means.
 *
 * HOW A REQUEST WITH NO IDENTITY IS BOUNDED
 * -----------------------------------------
 * `readShared` sets `cjs.share_token` and nothing else — no business id, no user. The five
 * `document_share` / `invoice_share` policies in `0007_invoicing.sql` then admit exactly the one
 * invoice whose token hash matches, its lines, its customer, its business and that business's
 * invoicing settings (for the banking details, without which the page is useless). Everything
 * else in the database evaluates `business_id = NULL` and returns nothing — including
 * `invoicing_payment` and `core_posting`, so what the business was paid by other clients and
 * what the job cost them are unreachable from here.
 *
 * So "this page exposes exactly one document and no other tenant data" is a property of the
 * schema, not of the care taken in this file.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { issuerFrom } from '$lib/core/quoting';
import {
	effectiveInvoiceStatus,
	invoiceDocument,
	priceInvoice,
	settle,
	type InvoiceStatus
} from '$lib/core/invoicing';
import { todayIn } from '$lib/core/calendar';
import type { Money } from '$lib/core/money';
import type { PrintableDocument } from '$lib/core/document';
import { actAsSharedTenant, readShared } from '$lib/server/core/share';
import { business as businessTable } from '$lib/server/core/db/schema/core';
import { invoice, invoiceLine, invoicingSetting } from '$lib/server/core/db/schema/invoicing';
import { toInvoice, toMoney } from '$lib/server/core/db/map';
import type { StoredInvoiceStatus } from '$lib/core/invoicing';
import { recordEvent } from './events';
import { loadPayments } from './queries';
import { hashShareToken } from './send';

/** What the public page needs, and nothing else that belongs to the tenant. */
export type SharedInvoice = {
	readonly invoiceId: string;
	readonly businessId: string;
	readonly document: PrintableDocument;
	/** Derived, so a client is never shown "due in 3 days" on an invoice that lapsed a week ago. */
	readonly status: InvoiceStatus;
	/**
	 * What is still owed.
	 *
	 * Computed from the SNAPSHOT and from allocations the policies do not expose — so it is
	 * computed on the business's side of the boundary and only the ANSWER crosses. A client
	 * seeing "R0,00 outstanding" learns that their payment landed; they do not get to see the
	 * payments table to find out.
	 */
	readonly outstanding: Money | null;
	readonly tradingName: string;
};

/**
 * Open a shared invoice.
 *
 * Records an `opened` event and moves `sent` -> `viewed` on first open. That transition is what
 * the design's "They opened it twice" copy is counting, and it is deliberately a side effect of
 * READING: a client does not press anything to open an email link, so there is no other moment
 * to observe.
 *
 * The view is recorded as the tenant, in its own short transaction, AFTER the document has been
 * read through the token. A failure to record a view must never stop a client seeing what they
 * owe.
 */
export async function openSharedInvoice(
	token: string,
	now: Date = new Date()
): Promise<SharedInvoice | null> {
	const hash = hashShareToken(token);

	const found = await readShared(hash, async (tx) => {
		const [header] = await tx
			.select()
			.from(invoice)
			.where(eq(invoice.shareTokenHash, hash))
			.limit(1);
		if (!header || header.archivedAt !== null) return null;

		const lines = await tx
			.select()
			.from(invoiceLine)
			.where(and(eq(invoiceLine.invoiceId, header.id), isNull(invoiceLine.archivedAt)))
			.orderBy(invoiceLine.position);

		// One row each, and only because the policies above admit exactly one.
		const [businessRow] = await tx.select().from(businessTable);
		const [settings] = await tx.select().from(invoicingSetting);

		const model = toInvoice(header, lines);
		const price = priceInvoice(model);

		return {
			header,
			businessRow,
			document: invoiceDocument({
				invoice: model,
				price,
				issuer: issuerFrom(businessRow),
				bankingDetails: settings?.bankingDetails ? settings.bankingDetails.split('\n') : null,
				footer: settings?.footerTerms ? settings.footerTerms.split('\n') : null
			})
		};
	});

	if (!found) return null;

	const status = effectiveInvoiceStatus(
		found.header.status as StoredInvoiceStatus,
		found.header.dueDate,
		todayIn(now)
	);

	// Both of these act as the tenant, resolved from a row the TOKEN admitted — never from a
	// request. See `share.ts`.
	const outstanding = await outstandingFor(found.header.businessId, found.header);
	await recordOpen(found.header.businessId, found.header.id, found.header.status, now);

	return {
		invoiceId: found.header.id,
		businessId: found.header.businessId,
		document: found.document,
		status,
		outstanding,
		tradingName: found.businessRow.tradingName
	};
}

/**
 * What is left to pay, computed on the business's side.
 *
 * The payments table has no share policy — deliberately — so this runs as the tenant. The client
 * gets one number, which is the number their own invoice is about.
 */
async function outstandingFor(
	businessId: string,
	header: { id: string; currency: string; snapshotTotalCents: number | null; status: string }
): Promise<Money | null> {
	const { snapshotTotalCents } = header;
	if (snapshotTotalCents === null) return null;
	if (header.status === 'cancelled') return null;

	try {
		return await actAsSharedTenant(businessId, async (tx) => {
			const payments = await loadPayments(tx, header.id);
			return settle(toMoney(snapshotTotalCents, header.currency), payments).outstanding;
		});
	} catch {
		// The page's job is to show the client their invoice. If the settlement query fails, the
		// document still renders and the outstanding line is simply absent — which is better than
		// a 500, and much better than a stale or guessed figure on something somebody is about to
		// pay from.
		return null;
	}
}

/**
 * The open, recorded as the tenant.
 *
 * Swallows its own failures on purpose, and this is one of the two places in this codebase where
 * that is right: the caller has already produced the document the client asked for, and a page
 * that 500s because a counter could not be incremented would be the tracking breaking the thing
 * it is tracking.
 */
async function recordOpen(
	businessId: string,
	invoiceId: string,
	storedStatus: string,
	now: Date
): Promise<void> {
	try {
		await actAsSharedTenant(businessId, async (tx) => {
			await tx
				.update(invoice)
				.set({
					// `sent` -> `viewed`, once. A paid or cancelled invoice keeps its status: a client
					// re-reading an invoice they settled has not un-settled it.
					status: storedStatus === 'sent' ? 'viewed' : storedStatus,
					firstViewedAt: sql`coalesce(${invoice.firstViewedAt}, ${now})`,
					lastViewedAt: now,
					viewCount: sql`${invoice.viewCount} + 1`
				})
				.where(eq(invoice.id, invoiceId));

			await recordEvent(tx, businessId, invoiceId, {
				kind: 'opened',
				actor: 'client',
				occurredAt: now
			});
		});
	} catch {
		// Deliberately silent. See the note above.
	}
}
