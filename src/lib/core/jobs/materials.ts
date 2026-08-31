/**
 * WHAT A JOB'S MATERIALS COST, DERIVED FROM ITS MOVEMENTS — the seam SPA-23 wires up.
 *
 * The margin panel's materials figure is honest today by being absent: nothing writes a job's
 * stock consumption yet, so the panel degrades rather than guesses. This file is the half of
 * the answer that can exist now — a pure derivation from movement-shaped rows to a materials
 * cost — so that the day movements are written, the figure lights up without a redesign.
 *
 * THE CONTRACT WITH SPA-23, stated in full so it is a checklist and not archaeology:
 *
 *   1. SPA-23 adds `job` to `MOVEMENT_REASONS` (`$lib/core/inventory/types.ts`) and to the
 *      `inventory_movement_source_shape` CHECK — deliberately NOT done here, because a CHECK
 *      migration with no writer would be a third dead reserved word beside `quote` and
 *      `invoice`, on a vocabulary SPA-23 may yet reshape.
 *   2. SPA-23 writes movements with `sourceId = core_job.id` when stock is pulled for a job
 *      (client decision, 29 Aug 2026).
 *   3. SPA-23 decides which of a job's phased invoices carries the materials cost — a job
 *      billed in three invoices has one pile of consumed stock and three documents that could
 *      claim it, and that allocation is a design question this file must not pre-empt.
 *   4. SPA-23 wires this derivation at ISSUE-time posting, never at display time: the panel
 *      reads `core_posting` and nothing else (`$lib/server/modules/invoicing/margin.ts`), so
 *      a derived figure becomes visible by being POSTED, exactly as labour's is.
 *
 * Consumption is the NEGATION of the signed sum: a movement's `qty` is negative when stock
 * leaves (`$lib/core/inventory/types.ts` — one signed column, never a direction plus a
 * magnitude), so pulls minus returns come out as a positive cost. Each row is valued through
 * the same `lineAmount` the charge side uses, because a cost and a price rounded by different
 * routes would differ by a cent on exactly the jobs where the margin is thinnest.
 */
import {
	lineAmount,
	negateMoney,
	sumMoney,
	type CurrencyCode,
	type Money,
	type Quantity,
	type UnitPrice
} from '$lib/core/money';

/** One movement as this derivation needs it: how much moved, and what one of it cost. */
export type JobMovementCost = {
	/** Signed, as `inventory_movement.qty_e6` is stored: negative is stock leaving. */
	readonly qty: Quantity;
	/** Null when the item had no cost recorded at the time — a first-class answer. */
	readonly unitCost: UnitPrice | null;
};

export type MaterialsDerivation = {
	/** Null when no movement carries a cost — unknown is never rendered as zero. */
	readonly cost: Money | null;
	readonly totalMovements: number;
	/** Fewer than `totalMovements` means the figure is partial, and the caller must say so. */
	readonly costedMovements: number;
};

/**
 * The derivation. A row with no unit cost degrades the RESULT — `costedMovements` falls short
 * of `totalMovements`, the same shape as the margin panel's unpriced-lines caveat — rather
 * than being counted as free, which would flatter every margin it touched.
 */
export function materialsFromMovements(
	currency: CurrencyCode,
	movements: readonly JobMovementCost[]
): MaterialsDerivation {
	const costed = movements.filter(
		(m): m is JobMovementCost & { unitCost: UnitPrice } => m.unitCost !== null
	);

	if (costed.length === 0) {
		return { cost: null, totalMovements: movements.length, costedMovements: 0 };
	}

	const signedSum = sumMoney(
		currency,
		costed.map((m) => lineAmount(m.unitCost, m.qty))
	);

	return {
		cost: negateMoney(signedSum),
		totalMovements: movements.length,
		costedMovements: costed.length
	};
}
