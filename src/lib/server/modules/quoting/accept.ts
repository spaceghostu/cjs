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
 *
 * ACCEPTANCE IS THE CONVERSION POINT
 * ----------------------------------
 * "The client said yes" is the moment speculative work becomes real work, so it is the moment a
 * JOB comes into existence. `core_job` is floor rather than a module (see
 * `db/schema/jobs.ts`), which is what makes creating one here legitimate: this transaction
 * applies no entitlement gate at all, and it must not — the person on the other end of it is a
 * client with a link, not a subscriber.
 *
 * The job INSERT is admitted by the ordinary `tenant_isolation` policy, exactly as the
 * `quoting_quote_event` insert beside it already is. No `document_share` policy is involved and
 * none is wanted: the client never reads the job, and the four SELECT-only share policies in
 * `0006_quote_sharing.sql` are deliberately the whole of this database's public surface.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { effectiveStatus, hasExpired, todayIn, type Quote } from '$lib/core/quoting';
import { actAsSharedTenant, readShared } from '$lib/server/core/share';
import { quote } from '$lib/server/core/db/schema/quoting';
import { business as businessTable } from '$lib/server/core/db/schema/core';
import { issuerFrom, priceQuote, quoteDocument } from '$lib/core/quoting';
import type { PrintableDocument } from '$lib/core/document';
import { notFoundMessage } from '$lib/core/refusals';
import { toQuote } from '$lib/server/core/db/map';
import { quoteLine } from '$lib/server/core/db/schema/quoting';
import { createJob } from '$lib/server/core/jobs';
import type { Tx } from '$lib/server/core/db/tx';
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
		return { ok: false, message: notFoundMessage('quote') };
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
		const [updated] = await tx
			.update(quote)
			.set(
				answer === 'accepted'
					? { status: 'accepted', acceptedAt: now, acceptedByName: detail.name ?? null }
					: { status: 'declined', declinedAt: now, declineReason: detail.reason ?? null }
			)
			// The status predicate is not decoration: two people clicking Accept on the same
			// emailed link at the same moment must produce one acceptance, and this is what
			// makes the second one a no-op rather than a second event.
			.where(and(eq(quote.id, found.id), sql`${quote.status} in ('sent', 'viewed')`))
			.returning({ id: quote.id, jobId: quote.jobId, customerId: quote.customerId });

		// EVERY WRITE THAT FOLLOWS HANGS OFF THE ROW THE UPDATE RETURNED, and that is the whole
		// of what the comment above promises. The loser of a double click matched zero rows, so
		// `updated` is undefined and it writes nothing at all: no job, no burnt JOB number, and
		// no second `accepted` line on the timeline. Recording the event outside this guard
		// would leave the quote answered once and narrated twice, which is the same
		// contradiction the guard exists to prevent — only written into the history instead of
		// into the row.
		if (!updated) return;

		if (answer === 'accepted' && updated.jobId === null) {
			await createJobFor(tx, found.businessId, updated.id, updated.customerId);
		}

		await recordEvent(tx, found.businessId, found.id, {
			kind: answer,
			actor: 'client',
			detail: answer === 'accepted' ? (detail.name ?? null) : (detail.reason ?? null),
			occurredAt: now
		});
	});

	return { ok: true };
}

/**
 * THE JOB THIS ACCEPTANCE CREATES.
 *
 * Called ONLY from inside the guarded UPDATE's result, and only when the row that came back had
 * no job. That gating is the whole of the concurrency story: the pre-checks above run in a
 * SEPARATE transaction from the update, so two people clicking Accept on the same emailed link
 * both reach it and one of them matches zero rows — which is exactly what the comment on that
 * `.where()` already describes. Creating the job beside the update rather than from its result
 * would produce two jobs and burn two numbers for one acceptance.
 *
 * The second UPDATE, linking the quote to the job it just produced, is admitted: `0005_quoting`
 * and `0006_quote_sharing` define only `quoting_quote_touch` and `quoting_quote_audit` on this
 * table, so there is no freeze-style trigger to refuse a write to a row that has just become
 * `accepted`.
 *
 * THE DESCRIPTION IS SEEDED FROM THE QUOTE'S FIRST LINE, because a job created automatically has
 * nothing else in it — no service, no area, nobody's typing. "Kitchen units, supply and fit" is
 * what makes the row nameable on the pipeline screen SPA-23 will build. Service and area are
 * left null rather than guessed: `db/schema/inventory.ts` makes the case that a closed list is
 * wrong for the third trade on day one, and an invented one is worse than an empty one.
 */
async function createJobFor(
	tx: Tx,
	businessId: string,
	quoteId: string,
	customerId: string | null
): Promise<void> {
	if (customerId === null) {
		// Unreachable by construction, and thrown rather than asserted away with a `!`:
		// `quoting_quote_customer_required_once_sent` (db/schema/quoting.ts) guarantees that a
		// non-draft quote names a client, and the status gate above admits only `sent` and
		// `viewed`. If it ever fires, one of those two has changed and this is the sentence that
		// says which.
		throw new Error(
			`Quote ${quoteId} was accepted with no customer, which ` +
				`quoting_quote_customer_required_once_sent should have made impossible.`
		);
	}

	const [firstLine] = await tx
		.select({ description: quoteLine.description })
		.from(quoteLine)
		.where(and(eq(quoteLine.quoteId, quoteId), isNull(quoteLine.archivedAt)))
		.orderBy(quoteLine.position)
		.limit(1);

	const created = await createJob(tx, {
		// From a row the TOKEN admitted, never from a request — `share.ts` states the rule and
		// this is the caller it was written for.
		businessId,
		customerId,
		description: firstLine?.description ?? null,
		startedByUserId: null
	});

	await tx.update(quote).set({ jobId: created.id }).where(eq(quote.id, quoteId));
}
