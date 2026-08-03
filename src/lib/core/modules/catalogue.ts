/**
 * THE CATALOGUE — what a module IS, before anyone asks whether this business has one.
 *
 * Modularity is the product, and the design's stated goal is that the catalogue "can grow
 * without reshaping the shell". That is only true if the shell reads a list rather than
 * containing one, so this file is the list: seven rows, each carrying everything the nav,
 * the switcher and the locked state need to render a module they have never heard of.
 *
 * WHAT IS HERE AND WHAT IS NOT
 * ----------------------------
 * Everything here is CLIENT-SAFE: keys, names, categories, routes, accents. The sidebar and
 * the bottom nav are components, so a catalogue they cannot import is a catalogue the shell
 * has to duplicate.
 *
 * PRICES ARE NOT HERE. A price is `Money`, and `Money` is constructible only through
 * `db/map.ts` — which is server-only. So `$lib/server/core/modules/catalogue.ts` holds the
 * prices and the running total, and imports the rows below rather than restating them.
 *
 * T10 completes the picture by adding `billing_subscription`, which is what turns the
 * catalogue into an answer about a particular business. Until then every module is locked,
 * which is the honest reading of "nobody has subscribed to anything".
 */

/**
 * The seven modules the design's catalogue names.
 *
 * Three have screens (Quoting, Invoicing, Inventory). The rest exist so the catalogue,
 * switcher and billing are real: they render, they price, they are addable, and their module
 * route is the locked state until somebody builds them.
 */
export const MODULE_KEYS = [
	'quoting',
	'invoicing',
	'bookings',
	'inventory',
	'scheduling',
	'payroll',
	'expenses'
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export function isModuleKey(value: unknown): value is ModuleKey {
	return typeof value === 'string' && (MODULE_KEYS as readonly string[]).includes(value);
}

/**
 * Sales, Operations, People — the order the design uses in both the sidebar and the
 * switcher. Stored, never sorted alphabetically: the order is a merchandising decision.
 *
 * Expenses has no category because the design gives it an accent colour and no catalogue
 * row. It is in `MODULE_KEYS` so that entitlement has an answer for it, and out of every
 * category so that it appears in no nav and no switcher until someone gives it a row.
 */
export const MODULE_CATEGORIES = ['sales', 'operations', 'people'] as const;

export type ModuleCategory = (typeof MODULE_CATEGORIES)[number];

export const CATEGORY_LABELS: Readonly<Record<ModuleCategory, string>> = Object.freeze({
	sales: 'Sales',
	operations: 'Operations',
	people: 'People'
});

export type ModuleRow = {
	readonly key: ModuleKey;
	/** Sidebar and switcher. "Job scheduling". */
	readonly label: string;
	/** Bottom nav, where 11px under a 20px icon has room for one word. "Stock". */
	readonly shortLabel: string;
	/** The design's own one-line description, used by the switcher in T11. */
	readonly description: string;
	readonly category: ModuleCategory | null;
	/** Where the module lives. Also the locked state's route while it is unbuilt. */
	readonly href: string;
	/**
	 * The Tailwind colour name for this module's accent — `text-quoting`, `bg-quoting-tint`.
	 * A name rather than a hex value: the accents are declared once in `layout.css` and
	 * re-derived per theme, and a second copy of `#6E8CF0` here would be a second answer.
	 */
	readonly accent: string;
	/**
	 * Offer this module in the NAV even when the business has never owned it.
	 *
	 * The design's sidebar shows exactly one locked row: Payroll, muted, with a trailing
	 * "Add", next to the three modules Thornhill actually owns. It is the worked example for
	 * the whole add-a-module flow, so the offer is deliberate — and it is the ONLY one, which
	 * is what leaves the fifth slot on a phone free for "More" rather than a fifth
	 * destination.
	 *
	 * Which modules earn that offer is a catalogue decision, so it is a column here rather
	 * than a branch in the shell. Everything else is discoverable through the switcher (T11),
	 * which is what stops the sidebar growing a row per unsold module.
	 *
	 * Once a business owns a module it appears regardless of this flag.
	 */
	readonly offeredWhenLocked: boolean;
};

/**
 * The rows. Prices live in the server catalogue; everything else a screen needs is here.
 *
 * Ordered within each category the way the design orders them.
 */
export const MODULES: readonly ModuleRow[] = Object.freeze([
	{
		key: 'quoting',
		label: 'Quoting',
		shortLabel: 'Quotes',
		description: 'Branded quotes clients can accept online',
		category: 'sales',
		href: '/quoting',
		accent: 'quoting',
		offeredWhenLocked: false
	},
	{
		key: 'invoicing',
		label: 'Invoicing',
		shortLabel: 'Invoices',
		description: 'Invoices, reminders and payment tracking',
		category: 'sales',
		href: '/invoicing',
		accent: 'invoicing',
		offeredWhenLocked: false
	},
	{
		key: 'bookings',
		label: 'Bookings',
		shortLabel: 'Bookings',
		description: 'Let clients book site visits from your quote',
		category: 'sales',
		href: '/bookings',
		accent: 'bookings',
		offeredWhenLocked: false
	},
	{
		key: 'inventory',
		label: 'Inventory',
		shortLabel: 'Stock',
		description: 'Materials, stock counts and reorder points',
		category: 'operations',
		href: '/inventory',
		accent: 'inventory',
		offeredWhenLocked: false
	},
	{
		key: 'scheduling',
		label: 'Job scheduling',
		shortLabel: 'Jobs',
		description: "Plan the week and see who's on what",
		category: 'operations',
		href: '/scheduling',
		accent: 'home',
		offeredWhenLocked: false
	},
	{
		key: 'payroll',
		label: 'Payroll',
		shortLabel: 'Payroll',
		description: 'Monthly pay runs, payslips, PAYE and UIF',
		category: 'people',
		href: '/payroll',
		accent: 'payroll',
		offeredWhenLocked: true
	},
	{
		key: 'expenses',
		label: 'Expenses',
		shortLabel: 'Expenses',
		description: 'Track what the business spends',
		category: null,
		href: '/expenses',
		accent: 'expenses',
		offeredWhenLocked: false
	}
]);

const BY_KEY: Readonly<Record<ModuleKey, ModuleRow>> = Object.freeze(
	Object.fromEntries(MODULES.map((m) => [m.key, m]))
) as Record<ModuleKey, ModuleRow>;

/** The row for a key. Total, because `ModuleKey` is closed and every key has a row. */
export function moduleRow(key: ModuleKey): ModuleRow {
	return BY_KEY[key];
}

/** The name a person sees. The one place a module's name is spelled. */
export function label(key: ModuleKey): string {
	return BY_KEY[key].label;
}

/**
 * The rows in a category, in catalogue order.
 *
 * Categories are iterated through `MODULE_CATEGORIES` so the order is the design's, and a
 * module added to a new category shows up without this function changing.
 */
export function modulesInCategory(category: ModuleCategory): readonly ModuleRow[] {
	return MODULES.filter((m) => m.category === category);
}

/**
 * WHAT A BUSINESS MAY DO WITH A MODULE.
 *
 * The three states live here rather than in `$lib/server/core/entitlement` — which owns the
 * arithmetic that produces them and re-exports these — for the same reason the keys do: the
 * sidebar renders a locked row and a removed one differently, and it cannot import
 * `$lib/server` to find out which is which. A *type* is not a permission; the ANSWER is
 * still computed on the server, once per request, from subscription periods RLS has scoped.
 */
export type Access = 'none' | 'read' | 'write';

export type AccessMap = Readonly<Record<ModuleKey, Access>>;

/** Every module locked. The starting point, and the answer for a request with no business. */
export const NO_ACCESS: AccessMap = Object.freeze(
	Object.fromEntries(MODULE_KEYS.map((key) => [key, 'none' as const]))
) as AccessMap;

/**
 * HOME IS NOT A MODULE.
 *
 * It has a nav row, an accent and a route like a module does, and none of the rest: it is
 * never owned, never priced, never locked, and never in the switcher. Modelling it as a
 * catalogue row with six null columns would put "is this the fake one?" into every loop
 * over `MODULES`.
 */
export const HOME = Object.freeze({
	key: 'home' as const,
	label: 'Home',
	shortLabel: 'Home',
	href: '/',
	accent: 'home'
});

export type HomeKey = typeof HOME.key;
