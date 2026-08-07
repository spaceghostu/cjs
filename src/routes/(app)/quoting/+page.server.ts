/**
 * THE QUOTES SCREEN.
 *
 * A STATIC route that wins over `[module=module]` for `/quoting`, which means it inherits that
 * route's responsibility as well as its path: the sidebar's promise is that a module row is a
 * real destination in all three access states, so this renders the locked and removed states
 * itself rather than 403-ing somebody who clicked a nav row on purpose.
 *
 * `moduleAccess` for the question, `withModule` for the enforcement. The two live side by side
 * in `ctx.ts` for exactly this reason.
 */
import { error, redirect } from '@sveltejs/kit';
import { moduleAccess, withBusiness, withModule } from '$lib/server/core/ctx';
import { moduleRow, modulePrice } from '$lib/server/core/modules/catalogue';
import { carryoverSummary, loadCarryover } from '$lib/server/core/modules/carryover';
import { listQuotes } from '$lib/server/modules/quoting/queries';
import { createDraft } from '$lib/server/modules/quoting/effects';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const access = moduleAccess(event, 'quoting');
	const row = moduleRow('quoting');

	if (access === 'none') {
		// The locked state names what this business would actually get, which costs one small
		// query — and only here. An owned module never asks.
		const carryover = await withBusiness(event, async (ctx) =>
			carryoverSummary(await loadCarryover(ctx.tx, ctx.business, ctx.access))
		);

		return {
			access,
			module: { key: row.key, label: row.label, description: row.description, accent: row.accent },
			price: modulePrice('quoting'),
			carryover,
			quotes: []
		};
	}

	// `read` reaches here too, and that is the point of the middle access state: a removed
	// module's quotes stay readable and exportable. The screen renders them without the
	// affordances that would write.
	const quotes = await withModule(event, 'quoting', 'read', async (ctx) =>
		listQuotes(ctx.tx, { now: new Date() })
	);

	return {
		access,
		module: { key: row.key, label: row.label, description: row.description, accent: row.accent },
		price: modulePrice('quoting'),
		carryover: null,
		quotes
	};
};

export const actions: Actions = {
	/**
	 * Start a quote.
	 *
	 * A POST that creates the row and redirects to the editor, rather than an editor that
	 * creates on first save. The design's promise — "you can close this and come back" — is only
	 * true if there is something to come back TO from the first moment, and a draft that exists
	 * only in a browser tab is the one thing a crash can take away.
	 */
	create: async (event) => {
		const id = await withModule(event, 'quoting', 'write', async (ctx) => {
			if (!ctx.business) error(500, { message: 'Something went wrong on our side.' });
			return createDraft(ctx.tx, ctx.business);
		});

		redirect(303, `/quoting/${id}`);
	}
};
