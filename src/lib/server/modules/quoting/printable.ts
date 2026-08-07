/**
 * A QUOTE, READY FOR PAPER.
 *
 * The one function that turns storage into a `PrintableDocument`, and therefore the seam every
 * rendering of a quote passes through — the editor's preview, the PDF a client is emailed, the
 * PDF the escape hatch in T18 downloads. `$lib/core/quoting/document.ts` decides what a quote
 * looks like as paper; this supplies it with what the database knows.
 *
 * Exported through `public.ts`, because the documents route is core and asks every module the
 * same question: "do you own document X, and if so, what does it look like?"
 */
import { issuerFrom, priceQuote, quoteDocument } from '$lib/core/quoting';
import type { PrintableDocument } from '$lib/core/document';
import { business as businessTable } from '$lib/server/core/db/schema/core';
import type { Tx } from '$lib/server/core/db/tx';
import { eq } from 'drizzle-orm';
import { loadQuote, loadSettings, provisionalNumber } from './queries';

/**
 * The document, or null when there is no such quote for this tenant.
 *
 * Null rather than a throw: the caller is a route holding an id from a URL, and "no such
 * document" is a 404 rather than a fault. RLS has already made "another business's quote" and
 * "no such quote" the same answer, which is exactly what it should be.
 */
export async function printableQuote(
	tx: Tx,
	quoteId: string,
	businessId: string
): Promise<PrintableDocument | null> {
	const quote = await loadQuote(tx, quoteId);
	if (!quote) return null;

	const [businessRow] = await tx
		.select()
		.from(businessTable)
		.where(eq(businessTable.businessId, businessId));

	const settings = await loadSettings(tx);

	return quoteDocument({
		quote,
		price: priceQuote(quote),
		issuer: issuerFrom(businessRow),
		footer: settings.footerTerms ?? undefined,
		// A draft has no number of its own. Showing the one it WOULD get is better than a hole
		// in the masthead of a client-facing preview — and the editor labels it as provisional.
		provisionalNumber: quote.number ? null : await provisionalNumber(tx)
	});
}
