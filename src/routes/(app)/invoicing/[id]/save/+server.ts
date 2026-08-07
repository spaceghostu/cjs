/**
 * THE DRAFT SAVE ENDPOINT.
 *
 * A POST of the whole document — the same shape and the same reasoning as
 * `quoting/[id]/save/+server.ts`.
 *
 * A `+server.ts` rather than a form action, and that is not a style choice: a SvelteKit form
 * action expects form-encoded data and refuses a JSON body before the handler runs. The payload
 * here IS a document — nested lines, exact integers — so it crosses as JSON, and JSON needs an
 * endpoint. (It is also what `sendBeacon` would need the day this editor gains the autosave the
 * quote editor has: a beacon can only POST a body to a URL.)
 *
 * Returns the DATABASE's `updated_at`. The editor shows what was written, never what the browser
 * hoped had been.
 */
import { error, json } from '@sveltejs/kit';
import { withModule } from '$lib/server/core/ctx';
import { InvoiceNotEditable, saveDraft } from '$lib/server/modules/invoicing/effects';
import { parseInvoicePatch } from '$lib/server/modules/invoicing/wire';
import type { SaveResult } from '$lib/core/invoicing/wire';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const body = await event.request.json().catch(() => null);

	const parsed = parseInvoicePatch(body);
	if (!parsed.ok) error(422, { code: 'invalid_invoice', message: parsed.message });

	return withModule(event, 'invoicing', 'write', async (ctx) => {
		try {
			const savedAt = await saveDraft(ctx.tx, ctx.business.id, event.params.id, parsed.value);
			return json({ savedAt: savedAt.toISOString() } satisfies SaveResult);
		} catch (cause) {
			// An issued invoice is frozen — it is a tax record, and the client has a PDF of it.
			// Said in language the editor can show, not as a 500. The database refuses the write
			// as well; this is the sentence a person gets.
			if (cause instanceof InvoiceNotEditable) {
				error(409, { code: 'invoice_issued', message: cause.message });
			}
			throw cause;
		}
	});
};
