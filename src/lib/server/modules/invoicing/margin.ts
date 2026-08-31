/**
 * "THE NUMBERS BEHIND IT", FROM THE BOOKS.
 *
 * T21's acceptance criterion is precise about where these figures come from: "Margin figures
 * reconcile to ledger postings; 'See the workings' shows them." So this file reads
 * `core_posting` and nothing else — not the invoice's lines, not a recomputation. If the panel
 * and the ledger ever disagreed, the panel would be the thing that was wrong, and building it
 * out of the ledger is what makes that impossible rather than unlikely.
 *
 * `$lib/core/invoicing/margin.ts` decides what the figures MEAN and what the panel says when
 * some of them are missing — including the note about the design's own three figures not
 * reconciling. This file only supplies them.
 */
import { and, eq, sql } from 'drizzle-orm';
import { marginPanel, type CostInput, type MarginPanel } from '$lib/core/invoicing';
import type { Money } from '$lib/core/money';
import { toMoney } from '$lib/server/core/db/map';
import { posting } from '$lib/server/core/db/schema/ledger';
import { invoiceLine } from '$lib/server/core/db/schema/invoicing';
import { isNull } from 'drizzle-orm';
import type { Tx } from '$lib/server/core/db/tx';

/**
 * The panel for one invoice.
 *
 * `revenue` is the CREDIT to `revenue`, which is the subtotal — VAT was never the business's
 * money and including it would overstate every margin in the product by the VAT rate. Costs are
 * the debits to the two cost accounts. Both come back as sums, which node-postgres hands over as
 * strings; `toMoney` refuses anything that is not an exact integer.
 */
export async function marginFor(
	tx: Tx,
	invoiceId: string,
	currency: Money['currency'],
	inventoryOwned: boolean
): Promise<MarginPanel> {
	const rows = await tx
		.select({
			account: posting.account,
			total: sql<string>`sum(${posting.amountCents})::text`
		})
		.from(posting)
		.where(and(eq(posting.sourceKind, 'invoice'), eq(posting.sourceId, invoiceId)))
		.groupBy(posting.account);

	const byAccount = new Map(rows.map((r) => [r.account, toMoney(r.total, currency)]));

	// Revenue is held as a CREDIT, which is negative in the ledger's signed convention. The panel
	// shows what was earned, so the sign is flipped once, here, where the convention is being
	// left behind rather than at four call sites that would each have to remember.
	const revenueCredit = byAccount.get('revenue');
	const revenue = toMoney(revenueCredit ? -revenueCredit.cents : 0, currency);

	const costs: CostInput[] = [];
	const materials = byAccount.get('cost_materials');
	const labour = byAccount.get('cost_labour');
	if (materials && materials.cents !== 0) costs.push({ kind: 'materials', amount: materials });
	if (labour && labour.cents !== 0) costs.push({ kind: 'labour', amount: labour });

	const { total, costed, charged } = await lineCounts(tx, invoiceId);

	return marginPanel({
		revenue,
		costs,
		totalLines: total,
		costedLines: costed,
		inventoryOwned,
		chargedLabourLines: charged
	});
}

/**
 * How many lines there are, and how many of them anybody knows the cost of.
 *
 * The difference is what turns the panel's figure into an upper bound with a sentence explaining
 * why. Counted from the lines rather than from the postings, because a line with no cost posts
 * nothing at all — which is the point, and also the reason the postings alone cannot tell you
 * how much is missing.
 *
 * `charged` counts the lines whose cost is the quote's charged amount standing in for labour.
 * It decides only a sentence — the labour figure itself still comes off `core_posting`.
 */
async function lineCounts(
	tx: Tx,
	invoiceId: string
): Promise<{ total: number; costed: number; charged: number }> {
	const [row] = await tx
		.select({
			total: sql<number>`count(*)::int`,
			costed: sql<number>`count(*) filter (where ${invoiceLine.costMicros} is not null)::int`,
			charged: sql<number>`count(*) filter (where ${invoiceLine.costSource} = 'charged')::int`
		})
		.from(invoiceLine)
		.where(and(eq(invoiceLine.invoiceId, invoiceId), isNull(invoiceLine.archivedAt)));

	return { total: row?.total ?? 0, costed: row?.costed ?? 0, charged: row?.charged ?? 0 };
}

/** Did any of the costs actually come from Inventory? Decides the footnote's wording. */
export async function costsCameFromInventory(tx: Tx, invoiceId: string): Promise<boolean> {
	const [row] = await tx
		.select({ n: sql<number>`count(*)::int` })
		.from(invoiceLine)
		.where(
			and(
				eq(invoiceLine.invoiceId, invoiceId),
				isNull(invoiceLine.archivedAt),
				eq(invoiceLine.costSource, 'inventory')
			)
		);

	return (row?.n ?? 0) > 0;
}
