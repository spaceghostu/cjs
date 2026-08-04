/**
 * A catalogue accent, narrowed to the set `<StatDelta>` can draw.
 *
 * The catalogue stores accents as names and one module — Job scheduling — deliberately has
 * none of its own, borrowing Home's. `DeltaAccent` is the closed set T03 defined for the
 * confirmation's big number, so this is the one place the two lists meet.
 *
 * A module without its own accent falls back to `brand` rather than to Home's blue: on the
 * confirmation the coloured figure means "this module", and borrowing the Home accent there
 * would say "your dashboard" instead.
 */
import type { DeltaAccent } from '$lib/components/money';

const DELTA_ACCENTS = new Set<string>([
	'quoting',
	'invoicing',
	'inventory',
	'payroll',
	'expenses',
	'bookings'
]);

export function deltaAccent(accent: string): DeltaAccent {
	return DELTA_ACCENTS.has(accent) ? (accent as DeltaAccent) : 'brand';
}
