/**
 * EVERYTHING THE SWITCHER AND ITS CONFIRMATIONS HAVE TO SAY, COMPUTED ONCE.
 *
 * The design's rule for the confirmation is exact: "New total, not the delta. Proration,
 * data-on-removal and how it arrives, all answered before being asked." Answering before
 * being asked means the figures exist before the dialog opens — so they are computed here,
 * on the server, from one reading of the clock, and the components render them.
 *
 * The alternative — a fetch when the confirmation opens — would put a spinner between "Add"
 * and the number that tells someone what they are about to pay. It would also let the
 * client compute a total, and there is exactly one function in this codebase that is allowed
 * to sum somebody's monthly bill.
 *
 * ONE CLOCK READING
 * -----------------
 * `now` is a parameter. Proration, the next charge date and the undo window all describe the
 * same instant, and three separate `new Date()` calls inside one page load can straddle
 * midnight — which would quote a charge for one month and a start date in the next.
 */
import type { Money } from '$lib/core/money';
import { quoteAddition } from '$lib/core/money';
import type { ModuleKey } from '$lib/core/modules/catalogue';
import type { Business } from '../db/map';
import type { Tx } from '../db/tx';
import type { AccessMap } from '../entitlement';
import { carryoverLines, loadCarryover } from './carryover';
import {
	catalogueGroups,
	monthlyTotal,
	ownedCount,
	totalWith,
	type CatalogueEntry
} from './catalogue';
import { loadSubscriptions, openPeriod } from './subscriptions';
import { isSameBillingDay } from '$lib/core/money';

/** What adding this module would cost, and when. Null when the business already has it. */
export type AddQuote = {
	readonly chargedToday: Money;
	readonly daysCharged: number;
	readonly daysInMonth: number;
	readonly nextChargeOn: Date;
	/**
	 * "1 August" — formatted on the SERVER, in the business's locale.
	 *
	 * A `toLocaleDateString` in the component renders one string during SSR and possibly
	 * another in the browser, which is a hydration mismatch that only appears in a different
	 * timezone on somebody else's machine. Same reason the top bar's date is formatted in
	 * `+layout.server.ts`.
	 */
	readonly nextChargeLabel: string;
	/** The new monthly total — the figure the confirmation shows. Never a delta. */
	readonly newTotal: Money;
	/** What already exists that this module arrives with. Generated, never static copy. */
	readonly arrivesWith: readonly string[];
};

/** What removing this module would do. Null when the business does not have it. */
export type RemoveQuote = {
	readonly newTotal: Money;
	/** True when it was added today, so removing it costs nothing at all. */
	readonly freeToday: boolean;
	/** When this period started. The removal dialog says how long they have had it. */
	readonly since: Date;
	/** "14 July" — formatted server-side, for the same reason as `nextChargeLabel`. */
	readonly sinceLabel: string;
};

export type ModuleOffer = CatalogueEntry & {
	readonly add: AddQuote | null;
	readonly remove: RemoveQuote | null;
};

export type ModuleOfferGroup = {
	readonly category: string;
	readonly label: string;
	readonly modules: readonly ModuleOffer[];
};

/** Everything `/settings/modules` and the switcher dialog render. */
export type ModulesView = {
	readonly groups: readonly ModuleOfferGroup[];
	readonly monthlyTotal: Money;
	readonly ownedCount: number;
	/** The design gates the buttons on this: "Owners and billing admins only". */
	readonly isOwner: boolean;
};

export async function loadModulesView(
	tx: Tx,
	business: Business,
	access: AccessMap,
	isOwner: boolean,
	now: Date
): Promise<ModulesView> {
	const [carryover, subscriptions] = await Promise.all([
		loadCarryover(tx, business, access),
		loadSubscriptions(tx)
	]);

	const current = monthlyTotal(access);
	const day = (date: Date) =>
		date.toLocaleDateString(business.locale, { day: 'numeric', month: 'long' });

	const groups = catalogueGroups(access).map((group) => ({
		category: group.category,
		label: group.label,
		modules: group.modules.map((entry): ModuleOffer => {
			const owned = entry.access === 'write';
			const period = owned ? openPeriod(subscriptions, entry.key) : null;

			return {
				...entry,
				add: owned
					? null
					: addQuote(entry.key, entry.price, access, carryoverFor(entry.key), now, day),
				remove:
					owned && period
						? {
								newTotal: totalWith(access, entry.key, 'read'),
								freeToday: isSameBillingDay(period.startedAt, now),
								since: period.startedAt,
								sinceLabel: day(period.startedAt)
							}
						: null
			};
		})
	}));

	function carryoverFor(key: ModuleKey): readonly string[] {
		return carryoverLines(carryover, key);
	}

	return {
		groups,
		monthlyTotal: current,
		ownedCount: ownedCount(access),
		isOwner
	};
}

function addQuote(
	key: ModuleKey,
	price: Money,
	access: AccessMap,
	arrivesWith: readonly string[],
	now: Date,
	day: (date: Date) => string
): AddQuote {
	const quote = quoteAddition(price, now);

	return {
		chargedToday: quote.today,
		daysCharged: quote.daysCharged,
		daysInMonth: quote.daysInMonth,
		nextChargeOn: quote.nextChargeOn,
		nextChargeLabel: day(quote.nextChargeOn),
		newTotal: totalWith(access, key, 'write'),
		arrivesWith
	};
}
