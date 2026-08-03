/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * The design states a 4.6:1 floor and names `--text-muted` as the quietest text permitted.
 * That claim is only worth anything if something measures it, which is what this exists
 * for — see `src/lib/components/theme/token-contrast.test.ts`.
 *
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

/** WCAG AA for text below 18.66px bold / 24px regular. */
export const WCAG_AA_TEXT = 4.5;

/** WCAG AA for large text, icons, focus rings and other non-text UI. */
export const WCAG_AA_NON_TEXT = 3;

/** The design's own floor, stricter than AA. Nothing that carries a glyph may go below it. */
export const DESIGN_TEXT_FLOOR = 4.6;

export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Parses `#rgb` or `#rrggbb` into 0-255 channels. Throws — a bad token is a bug, not input. */
export function parseHex(hex: string): Rgb {
	const value = hex.trim();
	if (!HEX.test(value)) throw new Error(`Not a hex colour: ${hex}`);

	const digits =
		value.length === 4
			? value
					.slice(1)
					.split('')
					.map((d) => d + d)
					.join('')
			: value.slice(1);

	return {
		r: parseInt(digits.slice(0, 2), 16),
		g: parseInt(digits.slice(2, 4), 16),
		b: parseInt(digits.slice(4, 6), 16)
	};
}

const linearize = (channel: number): number => {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance(hex: string): number {
	const { r, g, b } = parseHex(hex);
	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** Symmetric: order of the two colours does not matter. Range 1..21. */
export function contrastRatio(a: string, b: string): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	const lighter = Math.max(la, lb);
	const darker = Math.min(la, lb);
	return (lighter + 0.05) / (darker + 0.05);
}
