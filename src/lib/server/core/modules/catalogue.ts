/**
 * WHAT A MODULE COSTS.
 *
 * The other half of `$lib/core/modules/catalogue`, which holds everything a screen needs
 * and no prices. The split is not organisational — it is the money rule: a price is `Money`,
 * `Money` comes through `db/map.ts`, and `db/map.ts` is server-only. A price declared in a
 * client-importable file would have to be a raw number, and a raw number is exactly what the
 * money engine exists to prevent.
 *
 * PRICES HERE, PERIODS ELSEWHERE
 * ------------------------------
 * A price is a property of the CATALOGUE — what a module costs today. What a particular
 * business agreed to pay is a property of its subscription period, snapshotted on the row
 * (`schema/billing.ts`), and read through `modules/subscriptions.ts`. The two are kept apart
 * deliberately: changing a catalogue price must never re-price a period already charged.
 *
 * Everything below is derived from an access map, which is why one function produces the
 * running total for the sidebar, the switcher and the settings page alike.
 */
import {
	CATEGORY_LABELS,
	MODULES,
	MODULE_CATEGORIES,
	moduleRow,
	modulesInCategory,
	type ModuleCategory,
	type ModuleKey
} from '$lib/core/modules/catalogue';
import { ZAR, sumMoney, type Money } from '$lib/core/money';
import { toMoney } from '../db/map';
import type { Access, AccessMap } from '../entitlement';

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

/**
 * THE CATALOGUE AS THE SWITCHER RENDERS IT — categorised, priced, with this business's
 * access already on every row.
 *
 * Built here rather than in the component so that the sidebar's total, the switcher's list
 * and the settings page all read one function. The category order is `MODULE_CATEGORIES`,
 * which is the design's order and is stored rather than sorted.
 *
 * A category with nothing purchasable in it is omitted rather than rendered as a heading
 * over nothing — the same rule `sidebarGroups` follows.
 */
export type CatalogueEntry = PricedModule & { readonly access: Access };

export type CatalogueGroup = {
	readonly category: ModuleCategory;
	readonly label: string;
	readonly modules: readonly CatalogueEntry[];
};

export function catalogueGroups(access: AccessMap): readonly CatalogueGroup[] {
	const priced = new Map(purchasableModules().map((m) => [m.key, m]));

	return MODULE_CATEGORIES.flatMap((category) => {
		const modules = modulesInCategory(category).flatMap((row) => {
			const entry = priced.get(row.key);
			return entry ? [{ ...entry, access: access[row.key] }] : [];
		});

		return modules.length > 0 ? [{ category, label: CATEGORY_LABELS[category], modules }] : [];
	});
}

/** How many modules the business has right now. The switcher's subtitle counts these. */
export function ownedCount(access: AccessMap): number {
	return MODULES.filter((m) => access[m.key] === 'write').length;
}

/**
 * What the total WOULD be with one module added or removed.
 *
 * The confirmation shows the new total and never a delta, so the new total has to be a real
 * figure computed the same way the current one is — not `current + price`, which is the same
 * arithmetic done in a second place and free to drift from it.
 */
export function totalWith(access: AccessMap, moduleKey: ModuleKey, next: Access): Money {
	return monthlyTotal(Object.freeze({ ...access, [moduleKey]: next }));
}

/** Re-exported so a server caller has one import for "the catalogue". */
export { MODULES, moduleRow };
