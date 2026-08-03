/**
 * EVERY MODULE ROUTE, UNTIL IT IS BUILT.
 *
 * The sidebar's promise is that a module row is a real destination — the design shows
 * Payroll muted with a trailing "Add", and a row that 404s is not an offer, it is a dead
 * link. So the route exists for all seven catalogue keys and renders one of three things,
 * decided by entitlement rather than by which modules happen to have code.
 *
 * `moduleAccess` rather than `withModule`: this route WANTS the locked state. `withModule`
 * is the enforcement — it refuses, correctly, with a 403 — and that is the wrong answer for
 * a nav row somebody clicked on purpose. The two live side by side in `ctx.ts` for exactly
 * this reason.
 *
 * When a module is built it gets its own directory (`/invoicing/+page.svelte`), which wins
 * over this dynamic route without anything here changing.
 */
import { error } from '@sveltejs/kit';
import { isModuleKey } from '$lib/core/modules/catalogue';
import { moduleRow, modulePrice } from '$lib/server/core/modules/catalogue';
import { moduleAccess } from '$lib/server/core/ctx';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const key = event.params.module;

	// The param matcher has already refused anything else; this narrows the type and keeps
	// the route honest if the matcher is ever loosened.
	if (!isModuleKey(key)) error(404, { message: 'There is no such page.' });

	const row = moduleRow(key);
	const price = modulePrice(key);

	return {
		module: {
			key,
			label: row.label,
			description: row.description,
			accent: row.accent
		},
		price,
		access: moduleAccess(event, key)
	};
};
