/**
 * WHAT THE PLATFORM ITSELF PUTS ON HOME.
 *
 * Home is not only the modules. Two of its five panels are about the business's relationship
 * with the product rather than with its own work: what it pays for, and when that next
 * happens. Neither needs a query — the access map is already on the request and the catalogue
 * knows the prices — so neither costs a transaction, and both are available in the FIRST byte
 * of the response rather than streamed.
 *
 * That is deliberate. A dashboard whose every panel arrives late has no shape to hold the
 * skeletons in place; "Your modules" is real content that renders instantly and gives the
 * page its right-hand column from the start.
 */
import { firstOfNextMonth, formatZar } from '$lib/core/money';
import { MODULES } from '$lib/core/modules/catalogue';
import { modulePrice, monthlyTotal } from '../modules/catalogue';
import type { ModuleLine, ModulesPanel } from '$lib/core/home';
import type { AccessMap } from '../entitlement';
import type { AgendaContribution } from './types';

/** The right-hand "Your modules" panel: a row per owned module, then the running total. */
export function modulesPanel(access: AccessMap): ModulesPanel {
	const lines: ModuleLine[] = MODULES.flatMap((row) => {
		if (access[row.key] !== 'write') return [];
		const price = modulePrice(row.key);
		return price ? [{ module: row.key, price }] : [];
	});

	// The same function the sidebar footer and the switcher read. Three sums of somebody's
	// monthly bill would be three chances to disagree on screen.
	return { lines, total: monthlyTotal(access) };
}

/**
 * THE RENEWAL ROW.
 *
 * The one thing on Coming up that is always true and always the business's own money, so it
 * is here rather than in a module. It states a date and an amount and nothing else — no
 * countdown, no "action required". ESLint zone 10 bans timers near billing for the same
 * reason this row is worded the way it is.
 *
 * Nothing is contributed when the business owns nothing: a renewal row for R0 on a business
 * that pays for nothing is noise dressed as reassurance.
 */
export function platformAgenda(access: AccessMap, now: Date): readonly AgendaContribution[] {
	const total = monthlyTotal(access);
	if (total.cents === 0) return [];

	const owned = modulesPanel(access).lines.length;

	return [
		{
			id: 'platform:renewal',
			on: firstOfNextMonth(now),
			title: 'Your modules renew',
			detail: `${formatZar(total, { decimals: 0 })} for the ${owned === 1 ? 'module' : `${owned} modules`} you have now`
		}
	];
}
