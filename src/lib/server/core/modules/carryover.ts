/**
 * "IT ARRIVES READY" — what actually carries over, for THIS business.
 *
 * The add confirmation's third answer is the one the design is most specific about: it says
 * "There's nothing to set up", and then it has to prove it. A static sentence claiming your
 * people and your tax settings came across is a lie the first time somebody adds a module on
 * their first afternoon, before there are any people.
 *
 * So the lines are counted, not written. A business with nothing yet gets a shorter, true
 * list — and the honest empty case is the whole reason this is a query.
 *
 * The same facts feed the locked state (T13), which says the value concretely: "It would
 * arrive with your 4 people already loaded."
 */
import { count, isNull } from 'drizzle-orm';
import { customer, member } from '../db/schema/core';
import type { Tx } from '../db/tx';
import type { Business } from '../db/map';
import { MODULES, type ModuleKey } from '$lib/core/modules/catalogue';
import type { AccessMap } from '../entitlement';

/** The counted facts. Small on purpose: three cheap aggregates, once per dialog. */
export type Carryover = {
	readonly people: number;
	readonly customers: number;
	/** Modules already owned, by name — "Quoting, Invoicing". */
	readonly ownedModules: readonly string[];
	readonly hasCompanyDetails: boolean;
	readonly hasVatNumber: boolean;
};

export async function loadCarryover(
	tx: Tx,
	business: Business,
	access: AccessMap
): Promise<Carryover> {
	const [[people], [customers]] = await Promise.all([
		tx.select({ n: count() }).from(member),
		// Archived customers are not gone, but they are not something a new module "arrives
		// with" either. The count someone recognises is the one they can see in the product.
		tx.select({ n: count() }).from(customer).where(isNull(customer.archivedAt))
	]);

	return {
		people: people.n,
		customers: customers.n,
		ownedModules: MODULES.filter((m) => access[m.key] === 'write').map((m) => m.label),
		hasCompanyDetails: Boolean(business.address.line1 || business.address.city),
		hasVatNumber: Boolean(business.vatNumber)
	};
}

/**
 * The counted facts as sentences, in the order the design lists them.
 *
 * Rendered as a list rather than a paragraph so a business with one fact gets one line
 * instead of a sentence with two commas and nothing between them. Returns an empty array
 * when there is genuinely nothing yet, and the dialog says so plainly rather than padding.
 */
export function carryoverLines(carryover: Carryover, adding: ModuleKey): readonly string[] {
	const lines: string[] = [];

	if (carryover.hasCompanyDetails) {
		lines.push(
			carryover.hasVatNumber
				? 'Your company details and VAT number, already on every document'
				: 'Your company details, already on every document'
		);
	}

	if (carryover.people > 0) {
		lines.push(`${plural(carryover.people, 'person', 'people')}, already on your team`);
	}

	if (carryover.customers > 0) {
		lines.push(`${plural(carryover.customers, 'customer', 'customers')} you already invoice`);
	}

	if (carryover.ownedModules.length > 0) {
		lines.push(`Everything in ${list(carryover.ownedModules)} stays exactly as it is`);
	}

	// `adding` is not used to vary the facts — what carries over is a property of the
	// business, not of the module — but it is taken so that a module which one day needs a
	// module-specific line has somewhere to put it rather than a new function.
	void adding;

	return lines;
}

/**
 * The same facts as ONE short clause, for the places a list will not fit.
 *
 * The post-add toast ("4 people and your tax settings came across") and the locked state
 * ("It would arrive with your 4 people already loaded") both need a phrase rather than a
 * list, and both must be true of this business or say nothing at all. Null is a real answer:
 * a business with nothing yet gets a shorter sentence rather than an invented one.
 */
export function carryoverSummary(carryover: Carryover): string | null {
	const parts: string[] = [];

	if (carryover.people > 0) {
		parts.push(plural(carryover.people, 'person', 'people'));
	}
	if (carryover.customers > 0) {
		parts.push(plural(carryover.customers, 'customer', 'customers'));
	}
	if (carryover.hasCompanyDetails) {
		parts.push(carryover.hasVatNumber ? 'your VAT details' : 'your company details');
	}

	return parts.length > 0 ? list(parts) : null;
}

function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}

/** "Quoting, Invoicing and Inventory" — the way a person would say it. */
function list(items: readonly string[]): string {
	if (items.length <= 1) return items[0] ?? '';
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
