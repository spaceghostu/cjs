/**
 * SUBSCRIPTION PERIODS, AS THE PRODUCT NEEDS THEM.
 *
 * `entitlement.ts` reads the same table and answers one question — may this business write
 * to this module right now — with the least data that can answer it. This file is for
 * everything else: what was charged, when the current period opened, and whether the last
 * thing that happened is still undoable.
 *
 * Two readers rather than one because the shapes genuinely differ. Entitlement runs on every
 * request and wants three columns of every period ever; the switcher wants the money and the
 * dates of the CURRENT one. Widening entitlement's row to serve both would put a price and
 * an id on the hot path of every page load in the product to serve one dialog.
 */
import { desc, isNull } from 'drizzle-orm';
import { subscription } from '../db/schema/billing';
import { toMoney } from '../db/map';
import type { Tx } from '../db/tx';
import { isModuleKey, type ModuleKey } from '$lib/core/modules/catalogue';
import type { Money } from '$lib/core/money';

/**
 * One stretch of time a business owned a module, with the money attached.
 *
 * `price` is the price SNAPSHOTTED when the period opened, never the catalogue price today —
 * see the note in `schema/billing.ts`. A period is what a business agreed to, and a
 * catalogue change must not rewrite an agreement retroactively.
 */
export type Subscription = {
	readonly id: string;
	readonly moduleKey: ModuleKey;
	readonly startedAt: Date;
	readonly endedAt: Date | null;
	readonly price: Money;
};

/**
 * Every period that counts, newest first. Voided ones are excluded — they never happened.
 *
 * No `business_id` predicate: RLS has already scoped the table. See `entitlement.ts`.
 */
export async function loadSubscriptions(tx: Tx): Promise<readonly Subscription[]> {
	const rows = await tx
		.select()
		.from(subscription)
		.where(isNull(subscription.voidedAt))
		.orderBy(desc(subscription.startedAt));

	return rows.filter((row) => isModuleKey(row.moduleKey)).map(toSubscription);
}

/** The open period for a module, or null when the business does not currently own it. */
export function openPeriod(
	subscriptions: readonly Subscription[],
	moduleKey: ModuleKey
): Subscription | null {
	return subscriptions.find((s) => s.moduleKey === moduleKey && s.endedAt === null) ?? null;
}

function toSubscription(row: typeof subscription.$inferSelect): Subscription {
	return {
		id: row.id,
		moduleKey: row.moduleKey as ModuleKey,
		startedAt: row.startedAt,
		endedAt: row.endedAt,
		price: toMoney(row.priceCents, row.currency)
	};
}
