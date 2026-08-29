/**
 * THE STOCK COUNT — four steps, and nothing commits until step 3 has been read.
 *
 * WRITE, NOT READ. The same decision `inventory/[id]/+page.server.ts` makes and for the same
 * reason: a business that has REMOVED Inventory can still open the list and read its stock, but
 * this is the screen that CHANGES every quantity in it. A screen whose every action will be
 * refused is worse than an honest 403 with a way back, which is what `refuse()` renders.
 *
 * THE STEP IS THE STATUS. There is no `?step=` in the URL and there must not be: a bookmark
 * carrying `step=4` would be a second opinion about whether stock has already been updated, and
 * the database holds the only one that counts. `stepOfStatus` is the whole of the mapping, and
 * `app.freeze_applied_count()` is what stops a count going backwards through it.
 *
 * THE TRIAGE HAPPENS HERE, ONCE. `triageCount` puts the differences at the top of the sheet
 * before the page is sent, rather than the browser re-sorting as somebody types — see the header
 * on `CountSheet.svelte` for why a table that rearranges itself under a cursor is not doing
 * anybody a favour.
 *
 * AND THE FIGURES COME FROM `reviewCount`, NOT FROM A SUM WRITTEN HERE. That function exists
 * precisely so the sticky footer's running total and the review step's figure cannot disagree —
 * T24 makes it an acceptance criterion — and it reads through the same pure functions the browser
 * totals with while somebody is still typing.
 *
 * ONE CLOCK READING. `now` is taken once and passed to the page, so "Started Tuesday" and every
 * other date on the screen describe the same instant.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { withModule } from '$lib/server/core/ctx';
import { countTitle, stepOfStatus, triageCount, type CountSheetRow } from '$lib/core/inventory';
import { notFound, notFoundMessage } from '$lib/core/refusals';
import { loadStockCount, loadStockCountLines } from '$lib/server/modules/inventory/queries';
import { CannotDoThat } from '$lib/server/modules/inventory/effects';
import {
	applyCount,
	beginReview,
	resumeCounting,
	reviewCount
} from '$lib/server/modules/inventory/counts';
import type { StockCountLineRow } from '$lib/server/modules/inventory/queries';
import type { Actions, PageServerLoad } from './$types';

/** The query row, as the pure triage wants it. Names alongside the line, never folded into it. */
function toSheet(rows: readonly StockCountLineRow[]): CountSheetRow[] {
	return rows.map((row) => ({
		line: {
			id: row.id,
			itemId: row.itemId,
			locationId: row.locationId,
			expected: row.expected,
			counted: row.counted,
			costPrice: row.costPrice
		},
		itemName: row.itemName,
		locationName: row.locationName,
		unit: row.unit
	}));
}

export const load: PageServerLoad = async (event) => {
	const now = new Date();

	return withModule(event, 'inventory', 'write', async (ctx) => {
		const header = await loadStockCount(ctx.tx, event.params.id);
		// RLS has already made "another business's count" and "no such count" the same answer.
		if (!header) error(404, notFound('stock count'));

		const rows = await loadStockCountLines(ctx.tx, event.params.id);
		const { differing, matched } = triageCount(toSheet(rows));
		const review = await reviewCount(ctx.tx, event.params.id);

		return {
			nowMs: now.getTime(),
			locale: ctx.business.locale,
			count: {
				id: header.id,
				number: header.numberFormatted,
				title: countTitle(header.periodStart, header.periodEnd, ctx.business.locale),
				status: header.status,
				step: stepOfStatus(header.status),
				startedAtMs: header.startedAt.getTime()
			},
			differing,
			matched,
			review: {
				counted: review.counted,
				total: review.total,
				changes: review.changes,
				net: review.net,
				uncosted: review.uncosted
			},
			// One movement per varying line, written at step 4. Counted from the lines themselves
			// rather than remembered, so the confirmation states what is actually in the ledger.
			movements: rows.filter((row) => row.movementId !== null).length
		};
	});
};

/** Every action answers a refusal with a sentence, never a 500 that loses somebody's place. */
function refusal(cause: unknown, fallback: string) {
	if (cause instanceof CannotDoThat) return fail(422, { message: cause.message });
	return fail(500, { message: fallback });
}

export const actions: Actions = {
	/**
	 * Step 2 -> 3. The count stops being editable and starts being a decision.
	 *
	 * The browser flushes its autosave BEFORE submitting this, and cancels the submit if the flush
	 * did not land — see `+page.svelte` — so the figures on the review step are the figures the
	 * footer promised a moment earlier rather than the figures a failed save left behind.
	 */
	review: async (event) => {
		try {
			await withModule(event, 'inventory', 'write', (ctx) => beginReview(ctx.tx, event.params.id));
		} catch (cause) {
			return refusal(cause, 'We could not open the review just now. Nothing has changed.');
		}
		redirect(303, `/inventory/counts/${event.params.id}`);
	},

	/**
	 * Step 3 -> 2. "Going back for another look, which is the whole point" — the database's own
	 * comment on the transition it permits.
	 */
	back: async (event) => {
		try {
			await withModule(event, 'inventory', 'write', (ctx) =>
				resumeCounting(ctx.tx, event.params.id)
			);
		} catch (cause) {
			return refusal(cause, 'We could not reopen the count just now. Nothing has changed.');
		}
		redirect(303, `/inventory/counts/${event.params.id}`);
	},

	/**
	 * Step 3 -> 4. THE ONLY ACTION IN THIS FLOW THAT WRITES A MOVEMENT.
	 *
	 * Atomicity is inherited, not arranged: everything runs inside the one transaction `withModule`
	 * hands out, so a failure on the fortieth line rolls back the thirty-nine before it. That is
	 * `applyCount`'s guarantee and `counts.test.ts` proves it against real rows.
	 */
	apply: async (event) => {
		try {
			await withModule(event, 'inventory', 'write', async (ctx) => {
				const header = await loadStockCount(ctx.tx, event.params.id);
				if (!header) throw new CannotDoThat(notFoundMessage('stock count'));

				// THE STEP-3 GATE, and it is this application's rather than the database's.
				// `app.freeze_applied_count()` permits `counting -> applied`, because its job is to
				// stop a count being un-applied rather than to know what a screen looks like. The
				// flow's promise — "nothing changes until you've reviewed it at step 3" — is kept
				// here.
				//
				// `applied` and `preparing` fall through on purpose: `applyCount` already has the
				// right sentence for each of them, and repeating either here would be a second
				// opinion about a count this screen did not put in that state.
				if (header.status === 'counting') {
					throw new CannotDoThat(
						'Have a look at what will change first — that is step 3, and it is the last point of return.'
					);
				}

				return applyCount(ctx.tx, ctx.business.id, event.params.id, ctx.userId);
			});
		} catch (cause) {
			return refusal(
				cause,
				'We could not update your stock just now. Nothing was changed — try again.'
			);
		}
		redirect(303, `/inventory/counts/${event.params.id}`);
	}
};
