/**
 * ONE INVOICE, IN THE TWO STATES IT CAN BE IN.
 *
 *   DRAFT  — the editor. Autosave, a live client-facing preview, and nothing has gone anywhere.
 *   ISSUED — "the document, then the story of it." Read-only, because the client holds a PDF.
 *
 * One route rather than two, because it is one document and one URL. A bookmark taken while an
 * invoice was a draft has to keep working the day after it is issued.
 *
 * WRITE, NOT READ. A business that has REMOVED Invoicing gets `entitlement.ts`'s refusal rather
 * than a screen that will fail on its first action. Their invoices stay readable on the list;
 * this is the screen that changes one.
 *
 * ONE CLOCK READING, for the same reason as the list: the status badge, the due sentence and the
 * reversal windows all have to describe the same instant.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { issuerFrom } from '$lib/core/quoting';
import { todayIn } from '$lib/core/calendar';
import { parseMoneyInput } from '$lib/core/money';
import {
	canReverse,
	effectiveInvoiceStatus,
	invoiceDocument,
	priceInvoice,
	settle,
	PAYMENT_METHODS,
	type PaymentMethod
} from '$lib/core/invoicing';
import { withModule } from '$lib/server/core/ctx';
import { business as businessTable, member as memberTable } from '$lib/server/core/db/schema/core';
import { user as userTable } from '$lib/server/core/db/schema/identity';
import { modulePrice, totalWith } from '$lib/server/core/modules/catalogue';
import {
	CannotDoThat,
	archiveDraft,
	cancelInvoice,
	duplicateInvoice,
	recordPayment,
	reversePayment
} from '$lib/server/modules/invoicing/effects';
import { loadEvents } from '$lib/server/modules/invoicing/events';
import { costsCameFromInventory, marginFor } from '$lib/server/modules/invoicing/margin';
import {
	loadCustomers,
	loadInvoice,
	loadPayments,
	loadSettings,
	provisionalNumber
} from '$lib/server/modules/invoicing/queries';
import { CannotIssueInvoice, issueInvoice, sendReminder } from '$lib/server/modules/invoicing/send';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	return withModule(event, 'invoicing', 'write', async (ctx) => {
		const invoice = await loadInvoice(ctx.tx, event.params.id);

		// RLS has already made "another business's invoice" and "no such invoice" the same answer,
		// which is exactly what they should be to somebody guessing at URLs.
		if (!invoice) error(404, { message: "We couldn't find that invoice." });

		const [businessRow] = await ctx.tx
			.select()
			.from(businessTable)
			.where(eq(businessTable.businessId, ctx.business.id));

		const issuer = issuerFrom(businessRow);
		const settings = await loadSettings(ctx.tx);
		const now = new Date();
		const today = todayIn(now);

		if (invoice.status === 'draft') {
			const customers = await loadCustomers(ctx.tx);

			return {
				mode: 'draft' as const,
				today,
				invoice,
				issuer,
				customers: customers.map((c) => ({ id: c.id, name: c.name })),
				usualDays: settings.paymentTermsDays,
				bankingDetails: settings.bankingDetails,
				footer: settings.footerTerms,
				// Provisional, and labelled as such: `peekDocumentNumber` reads the counter without
				// taking it, so two people drafting at once are shown the same one and exactly one of
				// them gets it. On an invoice sequence a burnt number is something an accountant
				// will eventually ask about.
				provisionalNumber: await provisionalNumber(ctx.tx),
				inventoryAccess: ctx.access.inventory
			};
		}

		// The issued view. It renders the document the client actually has, which is why it is
		// built from the SAME projection the PDF and the client's own page use.
		const price = priceInvoice(invoice);
		const [payments, events, margin, fromInventory] = await Promise.all([
			loadPayments(ctx.tx, invoice.id),
			loadEvents(ctx.tx, invoice.id),
			marginFor(ctx.tx, invoice.id, ctx.business.currency, ctx.access.inventory === 'write'),
			costsCameFromInventory(ctx.tx, invoice.id)
		]);

		const settlement = settle(price.total, payments);

		/**
		 * The names behind "by you".
		 *
		 * Only the members who actually appear in this timeline, so a business with forty staff
		 * does not load forty rows to render three events.
		 */
		const actorIds = [...new Set(events.flatMap((e) => (e.actorUserId ? [e.actorUserId] : [])))];
		const memberNames = actorIds.length
			? Object.fromEntries(
					(
						await ctx.tx
							.select({ id: userTable.id, name: userTable.name })
							.from(memberTable)
							.innerJoin(userTable, eq(userTable.id, memberTable.userId))
					)
						.filter((row) => actorIds.includes(row.id))
						.map((row) => [row.id, row.name])
				)
			: {};

		return {
			mode: 'issued' as const,
			today,
			invoice,
			status: effectiveInvoiceStatus(invoice.status, invoice.dueDate, today),
			document: invoiceDocument({
				invoice,
				price,
				issuer,
				bankingDetails: settings.bankingDetails,
				footer: settings.footerTerms
			}),
			total: price.total,
			paid: settlement.paid,
			outstanding: settlement.outstanding,
			settled: settlement.settled,
			// Each payment carries whether it can still be undone, decided on the server against
			// the server's clock — so the button is absent rather than present-and-refused.
			payments: payments.map((p) => ({
				id: p.id,
				kind: p.kind,
				amount: p.amount,
				method: p.method,
				reference: p.reference,
				receivedOn: p.receivedOn,
				recordedAt: p.recordedAt,
				reversible: canReverse(
					p,
					payments.some((r) => r.reversesPaymentId === p.id),
					now
				).can
			})),
			events,
			memberNames,
			viewerUserId: ctx.userId,
			margin,
			fromInventory,
			/** The offer, and the escape hatch, from T13 — the same shape the quote screen uses. */
			inventoryOwned: ctx.access.inventory === 'write',
			inventoryPrice: modulePrice('inventory'),
			newTotal: totalWith(ctx.access, 'inventory', 'write')
		};
	});
};

export const actions: Actions = {
	/**
	 * ISSUE IT.
	 *
	 * The whole of the work is in `issueInvoice`, in one transaction, with the email sent INSIDE
	 * it — so a mail failure rolls back the number, the snapshot, the token, the postings and the
	 * status. An invoice that could not be sent must not show as sent.
	 */
	issue: async (event) => {
		try {
			await withModule(event, 'invoicing', 'write', (ctx) =>
				issueInvoice(ctx.tx, ctx.business.id, ctx.userId, event.params.id, event.url.origin)
			);
		} catch (cause) {
			if (cause instanceof CannotIssueInvoice) return fail(422, { message: cause.message });

			return fail(502, {
				message:
					'We could not issue that invoice just now, so nothing was sent and it is still a ' +
					'draft. Try again in a moment.'
			});
		}

		// A redirect to itself, which now renders the issued view.
		redirect(303, `/invoicing/${event.params.id}`);
	},

	/**
	 * "Duplicate" — bill the same thing again.
	 *
	 * A new draft with this invoice's client, lines and pricing, and none of what belonged to the
	 * document itself. Redirects to the editor, because a duplicate nobody was taken to is a
	 * button that appears to do nothing.
	 */
	duplicate: async (event) => {
		let id: string;
		try {
			id = await withModule(event, 'invoicing', 'write', (ctx) =>
				duplicateInvoice(ctx.tx, ctx.business, event.params.id)
			);
		} catch (cause) {
			if (cause instanceof CannotDoThat) return fail(422, { message: cause.message });
			return fail(500, { message: 'We could not copy that invoice. Nothing was changed.' });
		}

		redirect(303, `/invoicing/${id}`);
	},

	/** Discard a draft. An archive — there is no delete anywhere in this database. */
	discard: async (event) => {
		await withModule(event, 'invoicing', 'write', (ctx) => archiveDraft(ctx.tx, event.params.id));
		redirect(303, '/invoicing');
	},

	recordPayment: async (event) => {
		const form = await event.request.formData();

		// Through `parseMoneyInput`, the sanctioned door for human-typed money. A field that said
		// "24 150,00" and a field that said "24150" mean the same thing to a person, and this is
		// the one place in the product that knows that.
		const parsed = parseMoneyInput(String(form.get('amount') ?? ''));
		if (!parsed.ok) return fail(422, { message: `That amount ${parsed.message}.` });

		const receivedOn = String(form.get('receivedOn') ?? '');
		const method = String(form.get('method') ?? 'eft');
		const reference = String(form.get('reference') ?? '').trim() || null;

		if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
			return fail(422, { message: "We don't recognise that payment method." });
		}

		try {
			await withModule(event, 'invoicing', 'write', (ctx) =>
				recordPayment(ctx.tx, ctx.business.id, ctx.userId, event.params.id, {
					amountCents: parsed.value.cents,
					receivedOn,
					method: method as PaymentMethod,
					reference
				})
			);
			return { recorded: true };
		} catch (cause) {
			if (cause instanceof CannotDoThat) return fail(422, { message: cause.message });
			return fail(500, {
				message: 'We could not record that payment. Nothing was recorded — try again.'
			});
		}
	},

	/** The undo the screen promised, within its window. Refused after, by the service AND the database. */
	reversePayment: async (event) => {
		const form = await event.request.formData();
		const paymentId = String(form.get('paymentId') ?? '');

		try {
			await withModule(event, 'invoicing', 'write', (ctx) =>
				reversePayment(ctx.tx, ctx.business.id, ctx.userId, event.params.id, paymentId)
			);
			return { reversed: true };
		} catch (cause) {
			if (cause instanceof CannotDoThat) return fail(422, { message: cause.message });
			return fail(500, { message: 'We could not undo that payment. Nothing changed — try again.' });
		}
	},

	remind: async (event) => {
		try {
			const result = await withModule(event, 'invoicing', 'write', (ctx) =>
				sendReminder(ctx.tx, ctx.business.id, ctx.userId, event.params.id, event.url.origin)
			);
			return { reminded: result.sentTo };
		} catch (cause) {
			if (cause instanceof CannotIssueInvoice) return fail(422, { message: cause.message });

			// The mail went inside the transaction, so a failure here means NOTHING was written —
			// no event claiming a reminder that never arrived. Said plainly, because the person is
			// about to try again.
			return fail(502, {
				message:
					'We could not send that reminder, so nothing went out and no reminder was recorded. ' +
					'Try again in a moment.'
			});
		}
	},

	/** One-way, and the screen said so before the button was pressed. */
	cancel: async (event) => {
		const form = await event.request.formData();
		const reason = String(form.get('reason') ?? '').trim() || null;

		try {
			await withModule(event, 'invoicing', 'write', (ctx) =>
				cancelInvoice(ctx.tx, ctx.business.id, ctx.userId, event.params.id, reason)
			);
			return { cancelled: true };
		} catch (cause) {
			if (cause instanceof CannotDoThat) return fail(422, { message: cause.message });
			return fail(500, { message: 'We could not cancel that invoice. Nothing changed.' });
		}
	}
};
