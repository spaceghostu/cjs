/**
 * THE PDF OF A DOCUMENT.
 *
 * One URL for every document this product produces — quotes today, invoices at T19, credit
 * notes after that. A per-module route would mean the editor's "Preview PDF", the email
 * attachment and T18's escape hatch each linking to a different shape of URL, and three places
 * to get the caching and the filename right.
 *
 * WHY THIS ROUTE IS CORE AND STILL ASKS THE MODULES
 * ------------------------------------------------
 * It holds an id and no idea what kind of document it is. So it asks each module the business
 * OWNS, through that module's `public.ts` — the only import path ESLint zone 3 allows — and
 * takes the first answer. A module the business does not own is never asked, which is what
 * makes this route degrade gracefully rather than 500 on a tenant with three modules missing.
 *
 * `read`, not `write`: a REMOVED module's documents stay readable and exportable. That is the
 * whole point of the middle access state, and the PDF is the most literal form of "exportable"
 * there is.
 */
import { error } from '@sveltejs/kit';
import { notFound } from '$lib/core/refusals';
import { withBusiness } from '$lib/server/core/ctx';
import { pdfFilename, renderDocumentPdf } from '$lib/server/core/pdf';
import { printableQuote } from '$lib/server/modules/quoting/public';
import { printableInvoice } from '$lib/server/modules/invoicing/public';
import type { PrintableDocument } from '$lib/core/document';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const document = await withBusiness(event, async (ctx) => {
		const resolvers: {
			module: keyof typeof ctx.access;
			resolve: () => Promise<PrintableDocument | null>;
		}[] = [
			{
				module: 'quoting',
				resolve: () => printableQuote(ctx.tx, event.params.id, ctx.business.id)
			},
			{
				module: 'invoicing',
				resolve: () => printableInvoice(ctx.tx, event.params.id, ctx.business.id)
			}
		];

		for (const { module, resolve } of resolvers) {
			// `none` means this business has never had the module, so it can have no documents
			// from it. Asking anyway would be a query per unowned module on every PDF.
			if (ctx.access[module] === 'none') continue;
			const found = await resolve();
			if (found) return found;
		}

		return null;
	});

	// The same sentence every other tenant-scoped id route says, from the same helper. This
	// route's isolation is PURE RLS — `printableQuote`/`printableInvoice` load by id alone and
	// the policy is the filter — so a rival business's real document id and a random UUID have
	// to be indistinguishable here, and on the route whose success path returns rendered
	// document bytes that matters more than anywhere else. `not-found.test.ts` proves it.
	if (!document) {
		error(404, notFound('document'));
	}

	const bytes = await renderDocumentPdf(document);

	return new Response(bytes as BodyInit, {
		headers: {
			'content-type': 'application/pdf',
			// `inline`, so "Preview PDF" opens in the browser's viewer beside the editor rather
			// than landing in Downloads. The filename still applies when somebody saves it.
			'content-disposition': `inline; filename="${pdfFilename(document)}"`,
			// A document is regenerated from live data and a draft changes as it is typed, so
			// there is nothing here worth a cache — and a stale quote is exactly the thing that
			// must never reach a client.
			'cache-control': 'no-store'
		}
	});
};
