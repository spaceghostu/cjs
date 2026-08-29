/**
 * ONE QUOTE, IN THE TWO STATES IT CAN BE IN.
 *
 *   DRAFT — the editor. Two panes, autosave, a live client-facing preview.
 *   SENT and after — read-only. The client holds a PDF, and editing the document they are
 *   looking at, silently, from the other side, is the single worst thing this module could do.
 *
 * One route rather than two, because it is one document and one URL. A bookmark taken while a
 * quote was a draft has to keep working the day after it is sent.
 *
 * WRITE, NOT READ.
 *
 * `withModule(event, 'quoting', 'write', …)` — so a business that has REMOVED Quoting gets the
 * refusal `entitlement.ts` writes rather than a screen that will fail on its first action.
 * Their quotes stay readable on the list; this is the screen that changes one.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { effectiveStatus, issuerFrom, priceQuote, quoteDocument, todayIn } from '$lib/core/quoting';
import { notFound, notFoundMessage } from '$lib/core/refusals';
import { withModule } from '$lib/server/core/ctx';
import { business as businessTable } from '$lib/server/core/db/schema/core';
import { modulePrice, totalWith } from '$lib/server/core/modules/catalogue';
import { loadEvents } from '$lib/server/modules/quoting/events';
import {
	loadCustomers,
	loadQuote,
	loadQuoteRow,
	loadSettings,
	provisionalNumber
} from '$lib/server/modules/quoting/queries';
import { CannotSendQuote, sendQuote } from '$lib/server/modules/quoting/send';
import { createFromQuote, invoiceForQuote } from '$lib/server/modules/invoicing/public';
import { loadQuoteLineRows } from '$lib/server/modules/quoting/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	return withModule(event, 'quoting', 'write', async (ctx) => {
		const quote = await loadQuote(ctx.tx, event.params.id);

		// RLS has already made "another business's quote" and "no such quote" the same answer,
		// which is exactly what they should be to somebody guessing at URLs.
		if (!quote) error(404, notFound('quote'));

		const [businessRow] = await ctx.tx
			.select()
			.from(businessTable)
			.where(eq(businessTable.businessId, ctx.business.id));

		const issuer = issuerFrom(businessRow);
		const settings = await loadSettings(ctx.tx);
		const status = effectiveStatus(quote.status, quote.validUntil, todayIn(new Date()));

		if (status !== 'draft') {
			// The sent view. It renders the document the client actually has, which is why it is
			// built from the SAME projection the PDF and the preview use.
			const price = priceQuote(quote);
			// The one column the domain type does not carry: a client is not a user, so who
			// accepted a quote is a name they typed rather than an id anything can resolve.
			const row = await loadQuoteRow(ctx.tx, quote.id);

			// Has this quote already been billed? Asked only when Invoicing is owned — an
			// unowned module has no invoices, and the offer on this screen is T13's add instead.
			const existingInvoice =
				ctx.access.invoicing === 'write' ? await invoiceForQuote(ctx.tx, quote.id) : null;

			return {
				mode: 'sent' as const,
				status,
				existingInvoice,
				document: quoteDocument({
					quote,
					price,
					issuer,
					footer: settings.footerTerms ?? undefined
				}),
				clientName: quote.customer.name ?? 'your client',
				acceptedByName: row?.acceptedByName ?? null,
				events: await loadEvents(ctx.tx, quote.id),
				/** The offer, and the escape hatch, from T13. */
				invoicingOwned: ctx.access.invoicing === 'write',
				// Never null in practice — every catalogue row is priced — and typed as though it
				// could be, because the offer must not render a hole where a price belongs.
				invoicingPrice: modulePrice('invoicing'),
				newTotal: totalWith(ctx.access, 'invoicing', 'write')
			};
		}

		const customers = await loadCustomers(ctx.tx);

		/**
		 * The address book's version of the chosen client.
		 *
		 * Sent to the browser so the editor can tell whether anything actually differs before it
		 * offers to save a change back. Comparing on the client is right here: the question is
		 * "did what you typed diverge from the record", and the answer has to be available the
		 * moment they leave the field rather than a round trip later.
		 */
		const record = quote.customer.customerId
			? (customers.find((c) => c.id === quote.customer.customerId) ?? null)
			: null;

		return {
			mode: 'draft' as const,
			quote,
			issuer,
			customers: customers.map((c) => ({ id: c.id, name: c.name })),
			customerRecord: record
				? {
						name: record.name,
						contactPerson: record.contactPerson,
						email: record.email,
						phone: record.phone,
						vatNumber: record.vatNumber,
						addressLine1: record.address.line1,
						addressLine2: record.address.line2,
						city: record.address.city,
						postalCode: record.address.postalCode
					}
				: null,
			usualDays: settings.validityDays,
			footer: settings.footerTerms,
			// Provisional, and labelled as such: `peekDocumentNumber` reads the counter without
			// taking it, so two people drafting at once are shown the same one and exactly one of
			// them gets it. Reserving on open would burn a number per abandoned draft.
			provisionalNumber: quote.number ? null : await provisionalNumber(ctx.tx),
			/** Drives the add-line row: the picker when Inventory is owned, T13's offer when not. */
			inventoryAccess: ctx.access.inventory
		};
	});
};

export const actions: Actions = {
	/**
	 * SEND IT.
	 *
	 * The whole of the work is in `sendQuote`, in one transaction, with the email sent INSIDE
	 * it — so a mail failure rolls back the number, the snapshot, the token and the status.
	 *
	 *   > A quote that could not be sent must not show as sent.
	 *
	 * `event.url.origin` rather than a configured base URL, so the link in a development email
	 * points at the development server and the one in production points at production, with no
	 * second setting that can disagree with the request that arrived.
	 */
	/**
	 * "TURN IT INTO AN INVOICE."
	 *
	 * The design's own next step after acceptance, and the only thing that makes the invoice
	 * timeline's "Created from quote QT-1036" reachable in the product.
	 *
	 * Crosses the module boundary through `invoicing/public.ts`, which ESLint zone 3 makes the
	 * only legal path — and this route may do it because a ROUTE is allowed to compose two
	 * modules a business owns, where a module reaching into another is what breaks graceful
	 * degradation.
	 *
	 * Refused when one already exists. A second invoice for the same accepted quote is a client
	 * billed twice, which is the mistake worth spending a query to prevent.
	 */
	makeInvoice: async (event) => {
		let id: string;

		try {
			id = await withModule(event, 'invoicing', 'write', async (ctx) => {
				const quote = await loadQuote(ctx.tx, event.params.id);
				// `CannotSendQuote` rather than `error(404)`: a thrown redirect/error inside this
				// try would be swallowed by the catch below and re-reported as a 500.
				if (!quote) throw new CannotSendQuote(notFoundMessage('quote'));

				if (quote.status !== 'accepted') {
					throw new CannotSendQuote(
						'That quote has not been accepted yet, so there is nothing to invoice.'
					);
				}

				const already = await invoiceForQuote(ctx.tx, quote.id);
				if (already) return already.id;

				const row = await loadQuoteRow(ctx.tx, quote.id);
				const lines = await loadQuoteLineRows(ctx.tx, quote.id);

				return createFromQuote(ctx.tx, ctx.business, {
					quoteId: quote.id,
					quoteNumber: quote.number,
					// The row is already loaded two lines above and carries the column, so the
					// job travels onto the invoice for the cost of reading a field. Null is the
					// ordinary case for a quote accepted before SPA-20 existed.
					jobId: row?.jobId ?? null,
					customerId: quote.customer.customerId,
					customer: {
						name: quote.customer.name,
						contactPerson: quote.customer.contactPerson,
						email: quote.customer.email,
						phone: quote.customer.phone,
						vatNumber: quote.customer.vatNumber,
						addressLine1: quote.customer.addressLine1,
						addressLine2: quote.customer.addressLine2,
						city: quote.customer.city,
						postalCode: quote.customer.postalCode,
						country: quote.customer.country
					},
					sendToName: quote.sendTo.name,
					sendToEmail: quote.sendTo.email,
					// The pricing contract comes across as it was. An invoice raised from a quote
					// charges what the quote promised, at the rate it promised it.
					pricingMode: row?.pricingMode ?? 'exclusive',
					taxEngine: row?.taxEngine ?? 'za_vat',
					vatRatePpm: row?.vatRatePpm ?? 150_000,
					vatPolicy: row?.vatPolicy ?? '',
					currency: row?.currency ?? ctx.business.currency,
					lines: lines.map((line, i) => ({
						position: line.position ?? i,
						description: line.description,
						provenance: line.provenance,
						documentDescription: line.documentDescription,
						qtyE6: line.qtyE6,
						unitPriceMicros: line.unitPriceMicros,
						taxTreatment: line.taxTreatment,
						vatRatePpm: line.vatRatePpm,
						sourceItemId: line.sourceItemId
					}))
				});
			});
		} catch (cause) {
			if (cause instanceof CannotSendQuote) return fail(422, { message: cause.message });
			return fail(500, {
				message: 'We could not raise an invoice from that quote. Nothing was created.'
			});
		}

		redirect(303, `/invoicing/${id}`);
	},

	send: async (event) => {
		try {
			await withModule(event, 'quoting', 'write', (ctx) =>
				sendQuote(ctx.tx, ctx.business.id, ctx.userId, event.params.id, event.url.origin)
			);
		} catch (cause) {
			if (cause instanceof CannotSendQuote) return fail(422, { message: cause.message });

			// Anything else is a mail transport or a database problem, and the quote is still a
			// draft because the transaction rolled back. Say so plainly: the person is about to
			// try again, and needs to know nothing went halfway.
			return fail(502, {
				message:
					'We could not send that quote just now, so nothing was sent and it is still a ' +
					'draft. Try again in a moment.'
			});
		}

		// A redirect to itself, which now renders the sent view. Not a `return`, because the
		// screen the person should be looking at is a different screen.
		redirect(303, `/quoting/${event.params.id}`);
	}
};
