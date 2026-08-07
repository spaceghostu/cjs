/**
 * "THE NUMBERS BEHIND IT" — what the job actually left the business.
 *
 * T21 draws a small panel: Materials, Labour, and above a rule, **What you keep**. Plain
 * language over accounting vocabulary — "What you keep", not "gross margin" — and a 12px line
 * underneath: "Materials came from Inventory at the price you paid. See the workings."
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * README OPEN QUESTION: THE DESIGN'S THREE FIGURES DO NOT RECONCILE
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The design shows Materials R14 280, Labour R6 720, What you keep R6 150, on the invoice whose
 * subtotal is R21 000. But:
 *
 *   14 280 + 6 720 = 21 000   — exactly the whole subtotal
 *
 * So if those two are COSTS, the business kept nothing, and R6 150 is impossible. If they are
 * instead a split of the revenue into materials-work and labour-work, then "what you keep" is
 * not derivable from them at all, and R6 150 would have to come from a cost the panel never
 * shows. There is no reading under which all three numbers are true together — the same species
 * of error as the mobile `R9 200` in open question 1, and it is resolved the same way: by
 * choosing the reading that makes the arithmetic honest.
 *
 * THE DECISION, stated once here and enforced by the types below:
 *
 *   Materials and Labour are COSTS. What you keep = revenue − materials − labour, always.
 *
 * Under that rule the panel adds up on every invoice, which is the property that matters: a
 * screen whose three numbers do not reconcile teaches an owner not to trust the fourth.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AND WHEN THE COST IS NOT KNOWN, IT SAYS SO
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The cost side only exists if something recorded it: a line drawn from Inventory carries the
 * price the business paid, snapshotted when the line was added (`invoicing_invoice_line.cost_*`).
 * A business without Inventory has no such record, and neither does a line somebody typed by
 * hand. T19 and T21 both make this an acceptance criterion — "the panel must degrade honestly
 * rather than guess" — so an unknown cost is never treated as zero. Zero cost and unknown cost
 * produce the same margin arithmetic and mean opposite things, and only one of them is a claim
 * this product is entitled to make.
 */
import { subMoney, sumMoney, type Money } from '$lib/core/money';

/**
 * WHICH COST IS WHICH.
 *
 * Derived from where the line came from, never asked of the user: a line sourced from a stock
 * item is materials, because that is literally what came out of the store; anything else whose
 * cost was recorded is labour or subcontract. Adding a "cost type" field to the editor would put
 * a bookkeeping question in front of somebody trying to send an invoice.
 */
export type CostKind = 'materials' | 'labour';

export const COST_LABELS: Readonly<Record<CostKind, string>> = Object.freeze({
	materials: 'Materials',
	labour: 'Labour'
});

export type CostLine = {
	readonly kind: CostKind;
	readonly label: string;
	readonly amount: Money;
};

/**
 * What the panel renders.
 *
 * `keep` is always `revenue` minus the costs listed, so the column adds up as displayed. When
 * `unpricedLines` is above zero the figure is an UPPER BOUND — some line's cost is unknown, so
 * what is kept can only be less than what is shown — and `caveat` is the sentence that says so.
 * A panel that quietly folded unknown costs into the margin would be flattering rather than
 * honest.
 */
export type Margin = {
	/** Revenue before VAT. VAT was never the business's money and does not belong in this panel. */
	readonly revenue: Money;
	readonly costs: readonly CostLine[];
	readonly keep: Money;
	/** Lines with no recorded cost. Zero means the panel is exact. */
	readonly unpricedLines: number;
	readonly totalLines: number;
	/** Null when every cost is known — nothing to explain. */
	readonly caveat: string | null;
};

/**
 * The panel could not be built at all.
 *
 * Separate from a `Margin` with caveats, because "we know some of it" and "we know none of it"
 * are different screens: the first shows figures with a note, the second shows the reason and no
 * figures. Rendering R0 for the second would be the guess this whole file exists to refuse.
 */
export type MarginUnavailable = {
	readonly reason: string;
	/** The one case with an obvious next step — Inventory would supply the costs. */
	readonly offerInventory: boolean;
};

export type MarginPanel =
	| { readonly known: true; readonly margin: Margin }
	| { readonly known: false; readonly unavailable: MarginUnavailable };

export type CostInput = {
	readonly kind: CostKind;
	readonly amount: Money;
};

/**
 * Assemble the panel.
 *
 * `costs` are the per-line costs that ARE known, already classified. `totalLines` and the count
 * of costed lines are what decide between the three outcomes: nothing known, some known, all
 * known.
 *
 * `inventoryOwned` only changes the words. A business without Inventory is told what would fill
 * the gap; one that has it is told that nothing was recorded — which is a different problem with
 * a different fix, and telling somebody to switch on a module they already pay for is the kind
 * of small wrongness that costs a product its credibility.
 */
export function marginPanel(input: {
	readonly revenue: Money;
	readonly costs: readonly CostInput[];
	readonly totalLines: number;
	readonly costedLines: number;
	readonly inventoryOwned: boolean;
}): MarginPanel {
	if (input.costedLines === 0) {
		return {
			known: false,
			unavailable: {
				reason: input.inventoryOwned
					? "Nothing on this invoice has a cost recorded against it, so we can't say what the job left you."
					: "We can't show what this job cost you. Materials priced through Inventory carry the price you paid; without it there is nothing to work from.",
				offerInventory: !input.inventoryOwned
			}
		};
	}

	const costs = combine(input.costs, input.revenue.currency);
	const keep = subMoney(
		input.revenue,
		sumMoney(
			input.revenue.currency,
			costs.map((c) => c.amount)
		)
	);

	const unpricedLines = input.totalLines - input.costedLines;

	return {
		known: true,
		margin: {
			revenue: input.revenue,
			costs,
			keep,
			unpricedLines,
			totalLines: input.totalLines,
			caveat:
				unpricedLines === 0
					? null
					: `${unpricedLines} of ${input.totalLines} lines have no cost recorded, so what you keep is at most this.`
		}
	};
}

/**
 * One row per kind, in a fixed order.
 *
 * Materials first, because that is the order the design draws them and because it is the figure
 * the footnote is about. A kind with nothing in it is omitted rather than shown as R0 — an
 * invoice with no materials on it should not have a Materials row.
 */
function combine(costs: readonly CostInput[], currency: Money['currency']): readonly CostLine[] {
	const order: readonly CostKind[] = ['materials', 'labour'];

	return order.flatMap((kind) => {
		const matching = costs.filter((c) => c.kind === kind);
		if (matching.length === 0) return [];

		return [
			{
				kind,
				label: COST_LABELS[kind],
				amount: sumMoney(
					currency,
					matching.map((c) => c.amount)
				)
			}
		];
	});
}

/**
 * The 12px line under the figures.
 *
 * Only claims Inventory when a cost actually came from there. The design's sentence — "Materials
 * came from Inventory at the price you paid" — is a statement about provenance, and saying it
 * over a hand-typed number would be false.
 */
export function marginFootnote(fromInventory: boolean): string {
	return fromInventory
		? 'Materials came from Inventory at the price you paid.'
		: 'Costs are the ones recorded against these lines.';
}
