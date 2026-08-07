/**
 * POSTING TO THE BOOKS.
 *
 * Four entries, and every one of them balances to zero — which the database asserts at COMMIT
 * with a deferred constraint trigger, so a half-written entry cannot exist even if this file is
 * wrong. See `schema/ledger.ts` for why double entry at all.
 *
 *   ISSUING AN INVOICE           DR receivable      total
 *                                CR revenue         subtotal
 *                                CR vat_output      tax
 *
 *   COST OF SALE (per kind)      DR cost_materials  what the materials cost
 *                                CR inventory       the same, because the stock left the store
 *                                DR cost_labour     what the labour cost
 *                                CR cost_payable    the same, because it is owed to somebody
 *
 *   RECEIVING A PAYMENT          DR bank            amount
 *                                CR receivable      amount
 *
 *   REVERSING ONE                the mirror of it, as a new entry — never an edit or a delete
 *
 * WHY VAT IS ITS OWN ACCOUNT
 * --------------------------
 * Because it was never the business's money. R24 150 arrives and R3 150 of it belongs to SARS,
 * so revenue is R21 000 and the margin panel works off that. Folding VAT into revenue would
 * overstate every margin in the product by the VAT rate, on a screen whose entire purpose is to
 * tell an owner what a job actually left them.
 *
 * WHY COST IS POSTED AT ISSUE RATHER THAN AT PAYMENT
 * --------------------------------------------------
 * The materials were consumed when the job was done, not when the client got round to paying.
 * Matching the cost to the revenue in the same period is what makes a monthly margin mean
 * anything, and it is why the cost snapshot is taken when the line is added.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { lineAmount, negateMoney, subMoney, sumMoney, type Money } from '$lib/core/money';
import type { CostKind } from '$lib/core/invoicing';
import { toMoney, toQuantity, toUnitPrice } from '$lib/server/core/db/map';
import { allocation, posting, type LedgerAccount } from '$lib/server/core/db/schema/ledger';
import type { invoiceLine } from '$lib/server/core/db/schema/invoicing';
import type { Tx } from '$lib/server/core/db/tx';

type InvoiceLineRow = typeof invoiceLine.$inferSelect;

/** One leg. Debit positive, credit negative — the signs are checked by the sum, not by faith. */
type Leg = {
	readonly account: LedgerAccount;
	readonly amount: Money;
	readonly memo?: string;
};

/**
 * Write one balanced entry.
 *
 * Zero-value legs are dropped rather than written: an invoice with no VAT on it should not carry
 * a `vat_output` leg of R0,00, which would be a row saying nothing in a table people read.
 *
 * An entry with nothing left after that is not written at all. That is a real case — a business
 * that is not a VAT vendor issuing an invoice for R0,00 is not something to post about — and
 * writing an empty entry would leave an `entry_id` in the books with no legs.
 */
async function writeEntry(
	tx: Tx,
	businessId: string,
	input: {
		readonly entryKind: string;
		readonly sourceKind: 'invoice' | 'invoice_payment';
		readonly sourceId: string;
		readonly occurredOn: string;
		readonly memo: string;
		readonly legs: readonly Leg[];
	}
): Promise<string | null> {
	const legs = input.legs.filter((l) => l.amount.cents !== 0);
	if (legs.length === 0) return null;

	const entryId = randomUUID();

	await tx.insert(posting).values(
		legs.map((leg) => ({
			businessId,
			entryId,
			entryKind: input.entryKind,
			account: leg.account,
			amountCents: leg.amount.cents,
			currency: leg.amount.currency,
			sourceKind: input.sourceKind,
			sourceId: input.sourceId,
			occurredOn: input.occurredOn,
			memo: leg.memo ?? input.memo
		}))
	);

	return entryId;
}

/** The credit side. `negateMoney` is the money core's — nothing in this file does arithmetic. */
const credit = negateMoney;

/**
 * WHAT A LINE COST, AND WHICH KIND OF COST IT IS.
 *
 * The classification is derived from where the line came from and never asked of the user:
 * a line sourced from a stock item is MATERIALS, because that is literally what came out of the
 * store; anything else with a recorded cost is LABOUR or subcontract. Putting a "cost type"
 * dropdown in front of somebody trying to send an invoice would be asking them a bookkeeping
 * question to answer a plumbing one.
 */
export function costKindOf(row: Pick<InvoiceLineRow, 'costSource' | 'sourceItemId'>): CostKind {
	return row.costSource === 'inventory' || row.sourceItemId !== null ? 'materials' : 'labour';
}

/**
 * The cost of one line: what one costs, times how many. Null when nobody recorded it.
 *
 * Through `toUnitPrice`/`toQuantity` and then `lineAmount` — the same two steps the CHARGE side
 * takes. A cost and a price rounded by different routes would differ by a cent on exactly the
 * lines where the margin is thinnest.
 */
export function lineCost(row: InvoiceLineRow): Money | null {
	if (row.costMicros === null) return null;
	return lineAmount(toUnitPrice(row.costMicros, row.currency), toQuantity(row.qtyE6));
}

/** Where the credit for a cost goes: stock consumed, or money owed to whoever did the work. */
const COST_CONTRA: Readonly<Record<CostKind, LedgerAccount>> = Object.freeze({
	materials: 'inventory',
	labour: 'cost_payable'
});

const COST_ACCOUNT: Readonly<Record<CostKind, LedgerAccount>> = Object.freeze({
	materials: 'cost_materials',
	labour: 'cost_labour'
});

/**
 * ISSUING AN INVOICE, in the books.
 *
 * The revenue entry always. A cost entry per kind, only where a cost is actually known — an
 * unknown cost posts NOTHING rather than a zero, because a zero in the ledger is a claim that
 * the job cost nothing and `margin.ts` would then report a margin the business did not make.
 */
export async function postInvoiceIssued(
	tx: Tx,
	businessId: string,
	input: {
		readonly invoiceId: string;
		readonly number: string;
		readonly customerName: string | null;
		readonly issueDate: string;
		readonly subtotal: Money;
		readonly tax: Money;
		readonly total: Money;
		readonly lines: readonly InvoiceLineRow[];
	}
): Promise<void> {
	const memo = `Invoice ${input.number}${input.customerName ? ` to ${input.customerName}` : ''}`;

	await writeEntry(tx, businessId, {
		entryKind: 'invoice_issued',
		sourceKind: 'invoice',
		sourceId: input.invoiceId,
		occurredOn: input.issueDate,
		memo,
		legs: [
			{ account: 'receivable', amount: input.total },
			{ account: 'revenue', amount: credit(input.subtotal) },
			{ account: 'vat_output', amount: credit(input.tax) }
		]
	});

	// One entry per cost kind rather than per line: the workings are for a person to read, and
	// "Materials R14 280" is the line they are looking for, not eleven of them.
	for (const kind of ['materials', 'labour'] as const) {
		const costs = input.lines.flatMap((row) => {
			if (costKindOf(row) !== kind) return [];
			const cost = lineCost(row);
			return cost ? [cost] : [];
		});

		if (costs.length === 0) continue;

		const total = sumMoney(input.total.currency, costs);

		await writeEntry(tx, businessId, {
			entryKind: `cost_of_sale_${kind}`,
			sourceKind: 'invoice',
			sourceId: input.invoiceId,
			occurredOn: input.issueDate,
			memo: `${kind === 'materials' ? 'Materials' : 'Labour'} on ${input.number}`,
			legs: [
				{ account: COST_ACCOUNT[kind], amount: total },
				{ account: COST_CONTRA[kind], amount: credit(total) }
			]
		});
	}
}

/**
 * MONEY IN — and the allocation that says which invoice it settled.
 *
 * Both, together, in the caller's transaction. The allocation is what lets the ledger answer
 * "what is outstanding on INV-1042?" independently of `invoicing_payment`, which is the whole
 * of what "the figures reconcile to postings" means. `invoicing.test.ts` computes both and
 * asserts they agree.
 */
export async function postPaymentReceived(
	tx: Tx,
	businessId: string,
	input: {
		readonly invoiceId: string;
		readonly paymentId: string;
		readonly number: string;
		readonly amount: Money;
		readonly receivedOn: string;
	}
): Promise<void> {
	const entryId = await writeEntry(tx, businessId, {
		entryKind: 'payment_received',
		sourceKind: 'invoice_payment',
		sourceId: input.paymentId,
		occurredOn: input.receivedOn,
		memo: `Payment on ${input.number}`,
		legs: [
			{ account: 'bank', amount: input.amount },
			{ account: 'receivable', amount: credit(input.amount) }
		]
	});

	if (entryId) await allocate(tx, businessId, entryId, input, input.amount);
}

/**
 * MONEY BACK OUT.
 *
 * A new entry that mirrors the original, never an edit to it and never a delete. The books then
 * show both facts — the payment was recorded on the 3rd, and taken back on the 5th — which is
 * the history, and is different from the payment never having existed.
 */
export async function postPaymentReversed(
	tx: Tx,
	businessId: string,
	input: {
		readonly invoiceId: string;
		readonly paymentId: string;
		readonly number: string;
		readonly amount: Money;
		readonly receivedOn: string;
	}
): Promise<void> {
	const entryId = await writeEntry(tx, businessId, {
		entryKind: 'payment_reversed',
		sourceKind: 'invoice_payment',
		sourceId: input.paymentId,
		occurredOn: input.receivedOn,
		memo: `Payment on ${input.number} undone`,
		legs: [
			{ account: 'receivable', amount: input.amount },
			{ account: 'bank', amount: credit(input.amount) }
		]
	});

	if (entryId) await allocate(tx, businessId, entryId, input, credit(input.amount));
}

/**
 * WITHDRAWING AN INVOICE.
 *
 * The exact reverse of the issue entry. The cost entries are deliberately left alone: the
 * materials were still consumed and the labour was still done, and pretending otherwise would
 * make a cancelled job look free. What is reversed is the CLAIM on the client, which is the
 * thing the cancellation withdrew.
 */
export async function postInvoiceCancelled(
	tx: Tx,
	businessId: string,
	input: {
		readonly invoiceId: string;
		readonly number: string;
		readonly on: string;
		readonly subtotal: Money;
		readonly tax: Money;
		readonly total: Money;
	}
): Promise<void> {
	await writeEntry(tx, businessId, {
		entryKind: 'invoice_cancelled',
		sourceKind: 'invoice',
		sourceId: input.invoiceId,
		occurredOn: input.on,
		memo: `Invoice ${input.number} cancelled`,
		legs: [
			{ account: 'receivable', amount: credit(input.total) },
			{ account: 'revenue', amount: input.subtotal },
			{ account: 'vat_output', amount: input.tax }
		]
	});
}

/** Apply a receipt to a document. Negative when a reversal gives it back. */
async function allocate(
	tx: Tx,
	businessId: string,
	entryId: string,
	input: { readonly invoiceId: string; readonly receivedOn: string },
	amount: Money
): Promise<void> {
	// The bank leg is the one being spent against the invoice. Selected rather than remembered,
	// because `writeEntry` drops zero legs and the caller should not have to know that.
	const [bankLeg] = await tx
		.select({ id: posting.id })
		.from(posting)
		.where(and(eq(posting.entryId, entryId), eq(posting.account, 'bank')))
		.limit(1);

	if (!bankLeg) return;

	await tx.insert(allocation).values({
		businessId,
		postingId: bankLeg.id,
		documentKind: 'invoice',
		documentId: input.invoiceId,
		amountCents: amount.cents,
		currency: amount.currency,
		occurredOn: input.receivedOn
	});
}

/**
 * WHAT THE LEDGER SAYS ONE INVOICE IS OWED.
 *
 * The receivable legs for the document, plus everything allocated against it. Used by the tests
 * to prove the module's settlement arithmetic and the books agree — two independent routes to
 * one number, which is the only version of "reconciles" worth the word.
 */
export async function ledgerOutstanding(
	tx: Tx,
	invoiceId: string,
	currency: Money['currency']
): Promise<Money> {
	const [row] = await tx
		.select({
			receivable: sql<string>`coalesce(sum(${posting.amountCents}), 0)::text`
		})
		.from(posting)
		.where(
			and(
				eq(posting.sourceKind, 'invoice'),
				eq(posting.sourceId, invoiceId),
				eq(posting.account, 'receivable')
			)
		);

	const [applied] = await tx
		.select({ total: sql<string>`coalesce(sum(${allocation.amountCents}), 0)::text` })
		.from(allocation)
		.where(and(eq(allocation.documentKind, 'invoice'), eq(allocation.documentId, invoiceId)));

	// Receivable raised, less what has been applied to it. Both read through `toMoney`, which
	// refuses anything that is not an exact integer — a `sum()` comes back as a string.
	return subMoney(toMoney(row?.receivable ?? 0, currency), toMoney(applied?.total ?? 0, currency));
}

/**
 * THE WORKINGS — every posting for one invoice, in the order they happened.
 *
 * What "See the workings" opens. Deliberately the raw entries rather than a summary: the point
 * of the link is that somebody who does not believe the panel can check it.
 */
export type WorkingLine = {
	readonly entryKind: string;
	readonly account: LedgerAccount;
	readonly amountCents: number;
	readonly occurredOn: string;
	readonly memo: string | null;
};

export async function workingsFor(
	tx: Tx,
	invoiceId: string,
	paymentIds: readonly string[]
): Promise<WorkingLine[]> {
	const ids = [invoiceId, ...paymentIds];

	const rows = await tx
		.select({
			entryKind: posting.entryKind,
			account: posting.account,
			amountCents: posting.amountCents,
			occurredOn: posting.occurredOn,
			memo: posting.memo,
			createdAt: posting.createdAt
		})
		.from(posting)
		.where(sql`${posting.sourceId} in ${ids}`)
		.orderBy(posting.createdAt, posting.id);

	return rows.map((r) => ({
		entryKind: r.entryKind,
		account: r.account as LedgerAccount,
		amountCents: r.amountCents,
		occurredOn: r.occurredOn,
		memo: r.memo
	}));
}
