/**
 * INVOICING'S CONTRIBUTION TO HOME.
 *
 * Invoicing is the only module that feeds all four panels, because it is the only one that knows
 * about money coming in. Two of the design's three money cards are its answers:
 *
 *   owed-to-you   "Across 6 invoices · none overdue"
 *   paid-to-you   last full month's receipts, with the month before it as the footnote
 *
 * Until T19 there was no `invoicing_invoice` table, so neither figure could be counted and an
 * uncounted figure was not contributed at all — `compose.ts` rendered the card's honest empty
 * state rather than R0, because R0 owed and nothing to go on look identical on a card and mean
 * opposite things. Now they can be counted, and they are.
 *
 * THE STANDING POINT IS THE ONE PLACE THIS SCREEN LEGITIMATELY SAYS `attention`. An overdue
 * invoice is a fact with a date attached and money behind it — which is the design's own test
 * for when colour is earned. Everything else here is stated flatly, including the good news.
 */
import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { todayIn } from '$lib/core/calendar';
import { formatZar, sumMoney, type Money } from '$lib/core/money';
import { invoice, invoiceLine, invoicePayment } from '$lib/server/core/db/schema/invoicing';
import { toMoney } from '$lib/server/core/db/map';
import { readiness } from '$lib/server/core/home/readiness';
import type {
	AgendaContribution,
	FigureContribution,
	ModuleSummary,
	ResumeCard,
	StandingPoint,
	SummaryInput
} from '$lib/server/core/home/types';
import { summarise } from './queries';

export async function summariseInvoicing(input: SummaryInput): Promise<ModuleSummary> {
	const [standing, resume, figures, agenda] = await Promise.all([
		howThingsStand(input),
		mostRecentDraft(input),
		theMoneyCards(input),
		fallingDue(input)
	]);

	return { standing, resume, figures, agenda };
}

/**
 * "R84 200 owed across 6 invoices · none overdue" — or the overdue version, which is the one
 * sentence on this dashboard allowed to be a concern.
 */
async function howThingsStand(input: SummaryInput): Promise<StandingPoint | null> {
	const totals = await summarise(input.tx, input.business.currency, input.now);

	if (totals.unpaidCount === 0) {
		// Nothing out with anybody. That is not silence — a business that has invoiced nothing this
		// month still wants to be told the module is there and working.
		return readiness(input, 'invoicing', {
			statement: 'Invoicing is ready when you are',
			nothingYet: 'Nothing owed to you right now.'
		});
	}

	const invoices = `${totals.unpaidCount} ${totals.unpaidCount === 1 ? 'invoice' : 'invoices'}`;

	if (totals.overdueCount > 0) {
		return {
			module: 'invoicing',
			standing: 'attention',
			statement: `${totals.overdueCount} ${totals.overdueCount === 1 ? 'invoice is' : 'invoices are'} overdue`,
			// The fact and the amount, and nothing about what anybody should do. The design is
			// explicit that this dashboard does not manufacture urgency.
			explanation: `Out of ${invoices} still unpaid.`,
			href: '/invoicing?filter=overdue'
		};
	}

	return {
		module: 'invoicing',
		standing: 'clear',
		statement: `${invoices} still unpaid`,
		explanation: 'None of them overdue.',
		href: '/invoicing'
	};
}

/**
 * THE MONEY CARDS.
 *
 * `owed-to-you` is what is outstanding right now. `paid-to-you` is last full calendar month's
 * receipts, with the month before as the footnote — a comparison rather than a bare number,
 * because "R38 400" means nothing on its own and "R38 400, up from R31 900" means something.
 *
 * A figure is contributed only when there is something to count. A business that has never
 * invoiced contributes nothing and gets the card's honest empty state, not R0.
 */
async function theMoneyCards(input: SummaryInput): Promise<readonly FigureContribution[]> {
	const currency = input.business.currency;
	const [totals, receipts] = await Promise.all([
		summarise(input.tx, currency, input.now),
		monthlyReceipts(input, currency)
	]);

	const figures: FigureContribution[] = [];

	if (totals.unpaidCount > 0) {
		figures.push({
			slot: 'owed-to-you',
			amount: totals.owed,
			footnote:
				totals.overdueCount === 0
					? `Across ${totals.unpaidCount} ${totals.unpaidCount === 1 ? 'invoice' : 'invoices'} · none overdue`
					: `Across ${totals.unpaidCount} invoices · ${totals.overdueCount} overdue`
		});
	}

	if (receipts) {
		figures.push({
			slot: 'paid-to-you',
			amount: receipts.lastMonth,
			footnote: receipts.footnote
		});
	}

	return figures;
}

/**
 * Last full month's receipts, and the month before it.
 *
 * The LAST FULL month, not this one: a card comparing three days of August against the whole of
 * July would report a collapse every month on the 3rd. Reversed payments are excluded the same
 * way they are everywhere — by their absence, never by subtracting them.
 */
async function monthlyReceipts(
	input: SummaryInput,
	currency: Money['currency']
): Promise<{ lastMonth: Money; footnote: string } | null> {
	const today = todayIn(input.now);
	const [year, month] = today.split('-').map(Number);

	// The first day of this month, of last month, and of the month before.
	const startOfThis = monthStart(year, month);
	const startOfLast = monthStart(year, month - 1);
	const startOfPrior = monthStart(year, month - 2);

	const rows = await input.tx
		.select({
			receivedOn: invoicePayment.receivedOn,
			amountCents: invoicePayment.amountCents,
			currency: invoicePayment.currency
		})
		.from(invoicePayment)
		.where(
			and(
				eq(invoicePayment.kind, 'payment'),
				gte(invoicePayment.receivedOn, startOfPrior),
				lt(invoicePayment.receivedOn, startOfThis),
				sql`not exists (
					select 1 from ${invoicePayment} r where r.reverses_payment_id = ${invoicePayment.id}
				)`
			)
		);

	if (rows.length === 0) return null;

	const lastMonth = sumMoney(
		currency,
		rows.filter((r) => r.receivedOn >= startOfLast).map((r) => toMoney(r.amountCents, r.currency))
	);
	const prior = sumMoney(
		currency,
		rows.filter((r) => r.receivedOn < startOfLast).map((r) => toMoney(r.amountCents, r.currency))
	);

	if (lastMonth.cents === 0 && prior.cents === 0) return null;

	return {
		lastMonth,
		footnote:
			prior.cents === 0
				? `${monthName(startOfLast)}'s receipts`
				: `${monthName(startOfLast)} · ${describeChange(lastMonth, prior)}`
	};
}

/** "up from R31 900" / "down from R44 100" / "the same as R31 900". Plain, never a percentage. */
function describeChange(lastMonth: Money, prior: Money): string {
	if (lastMonth.cents > prior.cents) return `up from ${formatZar(prior)}`;
	if (lastMonth.cents < prior.cents) return `down from ${formatZar(prior)}`;
	return `the same as ${formatZar(prior)}`;
}

/** `YYYY-MM-01`, with month overflow handled — month 0 is December of the year before. */
function monthStart(year: number, month: number): string {
	// Calendar arithmetic, not money: there is no rounding policy for "which year is month -1 in".
	// eslint-disable-next-line no-restricted-syntax -- a calendar, not an amount
	const y = year + Math.floor((month - 1) / 12);
	const m = ((((month - 1) % 12) + 12) % 12) + 1;
	return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
}

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

function monthName(date: string): string {
	return MONTHS[Number(date.split('-')[1]) - 1];
}

/**
 * The draft to go back to — one card, never a list.
 *
 * "3 of 5 items priced" is the design's own context line, and `ResumeCard` requires one: a card
 * that says only "Draft" is a link with extra steps. So the progress is counted, and only for
 * the ONE draft shown.
 */
async function mostRecentDraft(input: SummaryInput): Promise<readonly ResumeCard[]> {
	const [draft] = await input.tx
		.select({ id: invoice.id, customerName: invoice.customerName })
		.from(invoice)
		.where(and(isNull(invoice.archivedAt), eq(invoice.status, 'draft')))
		.orderBy(desc(invoice.updatedAt))
		.limit(1);

	if (!draft) return [];

	const [counts] = await input.tx
		.select({
			total: sql<number>`count(*)::int`,
			priced: sql<number>`count(*) filter (where ${invoiceLine.unitPriceMicros} <> 0 or ${invoiceLine.noCharge})::int`
		})
		.from(invoiceLine)
		.where(and(eq(invoiceLine.invoiceId, draft.id), isNull(invoiceLine.archivedAt)));

	return [
		{
			module: 'invoicing',
			id: draft.id,
			title: draft.customerName ? `Invoice for ${draft.customerName}` : 'An invoice you started',
			context:
				counts.total === 0
					? 'Nothing on it yet'
					: `${counts.priced} of ${counts.total} ${counts.total === 1 ? 'item' : 'items'} priced`,
			href: `/invoicing/${draft.id}`
		}
	];
}

/**
 * Invoices falling due, for Coming up.
 *
 * The DATE crosses as a `Date` and `compose.ts` formats it in the business's locale — a
 * contributor that formatted its own would be a second place for the product to disagree with
 * itself about what "8 Aug" looks like.
 */
async function fallingDue(input: SummaryInput): Promise<readonly AgendaContribution[]> {
	const today = todayIn(input.now);

	const rows = await input.tx
		.select({
			id: invoice.id,
			number: invoice.numberFormatted,
			customerName: invoice.customerName,
			dueDate: invoice.dueDate,
			totalCents: invoice.snapshotTotalCents,
			currency: invoice.currency
		})
		.from(invoice)
		.where(
			and(
				isNull(invoice.archivedAt),
				sql`${invoice.status} in ('sent','viewed')`,
				gte(invoice.dueDate, today)
			)
		)
		.orderBy(invoice.dueDate)
		.limit(20);

	return rows.flatMap((row) => {
		if (!row.dueDate) return [];
		const days = daysBetweenDates(today, row.dueDate);
		// Coming up is the next few weeks, not a list of everything with a date on it.
		if (days > 30) return [];

		// Through `toMoney` either way: the currency column is a `text` as far as TypeScript is
		// concerned, and `toCurrency` inside the mapper is what narrows it. `zero()` would take the
		// unnarrowed string and is the wrong door for a value that came out of a row.
		const total = toMoney(row.totalCents ?? 0, row.currency);

		return [
			{
				id: row.id,
				// Midday UTC, so the calendar day survives a timezone shift in either direction on
				// its way to being formatted. The DATE is the fact; the instant is transport.
				on: new Date(`${row.dueDate}T12:00:00Z`),
				title: `${row.number ?? 'An invoice'} due`,
				detail: row.customerName
					? `${row.customerName} · ${formatZar(total, { decimals: 0 })}`
					: formatZar(total, { decimals: 0 })
			}
		];
	});
}

/** Whole days between two calendar dates. Not money — no rounding policy applies. */
function daysBetweenDates(from: string, to: string): number {
	return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}
