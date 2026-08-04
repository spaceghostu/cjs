/**
 * ADD, REMOVE, UNDO — the three writes that change what a business is paying for.
 *
 * Everything the design promises about modularity is either true here or nowhere:
 *
 *   "one tap either way"          add and remove are the same size of operation
 *   "only charged for the days"   the charge is prorated, computed once, and recorded
 *   "your payroll data stays"     removal CLOSES a period, it never deletes anything
 *   "undo"                        a just-added period can be marked as never having counted
 *
 * WHY THE ROLE CHECK IS HERE AND NOT ONLY IN THE ROUTE
 * ---------------------------------------------------
 * The switcher disables its buttons for staff and says why, which is the honest UI. It is
 * not the enforcement: a form post is a form post, and a disabled button is a suggestion.
 * The refusal that matters is this one, at the point of effect, where nothing can route
 * around it.
 *
 * WHY EVERY FUNCTION TAKES `now`
 * ------------------------------
 * The charge, the period boundary and the "is this still undoable" window are all answers
 * about one instant. Reading the clock three times inside one operation is three chances to
 * straddle midnight and bill for a month nobody was in.
 */
import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { subscription } from '../db/schema/billing';
import { moneyToColumn } from '../db/map';
import type { Ctx } from '../ctx';
import { label, type ModuleKey } from '$lib/core/modules/catalogue';
import {
	isSameBillingDay,
	prorateDaysHeld,
	prorateRemainderOfMonth,
	zero,
	type Money
} from '$lib/core/money';
/** The nav model owns the route, so the way back from a refusal is the row people clicked. */
import { MODULES_HREF } from '$lib/components/shell/nav';
import { modulePrice } from './catalogue';

/** What actually happened, so the caller can raise the right toast and the right undo. */
export type AddResult = {
	readonly subscriptionId: string;
	readonly moduleKey: ModuleKey;
	/** Charged now, for the remainder of this month. */
	readonly chargedToday: Money;
};

export type RemoveResult = {
	readonly moduleKey: ModuleKey;
	/** What the part-month came to. Zero when it was removed the day it was added. */
	readonly charged: Money;
	/** True when the period was voided rather than closed — added and removed the same day. */
	readonly sameDay: boolean;
};

/**
 * ADD.
 *
 * The price is snapshotted onto the row at insert. The partial unique index in
 * `schema/billing.ts` is what makes a double-click impossible: the second insert violates it
 * rather than opening a second period, so nobody is ever charged twice for one module.
 */
export async function addModule(ctx: Ctx, moduleKey: ModuleKey, now: Date): Promise<AddResult> {
	requireBillingAdmin(ctx);
	const price = requirePrice(moduleKey);

	if (ctx.access[moduleKey] === 'write') {
		error(409, {
			code: 'module_already_added',
			message: `Your business already has ${label(moduleKey)}. Nothing was charged.`,
			nextHref: MODULES_HREF,
			nextLabel: 'Back to modules'
		});
	}

	const [row] = await ctx.tx
		.insert(subscription)
		.values({
			businessId: ctx.business.id,
			moduleKey,
			startedAt: now,
			priceCents: moneyToColumn(price),
			currency: price.currency
		})
		.returning({ id: subscription.id });

	return {
		subscriptionId: row.id,
		moduleKey,
		chargedToday: prorateRemainderOfMonth(price, now)
	};
}

/**
 * REMOVE.
 *
 * Removing on the day of adding VOIDS the period instead of closing it — "Remove it today
 * and you're not charged at all", and a zero-length closed period would otherwise leave
 * behind a read-only archive of a module nobody ever used.
 *
 * Any other day closes it. The data stays, the module turns read-only and exportable, and
 * the part-month is what it is.
 */
export async function removeModule(
	ctx: Ctx,
	moduleKey: ModuleKey,
	now: Date
): Promise<RemoveResult> {
	requireBillingAdmin(ctx);

	const [open] = await ctx.tx
		.select()
		.from(subscription)
		.where(
			and(
				eq(subscription.moduleKey, moduleKey),
				isNull(subscription.endedAt),
				isNull(subscription.voidedAt)
			)
		);

	if (!open) {
		error(409, {
			code: 'module_not_added',
			message: `Your business doesn't currently have ${label(moduleKey)}, so there was nothing to remove.`,
			nextHref: MODULES_HREF,
			nextLabel: 'Back to modules'
		});
	}

	const sameDay = isSameBillingDay(open.startedAt, now);
	const price = requirePrice(moduleKey);

	await ctx.tx
		.update(subscription)
		.set(sameDay ? { voidedAt: now, endedAt: now } : { endedAt: now })
		.where(eq(subscription.id, open.id));

	return {
		moduleKey,
		charged: sameDay ? zero(price.currency) : prorateDaysHeld(price, open.startedAt, now),
		sameDay
	};
}

/**
 * UNDO.
 *
 * Closes the period as if it never opened, and charges nothing. Deliberately narrow: it
 * takes the id the add returned, and it only works while that period is still open and still
 * on the day it started. Anything later is a REMOVAL — a different thing, with a different
 * confirmation, because by then the business has had the module for a day somebody may have
 * put data into.
 *
 * The window is a DAY, not a countdown. ESLint zone 10 forbids a timer anywhere near billing,
 * and the reason is the same one that makes the window generous: manufactured urgency has no
 * place on a screen about someone's money.
 */
export async function undoAddition(
	ctx: Ctx,
	subscriptionId: string,
	now: Date
): Promise<{ moduleKey: ModuleKey } | null> {
	requireBillingAdmin(ctx);

	const [open] = await ctx.tx
		.select()
		.from(subscription)
		.where(
			and(
				eq(subscription.id, subscriptionId),
				isNull(subscription.endedAt),
				isNull(subscription.voidedAt)
			)
		);

	// Null rather than an error: the toast is still on screen after the module was removed in
	// another tab, and shouting at somebody for pressing Undo twice helps nobody.
	if (!open || !isSameBillingDay(open.startedAt, now)) return null;

	await ctx.tx
		.update(subscription)
		.set({ voidedAt: now, endedAt: now })
		.where(eq(subscription.id, open.id));

	return { moduleKey: open.moduleKey as ModuleKey };
}

/** The design: "Owners and billing admins only". `core_member.role` is the gate. */
function requireBillingAdmin(ctx: Ctx): void {
	if (ctx.member.role === 'owner') return;

	error(403, {
		code: 'not_billing_admin',
		message:
			'Only an owner can add or remove modules. Ask whoever owns this business and they can do it in seconds.',
		nextHref: MODULES_HREF,
		nextLabel: 'See what your business has'
	});
}

/**
 * A module with no price is not for sale. `expenses` is the case — the design gives it an
 * accent colour and no catalogue row — and a null price must refuse rather than default to
 * free, which is a different claim entirely.
 */
function requirePrice(moduleKey: ModuleKey): Money {
	const price = modulePrice(moduleKey);
	if (price) return price;

	error(400, {
		code: 'module_not_for_sale',
		message: `${label(moduleKey)} isn't something you can add yet.`,
		nextHref: MODULES_HREF,
		nextLabel: 'See what you can add'
	});
}
