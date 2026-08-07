/**
 * WHAT HAPPENED TO AN INVOICE.
 *
 * One writer, so every transition is recorded the same way and none is recorded twice. The
 * events feed T21's timeline:
 *
 *   Opened by Baraka Café · Twice · last 26 Jul, 08:41
 *   Emailed to accounts@barakacafe.co.za · 18 Jul, 09:12
 *   Created from quote QT-1036 · 18 Jul, 09:04 · by you
 *
 * There is no update and no delete here, and none anywhere else either: the application role
 * holds no DELETE, and nothing in this module writes to `invoicing_invoice_event` except the
 * function below.
 *
 * THE "by you" IN THE DESIGN comes from `actor_user_id`. It is the audit actor `ctx.ts` puts on
 * the session, compared against whoever is reading the screen — so the same event reads "by you"
 * to the person who did it and "by Alice" to their colleague, which is the only version of that
 * line that is true for both of them.
 */
import { asc, eq } from 'drizzle-orm';
import type { InvoiceEvent, InvoiceEventActor, InvoiceEventKind } from '$lib/core/invoicing';
import { invoiceEvent } from '$lib/server/core/db/schema/invoicing';
import type { Tx } from '$lib/server/core/db/tx';

export type InvoiceEventInput = {
	readonly kind: InvoiceEventKind;
	readonly actor: InvoiceEventActor;
	/** The member who acted, when there was one. A client has no account and never will. */
	readonly actorUserId?: string | null;
	readonly detail?: string | null;
	readonly occurredAt?: Date;
};

export async function recordEvent(
	tx: Tx,
	businessId: string,
	invoiceId: string,
	event: InvoiceEventInput
): Promise<void> {
	await tx.insert(invoiceEvent).values({
		businessId,
		invoiceId,
		kind: event.kind,
		actor: event.actor,
		actorUserId: event.actorUserId ?? null,
		detail: event.detail ?? null,
		occurredAt: event.occurredAt ?? new Date()
	});
}

/** The timeline for one invoice, oldest first — the order a story is told in. */
export async function loadEvents(tx: Tx, invoiceId: string): Promise<InvoiceEvent[]> {
	const rows = await tx
		.select()
		.from(invoiceEvent)
		.where(eq(invoiceEvent.invoiceId, invoiceId))
		.orderBy(asc(invoiceEvent.occurredAt));

	return rows.map((row) => ({
		id: row.id,
		kind: row.kind as InvoiceEventKind,
		actor: row.actor as InvoiceEventActor,
		actorUserId: row.actorUserId,
		detail: row.detail,
		occurredAt: row.occurredAt
	}));
}
