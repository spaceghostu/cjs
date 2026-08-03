/**
 * Per-tenant brand colour.
 *
 * Only `--brand` is per-tenant. Module accents and the whole neutral ramp stay fixed, so a
 * client's colour can sit on a quote without fighting the interface. The rest of the brand
 * ramp — hover, active, focus ring, ink — re-derives in CSS from whatever `--brand` is set
 * to; see the `[data-brand]` blocks in `src/routes/layout.css`.
 *
 * T01 provides the hook only. Storing the chosen value against a business is T04/T10.
 */

/**
 * The design's four prop options, each darkened by the smallest amount that lets a white
 * label on it clear 4.6:1 — the design's own stated floor, which its stated values missed
 * by between 0.1 and 0.9. The hue is untouched, so each still reads as the colour it was.
 *
 *   Indigo  #5B6CFF -> #5464EE      Violet  #8A63C4 -> #8660BF
 *   Teal    #2E8FA8 -> #277E94      Green   #2E8F63 -> #2A835B
 */
export const BRAND_OPTIONS = [
	{ value: '#5464EE', label: 'Indigo' },
	{ value: '#277E94', label: 'Teal' },
	{ value: '#8660BF', label: 'Violet' },
	{ value: '#2A835B', label: 'Green' }
] as const;

export type BrandColor = (typeof BRAND_OPTIONS)[number]['value'];

/** What a business renders as until it picks something. Matches `--brand` in `layout.css`. */
export const DEFAULT_BRAND: BrandColor = BRAND_OPTIONS[0].value;

/**
 * Narrows an arbitrary string — a database column, a form field — to a known brand.
 *
 * Brand colour reaches the DOM as an inline style, so an unvalidated value is a style
 * injection. Everything that crosses that boundary goes through here first.
 */
export function isBrandColor(value: unknown): value is BrandColor {
	return (
		typeof value === 'string' &&
		BRAND_OPTIONS.some((option) => option.value.toLowerCase() === value.toLowerCase())
	);
}

/** Falls back to the default rather than throwing — a bad colour must not blank a screen. */
export function toBrandColor(value: unknown): BrandColor {
	if (!isBrandColor(value)) return DEFAULT_BRAND;
	return BRAND_OPTIONS.find((option) => option.value.toLowerCase() === value.toLowerCase())!.value;
}

export type BrandAttrs = { 'data-brand'?: string; style?: string };

/**
 * Attributes to spread onto the shell root so the tenant's colour is present in the
 * server-rendered HTML — no flash, no client round-trip.
 *
 * ```svelte
 * <div class="shell" {...brandAttrs(business.brandColor)}>
 * ```
 *
 * The default returns nothing at all — `:root` already derives that exact ramp, so the
 * commonest tenant carries no inline style and no extra attribute.
 */
export function brandAttrs(value: unknown): BrandAttrs {
	const brand = toBrandColor(value);
	if (brand === DEFAULT_BRAND) return {};
	return { 'data-brand': '', style: `--brand: ${brand};` };
}
