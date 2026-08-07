/**
 * "SEE THE WORKINGS."
 *
 * The link under the margin panel, and the reason that panel is allowed to exist at all. T21
 * makes it an acceptance criterion — "Margin figures reconcile to ledger postings; 'See the
 * workings' shows them" — and a link that opened a prettier version of the same summary would
 * satisfy the words and none of the point.
 *
 * So this shows the ENTRIES: every posting for this invoice and its payments, in the order they
 * happened, with the account each one hit. Somebody who does not believe the panel can check it,
 * which is the only reason to trust a number a computer produced about your own money.
 *
 * `read`, not `write`. Reading your own books is not an edit, and a removed module's records stay
 * readable.
 */
import { error } from '@sveltejs/kit';
import { withModule } from '$lib/server/core/ctx';
import { loadInvoiceRow, loadPayments } from '$lib/server/modules/invoicing/queries';
import { workingsFor } from '$lib/server/modules/invoicing/ledger';
import { marginFor } from '$lib/server/modules/invoicing/margin';
import { toMoney } from '$lib/server/core/db/map';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	return withModule(event, 'invoicing', 'read', async (ctx) => {
		const header = await loadInvoiceRow(ctx.tx, event.params.id);
		if (!header || header.archivedAt !== null) {
			error(404, { message: "We couldn't find that invoice." });
		}

		const payments = await loadPayments(ctx.tx, header.id);
		const [lines, margin] = await Promise.all([
			workingsFor(
				ctx.tx,
				header.id,
				payments.map((p) => p.id)
			),
			marginFor(ctx.tx, header.id, ctx.business.currency, ctx.access.inventory === 'write')
		]);

		return {
			number: header.numberFormatted,
			invoiceId: header.id,
			margin,
			// The amounts cross as `Money` so the page never formats an integer by hand — the same
			// rule every other screen follows.
			lines: lines.map((line) => ({
				entryKind: line.entryKind,
				account: line.account,
				amount: toMoney(line.amountCents, header.currency),
				occurredOn: line.occurredOn,
				memo: line.memo
			}))
		};
	});
};
