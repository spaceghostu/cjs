/**
 * WHO CONTRIBUTES TO HOME.
 *
 * One row per module that has something to say, and Home reads the list. The shell reads a
 * catalogue rather than containing one for exactly this reason, and the dashboard is the
 * screen where the same discipline pays for itself most: adding a module means adding a row
 * here, not a branch in five panels.
 *
 * Everything is imported through a module's `public.ts`. ESLint zone 3 makes that the only
 * legal path, and the boundary matters here more than anywhere — a Home that reached into
 * Quoting's queries would couple the dashboard to a module a business might not own, which is
 * the precise failure the whole modular promise rests on not having.
 *
 * THE FOUR MODULES THAT ARE NOT HERE
 * ----------------------------------
 * Bookings, Job scheduling, Payroll and Expenses exist in the catalogue and have no screens
 * and no storage. They are absent rather than registered with an empty contributor: a
 * contributor that always returns nothing is a transaction opened for no reason, on every
 * dashboard load, for every business that owns one. They join by adding a row.
 */
import { summariseInventory } from '$lib/server/modules/inventory/public';
import { summariseInvoicing } from '$lib/server/modules/invoicing/public';
import { summariseQuoting } from '$lib/server/modules/quoting/public';
import { MODULES } from '$lib/core/modules/catalogue';
import type { AccessMap } from '../entitlement';
import type { PanelKey, SummaryContributor } from './types';

export const CONTRIBUTORS: readonly SummaryContributor[] = Object.freeze([
	{
		module: 'quoting',
		// No figures: a quote is not money owed. See `quoting/summary.ts`.
		panels: ['standing', 'resume', 'agenda'],
		summarise: summariseQuoting
	},
	{
		module: 'invoicing',
		panels: ['standing', 'resume', 'figures', 'agenda'],
		summarise: summariseInvoicing
	},
	{
		module: 'inventory',
		panels: ['standing', 'resume'],
		summarise: summariseInventory
	}
]);

/**
 * The contributors this business actually has, in catalogue order.
 *
 * `write` only. A REMOVED module is still readable and exportable — that is the point of the
 * middle access state — but it is not part of the business any more, and reporting on it from
 * the dashboard would quietly undo the removal somebody deliberately made.
 */
export function contributorsFor(access: AccessMap): readonly SummaryContributor[] {
	const registered = new Map(CONTRIBUTORS.map((c) => [c.module, c]));

	return MODULES.flatMap((row) => {
		const contributor = registered.get(row.key);
		return contributor && access[row.key] === 'write' ? [contributor] : [];
	});
}

/** Which of them feed one panel — the set that panel's promise has to wait for. */
export function feeding(
	contributors: readonly SummaryContributor[],
	panel: PanelKey
): readonly SummaryContributor[] {
	return contributors.filter((c) => c.panels.includes(panel));
}
