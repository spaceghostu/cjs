/**
 * A module's accent, as a class Tailwind can actually see.
 *
 * The catalogue stores the accent as a NAME (`quoting`), not a class and not a hex value.
 * That is right for data, and wrong for Tailwind: `text-{accent}` built at runtime is
 * invisible to the scanner, so the utility is never generated and the icon renders with no
 * colour at all — silently, and only in a production build.
 *
 * So the mapping is spelled out. Adding a module means adding its accent here, which is a
 * line of data next to six others rather than a branch anywhere in the shell.
 */
const TEXT: Readonly<Record<string, string>> = Object.freeze({
	quoting: 'text-quoting',
	invoicing: 'text-invoicing',
	inventory: 'text-inventory',
	payroll: 'text-payroll',
	expenses: 'text-expenses',
	bookings: 'text-bookings',
	home: 'text-home'
});

const TINT: Readonly<Record<string, string>> = Object.freeze({
	quoting: 'bg-quoting-tint',
	invoicing: 'bg-invoicing-tint',
	inventory: 'bg-inventory-tint',
	payroll: 'bg-payroll-tint',
	expenses: 'bg-expenses-tint',
	bookings: 'bg-bookings-tint',
	home: 'bg-home-tint'
});

/** Accents are wayfinding, so an unknown one falls back to the neutral rather than nothing. */
export function accentText(accent: string): string {
	return TEXT[accent] ?? TEXT.home;
}

export function accentTint(accent: string): string {
	return TINT[accent] ?? TINT.home;
}
