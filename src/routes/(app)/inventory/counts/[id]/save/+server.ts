/**
 * THE COUNT SHEET'S AUTOSAVE ENDPOINT.
 *
 * A POST of every line that changed since the last one, and the one thing standing behind
 * "Saved automatically — leave and come back whenever."
 *
 * A `+server.ts` rather than a form action, for the reason `quoting/[id]/save/+server.ts` gives:
 * `navigator.sendBeacon` can only POST a body to a URL, it is what the sheet uses when a tab is
 * closing, and it is the only mechanism a browser will still deliver after the page is gone. The
 * endpoint the beacon needs and the endpoint the debounced save uses have to be the same one, or
 * the last row somebody typed goes to a route that does not exist.
 *
 * IT WRITES NOTHING BUT A COUNTED QUANTITY. `saveCountLine` touches three columns, and the
 * database refuses the rest — `app.freeze_count_snapshot()` will not let the expected quantity,
 * the item, the place or the cost move while a count is open. So this endpoint cannot, even by
 * mistake, be the thing that changes what somebody is counting against.
 *
 * AND IT WRITES ONLY WHILE THE COUNT IS BEING COUNTED. A count that has reached the review step
 * has stopped being editable — that is what makes step 3 a gate rather than a summary — and one
 * that has been applied is frozen at the database as well. Both are answered with a sentence and
 * a 409, not a 500, because the sheet has to be able to say what happened.
 */
import { error, json } from '@sveltejs/kit';
import { withModule } from '$lib/server/core/ctx';
import { notFound } from '$lib/core/refusals';
import { CannotDoThat } from '$lib/server/modules/inventory/effects';
import { saveCountLine } from '$lib/server/modules/inventory/counts';
import { loadStockCount, loadStockCountLines } from '$lib/server/modules/inventory/queries';
import { parseCountPatch } from '$lib/server/modules/inventory/wire';
import type { CountSaveResult } from '$lib/core/inventory';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	// `sendBeacon` sends a Blob, which arrives with whatever content type it was given. The body
	// is what matters and the parser is what decides whether it is acceptable, so the header is
	// not policed here.
	const body = await event.request.json().catch(() => null);

	const parsed = parseCountPatch(body);
	if (!parsed.ok) error(422, { code: 'invalid_count', message: parsed.message });

	return withModule(event, 'inventory', 'write', async (ctx) => {
		const header = await loadStockCount(ctx.tx, event.params.id);
		if (!header) error(404, notFound('stock count'));

		if (header.status === 'applied') {
			error(409, {
				code: 'count_applied',
				message: 'That count has already been applied to your stock, so it cannot be changed.'
			});
		}
		if (header.status !== 'counting') {
			error(409, {
				code: 'count_not_counting',
				message: 'That count is being reviewed. Go back a step to change what you counted.'
			});
		}

		// A line id is a claim like any other. RLS already keeps another business's lines out of
		// reach; this keeps another COUNT's lines out of reach, so one sheet cannot write to
		// another sheet's rows because somebody edited a request.
		const mine = new Set((await loadStockCountLines(ctx.tx, event.params.id)).map((r) => r.id));

		// One clock reading for the whole batch, and the one the indicator is told about — so
		// "saved" means "these rows carry this timestamp" rather than "we hoped".
		const savedAt = new Date();
		let saved = 0;

		try {
			for (const line of parsed.value.lines) {
				if (!mine.has(line.id)) continue;
				await saveCountLine(ctx.tx, line.id, line.countedQtyE6, ctx.userId, savedAt);
				saved += 1;
			}
		} catch (cause) {
			if (cause instanceof CannotDoThat) {
				error(422, { code: 'invalid_count', message: cause.message });
			}
			throw cause;
		}

		return json({ savedAt: savedAt.toISOString(), saved } satisfies CountSaveResult);
	});
};
