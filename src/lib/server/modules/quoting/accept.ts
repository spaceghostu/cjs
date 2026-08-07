/**
 * THE CLIENT'S SIDE.
 *
 * Reading a shared quote, and answering it. The only code in this product that runs for a
 * person with no account, and the security is the work here rather than a wrapper around it.
 *
 * HOW A REQUEST WITH NO IDENTITY IS BOUNDED
 * -----------------------------------------
 * `readShared` sets `cjs.share_token` and nothing else — no business id, no user. The
 * `document_share` policies in `0006_quote_sharing.sql` then admit exactly four things: the one
 * quote whose token hash matches, its lines, its customer and its business. Everything else in
 * the database evaluates `business_id = NULL` and returns nothing.
 *
 * So "this page exposes exactly one document and no other tenant data" is a property of the
 * database, not of the care taken in this file. `quote-sharing.test.ts` attempts the traversal
 * and gets zero rows.
 *
 * ANSWERING IS A WRITE, and writes still go through `tenant_isolation`. The token resolves the
 * tenant; the update then runs as that tenant, scoped to one quote id, with no user attached —
 * which is the honest attribution, because there is no user.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { effectiveStatus, hasExpired, todayIn, type Quote } from '$lib/core/quoting';
import { actAsSharedTenant, readShared } from '$lib/server/core/share';
import { quote } from '$lib/server/core/db/schema/quoting';
import { business as businessTable } from '$lib/server/core/db/schema/core';
import { issuerFrom, priceQuote, quoteDocument } from '$lib/core/quoting';
import type { PrintableDocument } from '$lib/core/document';
import { toQuote } from '$lib/server/core/db/map';
import { quoteLine } from '$lib/server/core/db/schema/quoting';
import { recordEvent } from './events';
import { hashShareToken } from './send';
import { loadSettings } from './queries';

/** What the public page needs, and nothing else that belongs to the tenant. */
export type SharedQuote = {
	readonly quoteId: string;
	readonly businessId: string;
	readonly document: PrintableDocument;
	/** Derived, so a quote is never acceptable after the date printed on it. */
	readonly status: Quote['status'];
	readonly canAnswer: boolean;
	readonly acceptedByName: string | null;
	readonly tradingName: string;
};

/**
 * Open a shared quote.
 *
 * Records a `viewed` event and moves `sent` -> `viewed` on first open. That transition is what
 * the design's "Opened it twice" copy is counting, and it is deliberately a side effect of
 * READING: a client does not press anything to open an email link, so there is no other moment
 * to observe.
 *
 * The view is recorded as the tenant, in its own short transaction, AFTER the document has been
 * read through the token. A failure to record a view must never stop a client seeing their
 * quote.
 */
export async function openSharedQuote(
	token: string,
	now: Date = new Date()
): Promise<SharedQuote | null> {
	const hash = hashShareToken(token);

	const found = await readShared(hash, async (tx) => {
		const [header] = await tx.select().from(quote).where(eq(quote.shareTokenHash, hash)).limit(1);
		if (!header || header.archivedAt !== null) return null;

		const lines = await tx
			.select()
			.from(quoteLine)
			.where(and(eq(quoteLine.quoteId, header.id), isNull(quoteLine.archivedAt)))
			.orderBy(quoteLine.position);

		// One row, and only because the policy above admits exactly one.
		const [businessRow] = await tx.select().from(businessTable);
		const settings = await loadSettings(tx).catch(() => null);

		const model = toQuote(header, lines);
		const price = priceQuote(model);

		return {
			header,
			businessRow,
			document: quoteDocument({
				quote: model,
				price,
				issuer: issuerFrom(businessRow),
				footer: settings?.footerTerms ?? undefined
			})
		};
	});

	if (!found) return null;

	const today = todayIn(now);
	const status = effectiveStatus(
		found.header.status as Quote['status'],
		found.header.validUntil,
		today
	);

	await recordView(found.header.businessId, found.header.id, found.header.status, now);

	return {
		quoteId: found.header.id,
		businessId: found.header.businessId,
		document: found.document,
		status,
		// An expired quote is VIEWABLE and not acceptable — the client should still be able to
		// read what they were offered, and phone up about it.
		canAnswer: status === 'sent' || status === 'viewed',
		acceptedByName: found.header.acceptedByName,
		tradingName: found.businessRow.tradingName
	};
}

/**
 * The view, recorded as the tenant.
 *
 * Swallows its own failures on purpose, and this is the one place in this codebase where that
 * is right: the caller has already produced the document the client asked for, and a page that
 * 500s because a counter could not be incremented would be the tracking breaking the thing it
 * is tracking.
 */
async function recordView(
	businessId: string,
	quoteId: string,
	storedStatus: string,
	now: Date
): Promise<void> {
	try {
		await actAsSharedTenant(businessId, async (tx) => {
			await tx
				.update(quote)
				.set({
					// `sent` -> `viewed`, once. An answered quote keeps its answer: somebody
					// re-reading a quote they accepted has not un-accepted it.
					status: storedStatus === 'sent' ? 'viewed' : storedStatus,
					firstViewedAt: sql`coalesce(${quote.firstViewedAt}, ${now})`,
					lastViewedAt: now,
					viewCount: sql`${quote.viewCount} + 1`
				})
				.where(eq(quote.id, quoteId));

			await recordEvent(tx, businessId, quoteId, {
				kind: 'viewed',
				actor: 'client',
				occurredAt: now
			});
		});
	} catch {
		// Deliberately silent. See the note above.
	}
}

export type AnswerResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * Accept or decline.
 *
 * The token is re-resolved rather than trusted from the page that rendered: the page and the
 * answer are separate requests, and anything carried between them by the browser is a claim.
 *
 * Expiry is checked HERE as well as on the page. "An expired quote is viewable but not
 * acceptable" has to be true of the action, not only of the button — a form posted from a tab
 * left open overnight is exactly the case.
 */
export async function answerSharedQuote(
	token: string,
	answer: 'accepted' | 'declined',
	detail: { name?: string | null; reason?: string | null } = {},
	now: Date = new Date()
): Promise<AnswerResult> {
	const hash = hashShareToken(token);

	const found = await readShared(hash, async (tx) => {
		const [header] = await tx.select().from(quote).where(eq(quote.shareTokenHash, hash)).limit(1);
		return header ?? null;
	});

	if (!found || found.archivedAt !== null) {
		return { ok: false, message: "We couldn't find that quote." };
	}

	if (hasExpired(found.validUntil, todayIn(now))) {
		return {
			ok: false,
			message:
				'This quote has passed its valid-until date, so it can no longer be accepted. ' +
				'Get in touch and they can send you a new one.'
		};
	}

	if (found.status !== 'sent' && found.status !== 'viewed') {
		return {
			ok: false,
			message:
				found.status === 'accepted'
					? 'This quote has already been accepted.'
					: 'This quote has already been answered.'
		};
	}

	await actAsSharedTenant(found.businessId, async (tx) => {
		await tx
			.update(quote)
			.set(
				answer === 'accepted'
					? { status: 'accepted', acceptedAt: now, acceptedByName: detail.name ?? null }
					: { status: 'declined', declinedAt: now, declineReason: detail.reason ?? null }
			)
			// The status predicate is not decoration: two people clicking Accept on the same
			// emailed link at the same moment must produce one acceptance, and this is what
			// makes the second one a no-op rather than a second event.
			.where(and(eq(quote.id, found.id), sql`${quote.status} in ('sent', 'viewed')`));

		await recordEvent(tx, found.businessId, found.id, {
			kind: answer,
			actor: 'client',
			detail: answer === 'accepted' ? (detail.name ?? null) : (detail.reason ?? null),
			occurredAt: now
		});
	});

	return { ok: true };
}
