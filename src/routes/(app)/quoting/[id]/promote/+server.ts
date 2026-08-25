/**
 * "…AND WE'LL ASK IF YOU WANT IT SAVED." — the yes.
 *
 * The only path from a quote back to `core_customer`, and it exists as its own endpoint rather
 * than as a flag on the save so that it cannot happen by accident. A person said yes to
 * specific fields; this writes exactly those, read from the QUOTE rather than from the request,
 * so a promotion cannot carry a value they never saw on the document in front of them.
 */
import { error, json } from '@sveltejs/kit';
import { check } from '$lib/core/validation';
import { withModule } from '$lib/server/core/ctx';
import { promoteCustomerFields } from '$lib/server/modules/quoting/effects';
import { promoteSchema } from '$lib/server/modules/quoting/wire';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const body = await event.request.json().catch(() => null);
	const parsed = check(promoteSchema, body);

	if (!parsed.ok) {
		// The sentence is deliberately about the REQUEST rather than about a field, and this is
		// the one boundary where that is the honest answer: the payload is a list of checkboxes a
		// person ticked, so there is no field they could have mistyped and nothing for a
		// per-field message to attach to. What matters is the second half — nothing was changed.
		error(422, {
			code: 'invalid_promotion',
			message: "We couldn't save those to your customer list. Nothing was changed."
		});
	}

	const promoted = await withModule(event, 'quoting', 'write', (ctx) =>
		promoteCustomerFields(ctx.tx, event.params.id, parsed.value.fields)
	);

	return json({ promoted });
};
