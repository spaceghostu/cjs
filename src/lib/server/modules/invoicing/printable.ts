/**
 * AN INVOICE, READY FOR PAPER.
 *
 * The one function that turns storage into a `PrintableDocument`, and therefore the seam every
 * rendering of an invoice passes through — the editor's preview, the document panel on the
 * detail screen, the PDF the client is emailed, the PDF they download from their own copy.
 * `$lib/core/invoicing/document.ts` decides what an invoice looks like as paper; this supplies
 * it with what the database knows.
 *
 * Exported through `public.ts`, because the documents route is core and asks every module the
 * same question: "do you own document X, and if so, what does it look like?"
 */
import { eq } from 'drizzle-orm';
import { issuerFrom } from '$lib/core/quoting';
import { invoiceDocument, priceInvoice } from '$lib/core/invoicing';
import type { PrintableDocument } from '$lib/core/document';
import { business as businessTable } from '$lib/server/core/db/schema/core';
import type { Tx } from '$lib/server/core/db/tx';
import { loadInvoice, loadSettings, provisionalNumber } from './queries';

/**
 * The document, or null when there is no such invoice for this tenant.
 *
 * Null rather than a throw: the caller is a route holding an id from a URL, and "no such
 * document" is a 404 rather than a fault. RLS has already made "another business's invoice" and
 * "no such invoice" the same answer, which is exactly what they should be to somebody guessing
 * at URLs.
 */
export async function printableInvoice(
	tx: Tx,
	invoiceId: string,
	businessId: string
): Promise<PrintableDocument | null> {
	const invoice = await loadInvoice(tx, invoiceId);
	if (!invoice) return null;

	const [businessRow] = await tx
		.select()
		.from(businessTable)
		.where(eq(businessTable.businessId, businessId));

	const settings = await loadSettings(tx);

	return invoiceDocument({
		invoice,
		price: priceInvoice(invoice),
		issuer: issuerFrom(businessRow),
		bankingDetails: settings.bankingDetails,
		footer: settings.footerTerms,
		// A draft has no number of its own. Showing the one it WOULD get is better than a hole in
		// the masthead of a client-facing preview — and the editor labels it as provisional.
		provisionalNumber: invoice.number ? null : await provisionalNumber(tx)
	});
}
