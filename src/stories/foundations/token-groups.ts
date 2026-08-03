/**
 * The foundations block, as data.
 *
 * Token NAMES only — never values. The story reads every value back off the live
 * stylesheet, so the page cannot drift from `layout.css` and cannot quietly grow a hex
 * literal of its own.
 */

export type TokenSpec = { readonly token: string; readonly role: string };

export const SURFACES: readonly TokenSpec[] = [
	{ token: '--surface-base', role: 'Page background, top bar' },
	{ token: '--surface-sunken', role: 'Sidebar, preview gutters, sticky footers' },
	{ token: '--surface-card', role: 'Cards, table rows, inputs' },
	{ token: '--surface-raised', role: 'Active nav row, selected chip, module rows' },
	{ token: '--surface-overlay', role: 'Dialogs, toasts' },
	{ token: '--surface-quiet', role: 'Draft badge fill' }
];

export const BORDERS: readonly TokenSpec[] = [
	{ token: '--border-row', role: 'Table row separators' },
	{ token: '--border-subtle', role: 'Section dividers, shell seams' },
	{ token: '--border-default', role: 'Card and table outlines' },
	{ token: '--border-control', role: 'Inputs, quiet chips' },
	{ token: '--border-strong', role: 'Overlay edges, secondary buttons' },
	{ token: '--border-hover', role: 'Secondary button hover' }
];

export const TEXT: readonly TokenSpec[] = [
	{ token: '--text-primary', role: 'Default' },
	{ token: '--text-strong-secondary', role: 'Inactive-but-present rows' },
	{ token: '--text-secondary', role: 'Supporting prose' },
	{ token: '--text-muted', role: 'Labels, eyebrows, helper text — contrast floor' }
];

export const BRAND: readonly TokenSpec[] = [
	{ token: '--brand', role: 'Primary action fill' },
	{ token: '--brand-hover', role: 'Hover' },
	{ token: '--brand-active', role: 'Pressed' },
	{ token: '--brand-focus-ring', role: '2px outline, 2px offset' },
	{ token: '--brand-ink', role: 'Brand as text' }
];

export const STATES: readonly TokenSpec[] = [
	{ token: '--state-settled', role: 'Paid, all-clear, matched' },
	{ token: '--state-attention', role: 'Due soon, variance' },
	{ token: '--state-wrong', role: 'Overdue, destructive, validation' }
];

export type AccentSpec = TokenSpec & { readonly tint: string };

export const ACCENTS: readonly AccentSpec[] = [
	{ token: '--accent-quoting', tint: '--accent-quoting-tint', role: 'Quoting' },
	{ token: '--accent-invoicing', tint: '--accent-invoicing-tint', role: 'Invoicing' },
	{ token: '--accent-inventory', tint: '--accent-inventory-tint', role: 'Inventory' },
	{ token: '--accent-payroll', tint: '--accent-payroll-tint', role: 'Payroll' },
	{ token: '--accent-expenses', tint: '--accent-expenses-tint', role: 'Expenses' },
	{ token: '--accent-bookings', tint: '--accent-bookings-tint', role: 'Bookings' },
	{ token: '--accent-home', tint: '--accent-home-tint', role: 'Home (neutral)' }
];

export const PAPER: readonly TokenSpec[] = [
	{ token: '--paper-bg', role: 'Sheet' },
	{ token: '--paper-ink', role: 'Primary text' },
	{ token: '--paper-ink-muted', role: 'Labels, footnotes' },
	{ token: '--paper-rule', role: 'Section rules' },
	{ token: '--paper-rule-light', role: 'Line-item rules' }
];

export type TypeSpec = { readonly className: string; readonly role: string; readonly spec: string };

export const TYPE_SCALE: readonly TypeSpec[] = [
	{ className: 'text-hero', role: 'Hero', spec: '32 / 600 / -0.02em' },
	{ className: 'text-title', role: 'Page title', spec: '24 / 600 / -0.02em' },
	{ className: 'text-section', role: 'Section heading', spec: '20 / 500 / -0.01em' },
	{ className: 'text-body', role: 'Body', spec: '16 / 400' },
	{ className: 'text-ui', role: 'Interface text, table cells', spec: '14 / 400' },
	{ className: 'text-helper', role: 'Helper, timestamps', spec: '12 / 400' },
	{ className: 'eyebrow', role: 'Eyebrow label', spec: '11 / 500 / 0.1em / uppercase' }
];

export type SpaceSpec = { readonly className: string; readonly px: string };

/** The design's 4 / 8 / 12 / 16 / 24 / 32, which is Tailwind's stock scale unchanged. */
export const SPACING: readonly SpaceSpec[] = [
	{ className: 'w-1', px: '4px' },
	{ className: 'w-2', px: '8px' },
	{ className: 'w-3', px: '12px' },
	{ className: 'w-4', px: '16px' },
	{ className: 'w-6', px: '24px' },
	{ className: 'w-8', px: '32px' }
];

export type RadiusSpec = { readonly className: string; readonly role: string; readonly px: string };

export const RADII: readonly RadiusSpec[] = [
	{ className: 'rounded-md', role: 'Controls', px: '8px' },
	{ className: 'rounded-lg', role: 'Cards', px: '12px' },
	{ className: 'rounded-xl', role: 'Dialogs, shell frames', px: '14px' }
];
