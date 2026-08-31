/**
 * READING QUOTES.
 *
 * Every function here takes a `Tx` and no `businessId`. That is not an omission: the tables
 * are tenant tables, so `tenant_isolation` has already decided whose rows these are, and a
 * `where business_id = …` on top of it would be a second, weaker answer to a question the
 * database has answered. `entitlement.ts` says the same thing about subscription periods.
 *
 * Nothing here writes. `effects.ts` is the other half.
 */
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
	effectiveStatus,
	todayIn,
	type CalendarDate,
	type Quote,
	type QuoteStatus
} from '$lib/core/quoting';
import type { JobQuote } from '$lib/core/jobs';
import type { Money } from '$lib/core/money';
import { customer as customerTable } from '$lib/server/core/db/schema/core';
import { quote, quoteLine, quotingSetting } from '$lib/server/core/db/schema/quoting';
import { peekDocumentNumber } from '$lib/server/core/db/numbering';
import { toCustomer, toMoney, toQuote, toRate, type Customer } from '$lib/server/core/db/map';
import type { Tx } from '$lib/server/core/db/tx';
import type { Rate } from '$lib/core/money';

/**
 * The business's quoting defaults.
 *
 * A business that has never opened its quoting settings has no row, and that must not be an
 * error — the design's editor says "Your usual 14 days" to somebody who has never chosen a
 * number. So the absence has an answer, stated once here rather than defaulted at four call
 * sites.
 */
export type QuotingSettings = {
	readonly validityDays: number;
	/** Null when this business asks for no deposit. */
	readonly depositRate: Rate | null;
	readonly footerTerms: readonly string[] | null;
};

export const DEFAULT_SETTINGS: QuotingSettings = Object.freeze({
	validityDays: 14,
	depositRate: null,
	footerTerms: null
});

export async function loadSettings(tx: Tx): Promise<QuotingSettings> {
	const [row] = await tx.select().from(quotingSetting).limit(1);
	if (!row) return DEFAULT_SETTINGS;

	return {
		validityDays: row.validityDays,
		depositRate: row.depositRatePpm === null ? null : toRate(row.depositRatePpm),
		// Stored as one text column and printed as lines, because the footer is prose the
		// business wrote and a blank line in the middle of it is theirs to keep.
		footerTerms: row.footerTerms === null ? null : row.footerTerms.split('\n')
	};
}

/** The clients a quote can be addressed to. Archived customers are not offered. */
export async function loadCustomers(tx: Tx): Promise<Customer[]> {
	const rows = await tx
		.select()
		.from(customerTable)
		.where(isNull(customerTable.archivedAt))
		.orderBy(asc(customerTable.name));

	return rows.map(toCustomer);
}

/**
 * One quote, with its lines.
 *
 * Two queries rather than a join: a join would repeat every header column once per line, and
 * the header here is thirty-five columns wide. Both run inside the caller's transaction, so
 * they see the same instant.
 *
 * Archived lines are excluded. They are kept for the audit trail (nothing is ever deleted),
 * and they are not part of the document.
 */
export async function loadQuote(tx: Tx, quoteId: string): Promise<Quote | null> {
	const [header] = await tx.select().from(quote).where(eq(quote.id, quoteId)).limit(1);
	if (!header || header.archivedAt !== null) return null;

	const lines = await tx
		.select()
		.from(quoteLine)
		.where(and(eq(quoteLine.quoteId, quoteId), isNull(quoteLine.archivedAt)))
		.orderBy(asc(quoteLine.position), asc(quoteLine.createdAt));

	return toQuote(header, lines);
}

/**
 * The raw lines, for the paths that copy a quote rather than render it.
 *
 * Rows rather than the domain type, because turning a quote into an invoice copies COLUMNS —
 * exact integers, straight across — and going through `Quantity`/`UnitPrice` and back would be a
 * round trip through two constructors for no gain.
 */
export async function loadQuoteLineRows(tx: Tx, quoteId: string) {
	return tx
		.select()
		.from(quoteLine)
		.where(and(eq(quoteLine.quoteId, quoteId), isNull(quoteLine.archivedAt)))
		.orderBy(asc(quoteLine.position), asc(quoteLine.createdAt));
}

/** The raw header, for the paths that need the columns the domain type does not carry. */
export async function loadQuoteRow(tx: Tx, quoteId: string) {
	const [row] = await tx.select().from(quote).where(eq(quote.id, quoteId)).limit(1);
	return row ?? null;
}

/**
 * A row in the quotes list.
 *
 * Not a `Quote`: the list shows one line per quote and never its lines, and loading every
 * line of every quote to render a total nobody asked for is the N+1 the review checklist
 * names. The total comes from the SNAPSHOT for a sent quote, and is null for a draft — a
 * draft's total is only knowable by pricing it, and the list is not the place to do that
 * fifty times.
 */
export type QuoteListItem = {
	readonly id: string;
	readonly number: string | null;
	readonly status: QuoteStatus;
	readonly customerName: string | null;
	readonly validUntil: CalendarDate | null;
	readonly total: Money | null;
	readonly updatedAt: Date;
	readonly sentAt: Date | null;
};

export async function listQuotes(
	tx: Tx,
	options: { statuses?: readonly QuoteStatus[]; now?: Date; limit?: number } = {}
): Promise<QuoteListItem[]> {
	const { statuses, now = new Date(), limit = 100 } = options;
	const today = todayIn(now);

	const rows = await tx
		.select({
			id: quote.id,
			number: quote.numberFormatted,
			status: quote.status,
			customerName: quote.customerName,
			validUntil: quote.validUntil,
			totalCents: quote.snapshotTotalCents,
			currency: quote.currency,
			updatedAt: quote.updatedAt,
			sentAt: quote.sentAt
		})
		.from(quote)
		.where(
			statuses && statuses.length > 0
				? and(isNull(quote.archivedAt), inArray(quote.status, [...statuses]))
				: isNull(quote.archivedAt)
		)
		.orderBy(desc(quote.updatedAt))
		.limit(limit);

	return rows.map((row) => ({
		id: row.id,
		number: row.number,
		// Derived, not read. A quote whose valid-until passed at midnight is expired whether
		// or not anything has swept — see `effectiveStatus`.
		status: effectiveStatus(row.status as QuoteStatus, row.validUntil, today),
		customerName: row.customerName,
		validUntil: row.validUntil,
		total: row.totalCents === null ? null : toMoney(row.totalCents, row.currency),
		updatedAt: row.updatedAt,
		sentAt: row.sentAt
	}));
}

/**
 * WHAT A JOB HAS BEEN QUOTED.
 *
 * A projection, not a `Quote`, and the reason is the one this file already gives about the list:
 * the jobs derivation needs a status and a date and nothing else, and loading whole priced
 * documents to answer "has anything been accepted?" is the N+1 the review checklist names.
 *
 * `validUntil` is NOT optional. `$lib/core/jobs/commercial.ts` folds every quote through
 * `effectiveStatus` before it looks at anything, because expiry is reached by the calendar with
 * nothing running — and a projection without the date would report a lapsed quote as "Quote
 * sent" on a job screen while the quotes list showed it as expired.
 *
 * Exported through `public.ts`, because the caller is outside Quoting.
 */
export async function quotesForJob(tx: Tx, jobId: string): Promise<readonly JobQuote[]> {
	const rows = await tx
		.select({ status: quote.status, validUntil: quote.validUntil })
		.from(quote)
		.where(and(isNull(quote.archivedAt), eq(quote.jobId, jobId)))
		.orderBy(desc(quote.updatedAt));

	return rows.map((row) => ({ status: row.status as QuoteStatus, validUntil: row.validUntil }));
}

/**
 * The number this quote WILL get.
 *
 * Provisional by construction — `peekDocumentNumber` reads the counter without taking it, so
 * two people drafting at once are both shown `QT-1043` and exactly one of them gets it. The
 * editor labels it as provisional for that reason. Reserving on open would burn a number
 * every time somebody clicked New and changed their mind.
 */
export async function provisionalNumber(tx: Tx): Promise<string> {
	return (await peekDocumentNumber(tx, 'quote')).formatted;
}
