/**
 * READING INVOICES.
 *
 * Every function here takes a `Tx` and no `businessId`. That is not an omission: the tables are
 * tenant tables, so `tenant_isolation` has already decided whose rows these are, and a
 * `where business_id = …` on top of it would be a second, weaker answer to a question the
 * database has answered.
 *
 * Nothing here writes. `effects.ts` is the other half.
 *
 * THE LIST IS BOUNDED AND PAGED, always. T20 is explicit about why: "24 invoices fit; a real
 * business will have thousands. Add a bound and a paging affordance now — an unbounded query is
 * a defect waiting for a successful customer."
 */
import { and, asc, count, desc, eq, isNull, isNotNull, ne, or, sql } from 'drizzle-orm';
import {
	effectiveInvoiceStatus,
	type Invoice,
	type InvoiceFilter,
	type InvoiceListItem,
	type InvoicePayment,
	type InvoiceSort,
	type SortDirection,
	type StoredInvoiceStatus
} from '$lib/core/invoicing';
import { todayIn, type CalendarDate } from '$lib/core/calendar';
import { sumMoney, zero, type Money } from '$lib/core/money';
import { peekDocumentNumber } from '$lib/server/core/db/numbering';
import { customer as customerTable } from '$lib/server/core/db/schema/core';
import {
	invoice,
	invoiceLine,
	invoicePayment,
	invoicingSetting
} from '$lib/server/core/db/schema/invoicing';
import {
	toCustomer,
	toInvoice,
	toInvoicePayment,
	toMoney,
	type Customer
} from '$lib/server/core/db/map';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Tx } from '$lib/server/core/db/tx';

/**
 * The business's invoicing defaults.
 *
 * A business that has never opened its invoicing settings has no row, and that must not be an
 * error — so the absence has an answer, stated once here rather than defaulted at five call
 * sites. The same shape as `quoting/queries.ts`, for the same reason.
 */
export type InvoicingSettings = {
	readonly paymentTermsDays: number;
	/** One printed line per element. Null when the business has not filled them in. */
	readonly bankingDetails: readonly string[] | null;
	readonly footerTerms: readonly string[] | null;
	readonly reminderTemplate: string | null;
};

export const DEFAULT_SETTINGS: InvoicingSettings = Object.freeze({
	paymentTermsDays: 14,
	bankingDetails: null,
	footerTerms: null,
	reminderTemplate: null
});

export async function loadSettings(tx: Tx): Promise<InvoicingSettings> {
	const [row] = await tx.select().from(invoicingSetting).limit(1);
	if (!row) return DEFAULT_SETTINGS;

	return {
		paymentTermsDays: row.paymentTermsDays,
		// Stored as one text column and printed as lines, because the footer is prose the business
		// wrote and a blank line in the middle of it is theirs to keep.
		bankingDetails: row.bankingDetails === null ? null : row.bankingDetails.split('\n'),
		footerTerms: row.footerTerms === null ? null : row.footerTerms.split('\n'),
		reminderTemplate: row.reminderTemplate
	};
}

/** The clients an invoice can be addressed to. Archived customers are not offered. */
export async function loadCustomers(tx: Tx): Promise<Customer[]> {
	const rows = await tx
		.select()
		.from(customerTable)
		.where(isNull(customerTable.archivedAt))
		.orderBy(asc(customerTable.name));

	return rows.map(toCustomer);
}

/**
 * One invoice, with its lines.
 *
 * Two queries rather than a join: a join would repeat every header column once per line, and the
 * header here is forty-seven columns wide. Both run inside the caller's transaction, so they see
 * the same instant.
 */
export async function loadInvoice(tx: Tx, invoiceId: string): Promise<Invoice | null> {
	const [header] = await tx.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
	if (!header || header.archivedAt !== null) return null;

	const lines = await tx
		.select()
		.from(invoiceLine)
		.where(and(eq(invoiceLine.invoiceId, invoiceId), isNull(invoiceLine.archivedAt)))
		.orderBy(asc(invoiceLine.position), asc(invoiceLine.createdAt));

	return toInvoice(header, lines);
}

/** The raw header, for the paths that need the columns the domain type does not carry. */
export async function loadInvoiceRow(tx: Tx, invoiceId: string) {
	const [row] = await tx.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
	return row ?? null;
}

/** The raw lines, for the cost side — the domain type carries cost, the ledger needs the rows. */
export async function loadInvoiceLineRows(tx: Tx, invoiceId: string) {
	return tx
		.select()
		.from(invoiceLine)
		.where(and(eq(invoiceLine.invoiceId, invoiceId), isNull(invoiceLine.archivedAt)))
		.orderBy(asc(invoiceLine.position), asc(invoiceLine.createdAt));
}

/** Every payment and reversal on one invoice, oldest first. */
export async function loadPayments(tx: Tx, invoiceId: string): Promise<InvoicePayment[]> {
	const rows = await tx
		.select()
		.from(invoicePayment)
		.where(eq(invoicePayment.invoiceId, invoiceId))
		.orderBy(asc(invoicePayment.recordedAt));

	return rows.map(toInvoicePayment);
}

/**
 * WHAT THE LIST NEEDS, IN TWO QUERIES RATHER THAN N+1.
 *
 * The rows, and then the payments for exactly those rows — so a page of 25 invoices costs two
 * round trips regardless of how many payments they carry between them. Computing outstanding
 * per row with a correlated subquery is the N+1 the review checklist names, and it lands on the
 * screen a business looks at most often.
 *
 * The FILTER is applied in SQL where it can be (status, drafts) and in TypeScript where it
 * cannot (`overdue`, which is derived from today's date). `matchesFilter` is the single
 * definition both the tabs and the export read, so they cannot disagree about what "Unpaid"
 * means.
 */
export type InvoicePage = {
	readonly items: readonly InvoiceListItem[];
	/** How many match the filter in total, so the pager can say what it is paging through. */
	readonly total: number;
	readonly page: number;
	readonly pageSize: number;
};

export const DEFAULT_PAGE_SIZE = 25;

/** A ceiling on what one request can ask for. An export asks for more, and is still bounded. */
export const MAX_PAGE_SIZE = 500;

export async function listInvoices(
	tx: Tx,
	options: {
		filter?: InvoiceFilter;
		sort?: InvoiceSort;
		direction?: SortDirection;
		page?: number;
		pageSize?: number;
		now?: Date;
	} = {}
): Promise<InvoicePage> {
	const {
		filter = 'all',
		sort = 'due',
		direction = 'asc',
		page = 1,
		pageSize = DEFAULT_PAGE_SIZE,
		now = new Date()
	} = options;

	const today = todayIn(now);
	const size = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);

	// The part of the filter SQL can decide. `overdue` cannot be one of these — it depends on
	// today's date and on nothing stored — so the narrowest honest predicate is used and the
	// derived status does the rest.
	const stored = storedStatusesFor(filter);

	const where = and(
		isNull(invoice.archivedAt),
		stored ? sql`${invoice.status} in ${stored}` : undefined,
		// Overdue is unpaid and past due. The date half is SQL's; the status half is above.
		filter === 'overdue' ? sql`${invoice.dueDate} < ${today}` : undefined
	);

	const [{ total }] = await tx.select({ total: count() }).from(invoice).where(where);

	const rows = await tx
		.select({
			id: invoice.id,
			number: invoice.numberFormatted,
			status: invoice.status,
			customerName: invoice.customerName,
			issueDate: invoice.issueDate,
			dueDate: invoice.dueDate,
			paidOn: invoice.paidOn,
			totalCents: invoice.snapshotTotalCents,
			currency: invoice.currency,
			updatedAt: invoice.updatedAt
		})
		.from(invoice)
		.where(where)
		.orderBy(...orderFor(sort, direction))
		.limit(size)
		.offset((Math.max(1, page) - 1) * size);

	const ids = rows.map((r) => r.id);
	const [paid, priced] = await Promise.all([paidByInvoice(tx, ids), pricedDraftIds(tx, ids)]);

	const items = rows.map((row): InvoiceListItem => {
		const storedStatus = row.status as StoredInvoiceStatus;
		const total = row.totalCents === null ? null : toMoney(row.totalCents, row.currency);
		const received = paid.get(row.id);

		return {
			id: row.id,
			number: row.number,
			status: effectiveInvoiceStatus(storedStatus, row.dueDate, today),
			customerName: row.customerName,
			issueDate: row.issueDate,
			dueDate: row.dueDate,
			paidOn: row.paidOn,
			total,
			// A draft is owed nothing, because it has not been sent to anybody; a cancelled
			// invoice is owed nothing, because it was withdrawn. Both are null-and-zero rather
			// than the total, which would put money in the "Owed to you" column that nobody owes.
			outstanding:
				total === null
					? null
					: storedStatus === 'cancelled'
						? zero(total.currency)
						: received
							? subtractClamped(total, received)
							: total,
			hasAmount: priced.has(row.id),
			updatedAt: row.updatedAt
		};
	});

	return { items, total, page: Math.max(1, page), pageSize: size };
}

/**
 * The ORDER BY for one column and one direction.
 *
 * Two clauses always: the chosen column, then `updated_at` as the tie-break — so two invoices
 * issued on the same day come back in the same order on every page load. Without it, a paged
 * list can show the same row twice and skip another, which is the kind of bug that gets reported
 * as "an invoice disappeared".
 *
 * `NULLS LAST` on the date columns: a draft has neither, and drafts belong at the end of a list
 * sorted by when things happened rather than at the top of it.
 */
function orderFor(sort: InvoiceSort, direction: SortDirection) {
	const dir = direction === 'asc' ? asc : desc;
	// `AnyPgColumn`, because the three columns this is applied to have different literal names and
	// different data types — a `typeof invoice.dueDate` annotation would type-check only for one
	// of them.
	const nullsLast = (column: AnyPgColumn) =>
		direction === 'asc' ? sql`${column} asc nulls last` : sql`${column} desc nulls last`;

	switch (sort) {
		case 'issued':
			return [nullsLast(invoice.issueDate), desc(invoice.updatedAt)];
		case 'client':
			return [dir(invoice.customerName), desc(invoice.updatedAt)];
		case 'amount':
			return [nullsLast(invoice.snapshotTotalCents), desc(invoice.updatedAt)];
		case 'due':
		default:
			return [nullsLast(invoice.dueDate), desc(invoice.updatedAt)];
	}
}

/** Outstanding, never below zero. An overpayment is a refund, not a negative invoice. */
function subtractClamped(total: Money, received: Money): Money {
	return received.cents >= total.cents
		? zero(total.currency)
		: toMoney(total.cents - received.cents, total.currency);
}

/** Which stored statuses a tab can be narrowed to in SQL. Null means "no narrowing". */
function storedStatusesFor(filter: InvoiceFilter): readonly StoredInvoiceStatus[] | null {
	switch (filter) {
		case 'all':
			return null;
		case 'unpaid':
		case 'overdue':
			return ['sent', 'viewed'];
		case 'paid':
			return ['paid'];
		case 'drafts':
			return ['draft'];
	}
}

/**
 * What has actually been received against each of these invoices.
 *
 * One grouped query for the whole page. Reversed payments are excluded by the NOT EXISTS rather
 * than by subtracting them, so a reversal and its payment cancel exactly and no rounding can
 * creep in between two sums.
 */
async function paidByInvoice(tx: Tx, invoiceIds: readonly string[]): Promise<Map<string, Money>> {
	if (invoiceIds.length === 0) return new Map();

	const rows = await tx
		.select({
			invoiceId: invoicePayment.invoiceId,
			currency: invoicePayment.currency,
			paid: sql<string>`sum(${invoicePayment.amountCents})::text`
		})
		.from(invoicePayment)
		.where(
			and(
				sql`${invoicePayment.invoiceId} in ${invoiceIds}`,
				eq(invoicePayment.kind, 'payment'),
				sql`not exists (
					select 1 from ${invoicePayment} r
					 where r.reverses_payment_id = ${invoicePayment.id}
				)`
			)
		)
		.groupBy(invoicePayment.invoiceId, invoicePayment.currency);

	return new Map(rows.map((r) => [r.invoiceId, toMoney(r.paid, r.currency)]));
}

/**
 * Which of these have at least one priced line.
 *
 * Only drafts need this — it is what turns "Draft" into "Draft · needs an amount". A no-charge
 * line counts as priced: it has been given a value deliberately, which is exactly the state the
 * warning exists to distinguish from.
 */
async function pricedDraftIds(tx: Tx, invoiceIds: readonly string[]): Promise<Set<string>> {
	if (invoiceIds.length === 0) return new Set();

	const rows = await tx
		.selectDistinct({ invoiceId: invoiceLine.invoiceId })
		.from(invoiceLine)
		.where(
			and(
				sql`${invoiceLine.invoiceId} in ${invoiceIds}`,
				isNull(invoiceLine.archivedAt),
				or(ne(invoiceLine.unitPriceMicros, 0), eq(invoiceLine.noCharge, true))
			)
		);

	return new Set(rows.map((r) => r.invoiceId));
}

/**
 * THE FIVE TAB COUNTS, in one query.
 *
 * `Overdue 0` is shown rather than hidden, so every count has to be produced even when it is
 * zero — which a query that only returned non-empty groups would not do. Counted in SQL with
 * FILTER clauses rather than five round trips.
 */
export type InvoiceCounts = Readonly<Record<InvoiceFilter, number>>;

export async function countInvoices(tx: Tx, now: Date = new Date()): Promise<InvoiceCounts> {
	const today = todayIn(now);

	const [row] = await tx
		.select({
			all: sql<number>`count(*)::int`,
			unpaid: sql<number>`count(*) filter (where ${invoice.status} in ('sent','viewed'))::int`,
			overdue: sql<number>`count(*) filter (where ${invoice.status} in ('sent','viewed') and ${invoice.dueDate} < ${today})::int`,
			paid: sql<number>`count(*) filter (where ${invoice.status} = 'paid')::int`,
			drafts: sql<number>`count(*) filter (where ${invoice.status} = 'draft')::int`
		})
		.from(invoice)
		.where(isNull(invoice.archivedAt));

	return {
		all: row.all,
		unpaid: row.unpaid,
		overdue: row.overdue,
		paid: row.paid,
		drafts: row.drafts
	};
}

/**
 * THE SUMMARY BAR — "Owed to you R84 200 · Due this week R24 150 · Overdue None".
 *
 * Three figures and the facts the header sentence needs, computed together from one pass over
 * the unpaid invoices. Doing it in one place is what keeps "6 unpaid, none overdue" and the
 * Overdue stat from ever disagreeing on the same screen.
 */
export type InvoiceSummary = {
	readonly owed: Money;
	readonly dueThisWeek: Money;
	readonly overdue: Money;
	readonly overdueCount: number;
	readonly unpaidCount: number;
	/** The soonest due date among unpaid invoices, and how many share it. */
	readonly nextDue: { readonly on: CalendarDate; readonly count: number } | null;
};

/** "Due this week" — the next seven days, inclusive of today. */
const THIS_WEEK_DAYS = 7;

export async function summarise(
	tx: Tx,
	currency: Money['currency'],
	now: Date = new Date()
): Promise<InvoiceSummary> {
	const today = todayIn(now);

	// Every unpaid invoice, with what has been received against it. Unpaid invoices are the small
	// set by construction — a business with ten thousand unpaid invoices has a different problem
	// — and the alternative, a SQL expression carrying the reversal logic a second time, is a
	// place for the two definitions of "paid" to drift.
	const rows = await tx
		.select({
			id: invoice.id,
			dueDate: invoice.dueDate,
			totalCents: invoice.snapshotTotalCents,
			currency: invoice.currency
		})
		.from(invoice)
		.where(
			and(
				isNull(invoice.archivedAt),
				sql`${invoice.status} in ('sent','viewed')`,
				isNotNull(invoice.snapshotTotalCents)
			)
		);

	const paid = await paidByInvoice(
		tx,
		rows.map((r) => r.id)
	);

	const owed: Money[] = [];
	const dueSoon: Money[] = [];
	const late: Money[] = [];
	let overdueCount = 0;
	const dueDates: CalendarDate[] = [];

	for (const row of rows) {
		const total = toMoney(row.totalCents ?? 0, row.currency);
		const received = paid.get(row.id);
		const outstanding = received ? subtractClamped(total, received) : total;
		if (outstanding.cents === 0) continue;

		owed.push(outstanding);

		const status = effectiveInvoiceStatus('sent', row.dueDate, today);
		if (status === 'overdue') {
			late.push(outstanding);
			overdueCount += 1;
			continue;
		}

		if (row.dueDate) {
			dueDates.push(row.dueDate);
			if (daysUntil(today, row.dueDate) <= THIS_WEEK_DAYS) dueSoon.push(outstanding);
		}
	}

	const soonest = dueDates.length === 0 ? null : dueDates.slice().sort()[0];

	return {
		owed: sumMoney(currency, owed),
		dueThisWeek: sumMoney(currency, dueSoon),
		overdue: sumMoney(currency, late),
		overdueCount,
		unpaidCount: owed.length,
		nextDue: soonest ? { on: soonest, count: dueDates.filter((d) => d === soonest).length } : null
	};
}

/** Whole days between two calendar dates. Not money — no rounding policy applies. */
function daysUntil(from: CalendarDate, to: CalendarDate): number {
	return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/**
 * HAS THIS QUOTE ALREADY BEEN INVOICED?
 *
 * Exported through `public.ts` for T18's accepted-quote screen, which offers "Make an invoice"
 * and must not offer it twice. Returns the id and number so the offer can become a link to the
 * invoice that already exists — which is what somebody clicking a second time actually wants.
 *
 * A cancelled invoice does not count: the quote is billable again, and the design's whole reason
 * for cancellation being a one-way door is that the withdrawn document stays on the record.
 */
export async function invoiceForQuote(
	tx: Tx,
	quoteId: string
): Promise<{ readonly id: string; readonly number: string | null } | null> {
	const [row] = await tx
		.select({ id: invoice.id, number: invoice.numberFormatted })
		.from(invoice)
		.where(
			and(
				eq(invoice.sourceQuoteId, quoteId),
				isNull(invoice.archivedAt),
				ne(invoice.status, 'cancelled')
			)
		)
		.orderBy(desc(invoice.createdAt))
		.limit(1);

	return row ?? null;
}

/**
 * The number this invoice WILL get.
 *
 * Provisional by construction — `peekDocumentNumber` reads the counter without taking it, so two
 * people drafting at once are both shown `INV-1043` and exactly one of them gets it. Reserving
 * on open would burn a number every time somebody clicked New and changed their mind, and on an
 * invoice sequence a gap is something an accountant will eventually ask about.
 */
export async function provisionalNumber(tx: Tx): Promise<string> {
	return (await peekDocumentNumber(tx, 'invoice')).formatted;
}
