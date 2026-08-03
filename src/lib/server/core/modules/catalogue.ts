/**
 * WHAT A MODULE COSTS.
 *
 * The other half of `$lib/core/modules/catalogue`, which holds everything a screen needs
 * and no prices. The split is not organisational — it is the money rule: a price is `Money`,
 * `Money` comes through `db/map.ts`, and `db/map.ts` is server-only. A price declared in a
 * client-importable file would have to be a raw number, and a raw number is exactly what the
 * money engine exists to prevent.
 *
 * WHAT T10 STILL ADDS
 * -------------------
 * `billing_subscription`, and with it real periods, proration (T12) and the switcher's
 * add/remove (T11). This file already answers the one question the SHELL asks — "what is
 * this business paying a month?" — and answers it from the access map, so when subscriptions
 * become real the total starts moving without the sidebar changing.
 */
import { MODULES, moduleRow, type ModuleKey } from '$lib/core/modules/catalogue';
import { ZAR, sumMoney, type Money } from '$lib/core/money';
import { toMoney } from '../db/map';
import type { AccessMap } from '../entitlement';

/**
 * The design's own monthly prices, in cents.
 *
 * Expenses has no price because it has no catalogue row in the design — an accent colour
 * and nothing else. `null` says that; `0` would say "free", which is a different claim and
 * would put it in the switcher at R0.
 */
const PRICE_CENTS: Readonly<Record<ModuleKey, number | null>> = Object.freeze({
	quoting: 12_000,
	invoicing: 15_000,
	bookings: 9_000,
	inventory: 18_000,
	scheduling: 11_000,
	payroll: 12_000,
	expenses: null
});

/** What a module costs per month, or null when it is not for sale yet. */
export function modulePrice(key: ModuleKey): Money | null {
	const cents = PRICE_CENTS[key];
	return cents === null ? null : toMoney(cents);
}

export type PricedModule = {
	readonly key: ModuleKey;
	readonly label: string;
	readonly description: string;
	/** Tailwind colour name, not a hex value — see the client catalogue. */
	readonly accent: string;
	readonly price: Money;
};

/** Every module that can actually be bought, in catalogue order. */
export function purchasableModules(): readonly PricedModule[] {
	return MODULES.flatMap((m) => {
		const price = modulePrice(m.key);
		if (!price) return [];
		return [{ key: m.key, label: m.label, description: m.description, accent: m.accent, price }];
	});
}

/**
 * THE RUNNING MONTHLY TOTAL — one function, two callers.
 *
 * The sidebar footer shows it beside "Add a module" and the switcher (T11) shows it at the
 * top of the dialog, and the design shows the same R450 in both. Two implementations of that
 * sum is two chances to disagree with each other on a screen about someone's money, so there
 * is one, and both read it.
 *
 * Only `write` counts. A REMOVED module is still readable and exportable — that is the whole
 * point of the middle access state — and charging for it would be the exact broken promise
 * the three-state model exists to prevent.
 */
export function monthlyTotal(access: AccessMap): Money {
	const owned = MODULES.filter((m) => access[m.key] === 'write').flatMap((m) => {
		const price = modulePrice(m.key);
		return price ? [price] : [];
	});

	return sumMoney(ZAR, owned);
}

/** Re-exported so a server caller has one import for "the catalogue". */
export { MODULES, moduleRow };
