/**
 * THE AUTOSAVE ENDPOINT.
 *
 * A POST of the whole document, and the one thing standing behind "All changes saved · 21:47.
 * You can close this and come back."
 *
 * A `+server.ts` rather than a form action, for one reason that matters: `navigator.sendBeacon`
 * can only POST a body to a URL. It is what the editor uses when a tab is closing, and it is
 * the only mechanism a browser will still deliver after the page is gone — so the endpoint the
 * beacon needs and the endpoint the debounced save uses have to be the same one, or the last
 * thing somebody typed goes to a route that does not exist.
 *
 * Returns the DATABASE's `updated_at`. The indicator shows what was written, never what the
 * browser hoped had been.
 */
import { error, json } from '@sveltejs/kit';
import { withModule } from '$lib/server/core/ctx';
import { QuoteNotEditable, saveDraft } from '$lib/server/modules/quoting/effects';
import { parseDraftPatch } from '$lib/server/modules/quoting/wire';
import type { SaveResult } from '$lib/core/quoting';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	// `sendBeacon` sends a Blob, which arrives with whatever content type it was given. The
	// body is what matters and zod is what decides whether it is acceptable, so the header is
	// not policed here.
	const body = await event.request.json().catch(() => null);

	const parsed = parseDraftPatch(body);
	if (!parsed.ok) error(422, { code: 'invalid_quote', message: parsed.message });

	return withModule(event, 'quoting', 'write', async (ctx) => {
		try {
			const savedAt = await saveDraft(ctx.tx, ctx.business.id, event.params.id, parsed.value);
			return json({ savedAt: savedAt.toISOString() } satisfies SaveResult);
		} catch (cause) {
			// A quote that has been sent is frozen — the client has a PDF, and editing the
			// document they are looking at from the other side is the worst thing this module
			// could do. Said in language the editor can show, not as a 500.
			if (cause instanceof QuoteNotEditable) {
				error(409, { code: 'quote_sent', message: cause.message });
			}
			throw cause;
		}
	});
};
