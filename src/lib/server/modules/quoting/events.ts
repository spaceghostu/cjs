/**
 * WHAT HAPPENED TO A QUOTE.
 *
 * One writer, so every transition is recorded the same way and none is recorded twice. T18:
 * "Each transition is an event with a timestamp." The events feed the activity timeline in T21
 * and the design's "Opened it twice" copy, and they are the answer to "when exactly did they
 * accept this" — a question with a right answer on a document somebody may have to defend.
 *
 * There is no update and no delete here, and none anywhere else either: the application role
 * holds no DELETE, and nothing in this module writes to `quoting_quote_event` except the
 * function below.
 */
import { asc, eq } from 'drizzle-orm';
import { quoteEvent } from '$lib/server/core/db/schema/quoting';
import type { Tx } from '$lib/server/core/db/tx';

export type QuoteEventKind = 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';
export type QuoteEventActor = 'business' | 'client' | 'system';

export type QuoteEventInput = {
	readonly kind: QuoteEventKind;
	readonly actor: QuoteEventActor;
	/** The member who acted, when there was one. A client has no account and never will. */
	readonly actorUserId?: string | null;
	readonly detail?: string | null;
	readonly occurredAt?: Date;
};

export async function recordEvent(
	tx: Tx,
	businessId: string,
	quoteId: string,
	event: QuoteEventInput
): Promise<void> {
	await tx.insert(quoteEvent).values({
		businessId,
		quoteId,
		kind: event.kind,
		actor: event.actor,
		actorUserId: event.actorUserId ?? null,
		detail: event.detail ?? null,
		occurredAt: event.occurredAt ?? new Date()
	});
}

export type QuoteEvent = {
	readonly id: string;
	readonly kind: QuoteEventKind;
	readonly actor: QuoteEventActor;
	readonly detail: string | null;
	readonly occurredAt: Date;
};

/** The timeline for one quote, oldest first — the order a story is told in. */
export async function loadEvents(tx: Tx, quoteId: string): Promise<QuoteEvent[]> {
	const rows = await tx
		.select()
		.from(quoteEvent)
		.where(eq(quoteEvent.quoteId, quoteId))
		.orderBy(asc(quoteEvent.occurredAt));

	return rows.map((row) => ({
		id: row.id,
		kind: row.kind as QuoteEventKind,
		actor: row.actor as QuoteEventActor,
		detail: row.detail,
		occurredAt: row.occurredAt
	}));
}
