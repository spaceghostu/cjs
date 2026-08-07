/**
 * QUOTING'S CONTRIBUTION TO HOME.
 *
 * The design's own reassurance for this module is:
 *
 *   > 3 quotes waiting on clients
 *   > Sent 4 to 11 days ago. None chased yet.
 *
 * A count and an age, both derived. T15 gave the module storage, so this is now the real query
 * the `readiness` seam stood in for — and the panel around it did not move, which was the point
 * of the seam.
 *
 * QUOTING CONTRIBUTES NO FIGURE. A quote is not money the business is owed: accepting one makes
 * an invoice, and the invoice is what "Money owed to you" counts. Putting quoted work in that
 * card would tell an owner they are owed money nobody has agreed to pay.
 *
 * A FACT ABOUT DAYS, NEVER A NAG. `attention` is reserved for a quote that has been sitting
 * long enough to be worth a nudge, and even then the sentence states what happened rather than
 * what somebody should do about it. The design is explicit that this dashboard does not
 * manufacture urgency.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { daysBetween, todayIn } from '$lib/core/quoting';
import { quote, quoteLine } from '$lib/server/core/db/schema/quoting';
import { readiness } from '$lib/server/core/home/readiness';
import {
	type AgendaContribution,
	type ModuleSummary,
	type ResumeCard,
	type StandingPoint,
	type SummaryInput
} from '$lib/server/core/home/types';

/**
 * How long a quote sits before it is worth mentioning that nobody has chased it.
 *
 * Fourteen days, matching the default validity: a quote that has run half its life without an
 * answer is a fact somebody would want to know. Below that it is simply a quote, and the panel
 * says so without colour.
 */
const WORTH_A_NUDGE_DAYS = 14;

export async function summariseQuoting(input: SummaryInput): Promise<ModuleSummary> {
	const [standing, resume, agenda] = await Promise.all([
		waitingOnClients(input),
		mostRecentDraft(input),
		expiringSoon(input)
	]);

	return { standing, resume, figures: [], agenda };
}

/** "3 quotes waiting on clients · Sent 4 to 11 days ago. None chased yet." */
async function waitingOnClients(input: SummaryInput): Promise<StandingPoint | null> {
	const today = todayIn(input.now);

	const rows = await input.tx
		.select({ sentAt: quote.sentAt, validUntil: quote.validUntil })
		.from(quote)
		.where(and(isNull(quote.archivedAt), inArray(quote.status, ['sent', 'viewed'])))
		.orderBy(asc(quote.sentAt));

	// Expiry is derived rather than stored, so a quote whose date passed at midnight is not
	// "waiting on a client" even if nothing has swept yet. See `effectiveStatus`.
	const waiting = rows.filter(
		(row) => row.validUntil === null || daysBetween(row.validUntil, today) <= 0
	);

	if (waiting.length === 0) {
		// Nothing out with anybody. That is not silence — a business that has quoted nothing this
		// month still wants to be told the module is there and working.
		return readiness(input, 'quoting', {
			statement: 'Quoting is ready when you are',
			nothingYet: 'Nothing waiting on a client.'
		});
	}

	const ages = waiting
		.map((row) => (row.sentAt ? daysOld(row.sentAt, input.now) : 0))
		.sort((a, b) => a - b);
	const youngest = ages[0];
	const oldest = ages[ages.length - 1];

	return {
		module: 'quoting',
		// A fact about days. The oldest one having sat a fortnight is worth a look; nothing here
		// is overdue, because a client is not late for an appointment nobody made.
		standing: oldest >= WORTH_A_NUDGE_DAYS ? 'attention' : 'clear',
		statement: `${waiting.length} ${waiting.length === 1 ? 'quote' : 'quotes'} waiting on clients`,
		explanation: agesSentence(youngest, oldest),
		href: '/quoting'
	};
}

/** "Sent 4 to 11 days ago. None chased yet." — and the singular cases, which are most of them. */
function agesSentence(youngest: number, oldest: number): string {
	if (oldest === 0) return 'Sent today. No answer yet.';
	if (youngest === oldest) {
		return `Sent ${oldest} ${oldest === 1 ? 'day' : 'days'} ago. None chased yet.`;
	}
	return `Sent ${youngest} to ${oldest} days ago. None chased yet.`;
}

function daysOld(at: Date, now: Date): number {
	// Whole days, not money: there is no rounding policy to respect, and half a day ago is
	// still "today" to the person reading it.
	// eslint-disable-next-line no-restricted-syntax -- not money, see above
	return Math.max(0, Math.floor((now.getTime() - at.getTime()) / 86_400_000));
}

/**
 * The draft to go back to — one card, never a list.
 *
 * "3 of 5 items priced" is the design's own context line, and `ResumeCard` requires one: a card
 * that says only "Draft" is a link with extra steps. So the progress is counted rather than
 * described, which means one small aggregate — and only for the ONE draft shown.
 */
async function mostRecentDraft(input: SummaryInput): Promise<readonly ResumeCard[]> {
	const [draft] = await input.tx
		.select({ id: quote.id, customerName: quote.customerName })
		.from(quote)
		.where(and(isNull(quote.archivedAt), eq(quote.status, 'draft')))
		.orderBy(desc(quote.updatedAt))
		.limit(1);

	if (!draft) return [];

	const [counts] = await input.tx
		.select({
			total: sql<number>`count(*)::int`,
			priced: sql<number>`count(*) filter (where ${quoteLine.unitPriceMicros} <> 0)::int`
		})
		.from(quoteLine)
		.where(and(eq(quoteLine.quoteId, draft.id), isNull(quoteLine.archivedAt)));

	return [
		{
			module: 'quoting',
			id: draft.id,
			title: draft.customerName ? `Quote for ${draft.customerName}` : 'A quote you started',
			context:
				counts.total === 0
					? 'Nothing on it yet'
					: `${counts.priced} of ${counts.total} ${counts.total === 1 ? 'item' : 'items'} priced`,
			href: `/quoting/${draft.id}`
		}
	];
}

/**
 * Quotes whose validity is running out, for Coming up.
 *
 * The DATE crosses as a `Date` and `compose.ts` formats it in the business's locale — a
 * contributor that formatted its own would be a second place for the product to disagree with
 * itself about what "8 Aug" looks like.
 */
async function expiringSoon(input: SummaryInput): Promise<readonly AgendaContribution[]> {
	const today = todayIn(input.now);

	const rows = await input.tx
		.select({
			id: quote.id,
			number: quote.numberFormatted,
			customerName: quote.customerName,
			validUntil: quote.validUntil
		})
		.from(quote)
		.where(and(isNull(quote.archivedAt), inArray(quote.status, ['sent', 'viewed'])))
		.orderBy(asc(quote.validUntil))
		.limit(20);

	return rows.flatMap((row) => {
		if (!row.validUntil) return [];
		const days = daysBetween(today, row.validUntil);
		// Already past, or too far off to be news. Coming up is the next few weeks, not a list
		// of everything with a date on it.
		if (days < 0 || days > 30) return [];

		return [
			{
				id: row.id,
				// Midday UTC, so the calendar day survives a timezone shift in either direction on
				// its way to being formatted. The DATE is the fact; the instant is transport.
				on: new Date(`${row.validUntil}T12:00:00Z`),
				title: `${row.number ?? 'A quote'} expires`,
				detail: row.customerName
			}
		];
	});
}
