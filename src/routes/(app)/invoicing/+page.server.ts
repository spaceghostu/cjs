/**
 * THE INVOICES SCREEN.
 *
 * A STATIC route that wins over `[module=module]` for `/invoicing`, which means it inherits that
 * route's responsibility as well as its path: the sidebar's promise is that a module row is a
 * real destination in all three access states, so this renders the locked and removed states
 * itself rather than 403-ing somebody who clicked a nav row on purpose. Same shape as
 * `/quoting`, for the same reason.
 *
 * `moduleAccess` for the question, `withModule` for the enforcement. The two live side by side in
 * `ctx.ts` for exactly this case.
 *
 * ONE CLOCK READING. `now` is taken once and passed to every query and to the page, so the tab
 * counts, the summary sentence, the derived `overdue` statuses and the badges all describe the
 * same instant. Separate `new Date()` calls inside one load can straddle midnight, and a list
 * that says "none overdue" above a row badged "Overdue by a day" is the worst possible way to
 * find that out.
 */
import { error, redirect } from '@sveltejs/kit';
import { moduleAccess, withBusiness, withModule } from '$lib/server/core/ctx';
import { moduleRow, modulePrice } from '$lib/server/core/modules/catalogue';
import { carryoverSummary, loadCarryover } from '$lib/server/core/modules/carryover';
import {
	defaultDirection,
	isInvoiceFilter,
	isInvoiceSort,
	isSortDirection,
	type InvoiceFilter,
	type InvoiceSort,
	type SortDirection
} from '$lib/core/invoicing';
import { todayIn } from '$lib/core/calendar';
import { priceInvoice, settle } from '$lib/core/invoicing';
import { zero } from '$lib/core/money';
import {
	DEFAULT_PAGE_SIZE,
	countInvoices,
	listInvoices,
	loadInvoice,
	loadPayments,
	summarise
} from '$lib/server/modules/invoicing/queries';
import { createDraft } from '$lib/server/modules/invoicing/effects';
import { sendReminder } from '$lib/server/modules/invoicing/send';
import { recordPayment } from '$lib/server/modules/invoicing/effects';
import { CannotDoThat } from '$lib/server/modules/invoicing/effects';
import { CannotIssueInvoice } from '$lib/server/modules/invoicing/send';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/** `?filter=` and `?page=`, both from the URL so a filtered page can be bookmarked and shared. */
function readFilter(url: URL): InvoiceFilter {
	const value = url.searchParams.get('filter');
	return isInvoiceFilter(value) ? value : 'all';
}

function readPage(url: URL): number {
	const value = Number(url.searchParams.get('page') ?? '1');
	return Number.isInteger(value) && value > 0 ? value : 1;
}

/**
 * `?sort=` and `?dir=`, narrowed. Anything unrecognised falls back to the default rather than
 * erroring: a stale or hand-edited URL should show the list, not a stack trace.
 *
 * The default is the soonest-due first, ascending — which is the order somebody opening this
 * screen is looking for, and the order the design's own table is drawn in.
 */
function readSort(url: URL): { sort: InvoiceSort; direction: SortDirection } {
	const value = url.searchParams.get('sort');
	const sort: InvoiceSort = isInvoiceSort(value) ? value : 'due';

	const dir = url.searchParams.get('dir');
	return {
		sort,
		direction: isSortDirection(dir) ? dir : sort === 'due' ? 'asc' : defaultDirection(sort)
	};
}

export const load: PageServerLoad = async (event) => {
	const access = moduleAccess(event, 'invoicing');
	const row = moduleRow('invoicing');
	const now = new Date();
	const today = todayIn(now);

	if (access === 'none') {
		// The locked state names what this business would actually get, which costs one small
		// query — and only here. An owned module never asks.
		const carryover = await withBusiness(event, async (ctx) =>
			carryoverSummary(await loadCarryover(ctx.tx, ctx.business, ctx.access))
		);

		return {
			access,
			module: { key: row.key, label: row.label, description: row.description, accent: row.accent },
			price: modulePrice('invoicing'),
			carryover,
			today,
			filter: 'all' as InvoiceFilter,
			invoices: [],
			counts: { all: 0, unpaid: 0, overdue: 0, paid: 0, drafts: 0 },
			summary: { unpaidCount: 0, overdueCount: 0, nextDue: null },
			owed: zero('ZAR'),
			dueThisWeek: zero('ZAR'),
			overdue: zero('ZAR'),
			page: 1,
			pageCount: 1,
			sort: 'due' as InvoiceSort,
			direction: 'asc' as SortDirection
		};
	}

	const filter = readFilter(event.url);
	const page = readPage(event.url);
	const { sort, direction } = readSort(event.url);

	// `read` reaches here too, and that is the point of the middle access state: a removed
	// module's invoices stay readable and exportable. The screen renders them without the
	// affordances that would write.
	return withModule(event, 'invoicing', 'read', async (ctx) => {
		const [result, counts, totals] = await Promise.all([
			listInvoices(ctx.tx, { filter, sort, direction, page, now }),
			countInvoices(ctx.tx, now),
			summarise(ctx.tx, ctx.business.currency, now)
		]);

		return {
			access,
			module: { key: row.key, label: row.label, description: row.description, accent: row.accent },
			price: modulePrice('invoicing'),
			carryover: null,
			today,
			filter,
			invoices: result.items,
			counts,
			summary: {
				unpaidCount: totals.unpaidCount,
				overdueCount: totals.overdueCount,
				nextDue: totals.nextDue
			},
			owed: totals.owed,
			dueThisWeek: totals.dueThisWeek,
			overdue: totals.overdue,
			page: result.page,
			sort,
			direction,
			// A count of pages, not an amount — there is no rounding policy for "how many pages".
			// eslint-disable-next-line no-restricted-syntax -- pages, not money
			pageCount: Math.max(1, Math.ceil(result.total / (result.pageSize || DEFAULT_PAGE_SIZE)))
		};
	});
};

export const actions: Actions = {
	/**
	 * Start an invoice.
	 *
	 * A POST that creates the row and redirects to the editor, rather than an editor that creates
	 * on first save. The design's promise — "you can close this and come back" — is only true if
	 * there is something to come back TO from the first moment.
	 */
	create: async (event) => {
		const id = await withModule(event, 'invoicing', 'write', async (ctx) => {
			if (!ctx.business) error(500, { message: 'Something went wrong on our side.' });
			return createDraft(ctx.tx, ctx.business);
		});

		redirect(303, `/invoicing/${id}`);
	},

	/**
	 * "Remind them", from the one card on a phone that needs it.
	 *
	 * The whole of the work is in `sendReminder`, with the mail inside the transaction — so a
	 * reminder that could not be sent does not write an event claiming it was.
	 */
	remind: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');

		try {
			const result = await withModule(event, 'invoicing', 'write', (ctx) =>
				sendReminder(ctx.tx, ctx.business.id, ctx.userId, id, event.url.origin)
			);
			return { reminded: result.sentTo };
		} catch (cause) {
			if (cause instanceof CannotIssueInvoice) return fail(422, { message: cause.message });
			return fail(502, {
				message:
					'We could not send that reminder just now, so nothing went out. Try again in a moment.'
			});
		}
	},

	/**
	 * "Mark paid", from the same card.
	 *
	 * Records the FULL outstanding amount, received today, as an EFT — which is what "mark paid"
	 * means on a phone, and every one of those three is what the person tapping it meant. The
	 * detail screen is where a different amount, date or method is recorded, and this stays
	 * reversible for thirty days like any other payment.
	 */
	markPaid: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');

		try {
			await withModule(event, 'invoicing', 'write', async (ctx) => {
				// The amount is computed HERE, not taken from the form. The browser's copy of the
				// balance is as old as the page it was rendered on — and a stale page tapping "Mark
				// paid" after somebody else recorded a payment would otherwise double-record it.
				const [invoice, payments] = await Promise.all([
					loadInvoice(ctx.tx, id),
					loadPayments(ctx.tx, id)
				]);
				// THROWN, not returned. A `fail()` returned from inside `withModule` is just what
				// the callback resolves to — the action would ignore it and go on to report
				// "paid" having written nothing at all.
				if (!invoice) throw new CannotDoThat("We couldn't find that invoice.");

				const { outstanding } = settle(priceInvoice(invoice).total, payments);
				if (outstanding.cents <= 0) {
					throw new CannotDoThat('That invoice has nothing outstanding on it.');
				}

				return recordPayment(ctx.tx, ctx.business.id, ctx.userId, id, {
					amountCents: outstanding.cents,
					receivedOn: todayIn(new Date()),
					method: 'eft',
					reference: null
				});
			});
			return { paid: true };
		} catch (cause) {
			if (cause instanceof CannotDoThat) return fail(422, { message: cause.message });
			return fail(500, {
				message: 'We could not record that payment just now. Nothing was recorded — try again.'
			});
		}
	}
};
