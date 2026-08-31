/**
 * THE WORDS ON THE INVOICING SCREENS.
 *
 * T20's rule for this module, quoted from the design:
 *
 *   > Money is neutral; colour only flags the exception. "Overdue: none" is stated rather than
 *   > hidden.
 *
 * Both halves are decided here. Every string a person reads about an invoice's state comes out
 * of one of these functions, which means three things that are otherwise very hard to keep true:
 *
 *  1. THE COPY IS RELATIVE AND HUMAN. "Due in 3 days", not `DUE_SOON`. The design's own status
 *     column reads that way, and an enum name leaking onto a screen is the single most common
 *     way a product stops sounding like it was written by a person.
 *
 *  2. IT IS COMPUTED AT RENDER TIME, FROM DATES. Nothing here is stored, so nothing here can go
 *     stale overnight — the same reason `overdue` is derived in `status.ts`.
 *
 *  3. IT IS TESTABLE. These are pure functions over a date and a count, so "reads like a person
 *     wrote it" is asserted in `invoicing.test.ts` rather than reviewed by eye once.
 *
 * A NOTE ON TONE. `sent` and `viewed` are NOT warnings — an invoice waiting on a client inside
 * its terms is the normal life of an invoice, and colouring it amber would make an ordinary
 * Tuesday look like a problem. Only lateness earns `wrong`, and only the last few days before a
 * due date earn `attention`.
 */
import {
	daysBetween,
	formatShortDate,
	formatWeekdayDate,
	type CalendarDate
} from '$lib/core/calendar';
import type { InvoiceFilter } from './filter';
import type { InvoiceStatus } from './types';

/**
 * How close a due date has to be before the screen mentions it instead of the send state.
 *
 * A week. Inside it, "Due in 3 days" is the useful fact and "Sent" is noise; outside it, the
 * client has plenty of time and the interesting fact is whether they have opened it.
 */
export const DUE_SOON_DAYS = 7;

/** The badge tones T02 offers. `draft` is the quietest filled surface, not a colour. */
export type Tone = 'draft' | 'sent' | 'settled' | 'attention' | 'wrong';

export type StatusCopy = {
	readonly text: string;
	readonly tone: Tone;
};

/** What the status column knows about one invoice. Dates and facts — never a pre-made string. */
export type StatusFacts = {
	readonly status: InvoiceStatus;
	readonly dueDate: CalendarDate | null;
	/** The day it was settled, for "Paid 24 Jul". */
	readonly paidOn: CalendarDate | null;
	/** A draft with nothing priced on it yet. Drives "Draft · needs an amount". */
	readonly hasAmount: boolean;
};

/**
 * The status column, in the words the design uses.
 *
 * The ORDER of the branches is the editorial decision. A near due date outranks "Sent", because
 * by then when it is due is what somebody is looking for; a far-off one loses to it, because
 * "Due in 26 days" tells nobody anything they wanted to know.
 */
export function statusCopy(facts: StatusFacts, today: CalendarDate): StatusCopy {
	switch (facts.status) {
		case 'draft':
			// The design's own wording. A draft with no priced line is not a document yet, and
			// saying so is more use than a badge that says `Draft` twice.
			return {
				text: facts.hasAmount ? 'Draft' : 'Draft · needs an amount',
				tone: 'draft'
			};

		case 'cancelled':
			return { text: 'Cancelled', tone: 'draft' };

		case 'paid':
			return {
				text: facts.paidOn ? `Paid ${formatShortDate(facts.paidOn)}` : 'Paid',
				tone: 'settled'
			};

		case 'overdue':
			return { text: overdueText(facts.dueDate, today), tone: 'wrong' };

		case 'sent':
		case 'viewed': {
			const days = facts.dueDate === null ? null : daysBetween(today, facts.dueDate);

			if (days !== null && days <= DUE_SOON_DAYS) {
				return { text: dueText(days), tone: days <= 2 ? 'attention' : 'sent' };
			}

			// Far enough from the due date that the useful fact is whether they have read it.
			return { text: facts.status === 'viewed' ? 'Viewed by client' : 'Sent', tone: 'sent' };
		}
	}
}

/** "Due today", "Due tomorrow", "Due in 3 days". */
function dueText(days: number): string {
	if (days <= 0) return 'Due today';
	if (days === 1) return 'Due tomorrow';
	return `Due in ${days} days`;
}

/**
 * "Overdue by 3 days".
 *
 * The number of days, not just the word: an invoice one day late and one three months late are
 * the same badge otherwise, and they are not remotely the same situation.
 */
function overdueText(dueDate: CalendarDate | null, today: CalendarDate): string {
	if (dueDate === null) return 'Overdue';
	const late = daysBetween(dueDate, today);
	if (late === 1) return 'Overdue by a day';
	return `Overdue by ${late} days`;
}

/**
 * THE OVERDUE STAT, IN WORDS AT ZERO.
 *
 * "Overdue" renders the word `None` — not `R0`. The design is explicit that a zero count is a
 * reassurance rather than something to hide, and R0,00 in a money column reads as a number
 * somebody should look into. When there IS overdue money it becomes an amount, and that is the
 * one place on this screen colour is spent.
 */
export function overdueIsNone(overdueCount: number): boolean {
	return overdueCount === 0;
}

/** What the invoices screen says about itself, before anybody scrolls. */
export type SummaryFacts = {
	readonly unpaidCount: number;
	readonly overdueCount: number;
	/** The soonest due date among unpaid invoices, and how many share it. */
	readonly nextDue: { readonly on: CalendarDate; readonly count: number } | null;
};

/**
 * "6 unpaid, none overdue. One is due on Monday."
 *
 * The screen's whole summary, in one sentence a person would actually say. Generated rather than
 * templated into awkwardness: every branch below exists because some real state of the data made
 * the previous wording read badly — one invoice, no invoices, nothing due, two things due on the
 * same day, a due date far enough off that its weekday means nothing.
 *
 * Nothing here manufactures urgency. "None overdue" is stated as the good news it is, and the
 * sentence never tells anybody what they ought to do about anything.
 */
export function summarySentence(facts: SummaryFacts, today: CalendarDate): string {
	if (facts.unpaidCount === 0) {
		return facts.overdueCount === 0
			? 'Nothing unpaid. Everything you have sent has been settled.'
			: `${capitalise(countWord(facts.overdueCount))} ${facts.overdueCount === 1 ? 'invoice is' : 'invoices are'} overdue.`;
	}

	const overdue =
		facts.overdueCount === 0 ? 'none overdue' : `${countWord(facts.overdueCount)} overdue`;

	const state = `${facts.unpaidCount} unpaid, ${overdue}.`;
	const next = nextDueSentence(facts.nextDue, today);

	return next ? `${state} ${next}` : state;
}

/** "One is due on Monday." — or nothing at all, when nothing has a date worth naming. */
function nextDueSentence(nextDue: SummaryFacts['nextDue'], today: CalendarDate): string | null {
	if (!nextDue) return null;

	const days = daysBetween(today, nextDue.on);
	// Already late. The overdue count has said so; saying it twice in one sentence is nagging.
	if (days < 0) return null;

	const subject = nextDue.count === 1 ? 'One is' : `${capitalise(countWord(nextDue.count))} are`;

	if (days === 0) return `${subject} due today.`;
	if (days === 1) return `${subject} due tomorrow.`;
	// Inside the week a weekday is how somebody holds a date; beyond it, the day itself is.
	if (days <= DUE_SOON_DAYS) return `${subject} due on ${weekdayOnly(nextDue.on)}.`;
	return `${subject} due on ${formatShortDate(nextDue.on)}.`;
}

/** "Monday" — `formatWeekdayDate` gives "Monday, 1 August", and the sentence only wants the day. */
function weekdayOnly(date: CalendarDate): string {
	return formatWeekdayDate(date).split(',')[0];
}

/**
 * Small numbers in words, as somebody would say them. Above ten the numeral reads better.
 *
 * The same rule Home applies in `standingCopy`, kept as its own list rather than imported: Home
 * is a platform screen and this is a module, and a shared word list is the kind of coupling that
 * looks harmless until one of the two needs "a couple".
 */
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function countWord(n: number): string {
	return WORDS[n] ?? String(n);
}

function capitalise(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * "Sent 18 July. Due Monday, 1 August. They opened it twice." — the detail screen's second line.
 *
 * Three facts, each dropped when it is not true rather than rendered empty: an invoice nobody
 * has opened says nothing about opens, and a draft has no send date to state.
 */
export function detailSentence(input: {
	readonly issueDate: CalendarDate | null;
	readonly dueDate: CalendarDate | null;
	readonly viewCount: number;
	readonly today: CalendarDate;
}): string {
	const parts: string[] = [];

	if (input.issueDate) parts.push(`Sent ${formatShortDate(input.issueDate)}.`);

	if (input.dueDate) {
		const days = daysBetween(input.today, input.dueDate);
		if (days < 0) parts.push(`Was due ${formatShortDate(input.dueDate)}.`);
		else if (days === 0) parts.push('Due today.');
		else if (days <= DUE_SOON_DAYS) parts.push(`Due ${formatWeekdayDate(input.dueDate)}.`);
		else parts.push(`Due ${formatShortDate(input.dueDate)}.`);
	}

	// "Twice", not "two times" — `openCountPhrase` is the same wording the timeline uses, so the
	// header and the event line cannot describe the same two opens differently.
	if (input.viewCount > 0) {
		parts.push(`They opened it ${openCountPhrase(input.viewCount).toLowerCase()}.`);
	}

	return parts.join(' ');
}

/**
 * "Opened by Baraka Café · Twice · last 26 Jul, 08:41" — the timeline's open line.
 *
 * One line about N events rather than N lines, because a client who opened an invoice five times
 * did one thing five times and a timeline that says so five times has buried everything else.
 */
export function openCountPhrase(count: number): string {
	if (count <= 1) return 'Once';
	if (count === 2) return 'Twice';
	return `${capitalise(countWord(count))} times`;
}

/**
 * THE TWO EMPTY STATES, WHICH ARE NOT THE SAME STATE.
 *
 * The same distinction inventory's `emptyCopy` draws, and it belongs here for the same reason:
 * SPA-13 shares the SURFACE across the modules and leaves each module's WORDS with the module.
 * A business with no invoices at all needs a way out of that — start one, and here is what will
 * happen when you do. A business with forty invoices and an "Overdue" tab showing none needs
 * nothing offered at all; it has just been told good news, and a "New invoice" button under it
 * would be the interface misreading that as a lack.
 *
 * The screen branches on the COUNTS to tell them apart, never on the visible rows and never on
 * which tab is showing — `InvoiceList` did the latter until SPA-13, which got it wrong in both
 * directions at once. *
 * THE `'all'` STRING IS THE BODY OF A PANEL THAT ALREADY HAS A HEADING, and it is written to sit
 * UNDER one rather than to open with the same words. `EmptyState` renders "Nothing invoiced yet" above it, and a
 * body that began by repeating that would be the interface saying the same thing twice to fill a
 * slot — the thing `$lib/components/state/ErrorState.svelte` states as a rule for the layer
 * these panels belong to. The other branches are `NoMatches` messages, which have no heading
 * above them and therefore have to carry their own subject.
 */
export function emptyCopy(filter: InvoiceFilter): string {
	if (filter === 'all') {
		return 'Start one and it will save as you go — you can close it and come back.';
	}
	return 'Nothing here. That is usually good news.';
}
