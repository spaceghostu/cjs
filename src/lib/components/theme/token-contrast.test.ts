import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	contrastRatio,
	DESIGN_TEXT_FLOOR,
	WCAG_AA_NON_TEXT,
	WCAG_AA_TEXT
} from '$lib/core/color/contrast.js';
import { composite, mixOklab } from '$lib/core/color/mix.js';

/**
 * The design states a 4.6:1 contrast floor. This measures whether `layout.css` actually
 * holds it — in both themes, on every surface a token can land on.
 *
 * It reads the stylesheet rather than a copy of the palette on purpose: a duplicated
 * palette would drift, and the thing that ships is the CSS.
 */

const CSS = readFileSync(
	fileURLToPath(new URL('../../../routes/layout.css', import.meta.url)),
	'utf8'
);

/** Every colour declaration in the top-level rule blocks whose selector matches. */
function declarations(selector: string): Record<string, string> {
	const blocks = CSS.matchAll(/^([^@{}\n][^{}\n]*)\{\n([\s\S]*?)\n\}/gm);
	const found: Record<string, string> = {};

	for (const [, rawSelector, body] of blocks) {
		if (rawSelector.trim() !== selector) continue;
		for (const [, name, value] of body.matchAll(/^\t(--[a-z0-9-]+):\s*([^;]+);/gm)) {
			found[name] = value.trim();
		}
	}
	return found;
}

const OKLAB_MIX = /^color-mix\(in oklab,\s*var\((--[a-z0-9-]+)\)\s*(\d+)%,\s*(white|black)\)$/;
const ALPHA_MIX = /^color-mix\(in srgb,\s*var\((--[a-z0-9-]+)\)\s*(\d+)%,\s*transparent\)$/;
const HEX = /^#[0-9a-f]{3,8}$/i;

/**
 * Resolves the derived half of the palette.
 *
 * Most of the ramp is `color-mix()` rather than a literal, which is the whole point — one
 * ratio derives seven accents and every tenant brand. But an expression cannot be
 * measured, so it is evaluated here with the same maths the browser uses (`mix.ts`, which
 * has its own tests pinning it against real values).
 *
 * Alpha tints resolve to `{ over }`: what they measure to depends on the surface behind
 * them, so they carry their alpha until something asks about a specific surface.
 */
type Resolved = Record<string, string>;
type Tint = { colour: string; alpha: number };

function resolve(raw: Record<string, string>): { colours: Resolved; tints: Record<string, Tint> } {
	const colours: Resolved = {};
	const tints: Record<string, Tint> = {};

	const lookup = (name: string, depth = 0): string | undefined => {
		if (depth > 8) throw new Error(`Cyclic token: ${name}`);
		const value = raw[name];
		if (!value) return undefined;
		if (HEX.test(value)) return value;

		const alias = value.match(/^var\((--[a-z0-9-]+)\)$/);
		if (alias) return lookup(alias[1], depth + 1);

		const mix = value.match(OKLAB_MIX);
		if (mix) {
			const base = lookup(mix[1], depth + 1);
			return base && mixOklab(base, Number(mix[2]), mix[3] === 'white' ? '#ffffff' : '#000000');
		}
		return undefined;
	};

	for (const name of Object.keys(raw)) {
		const alpha = raw[name].match(ALPHA_MIX);
		if (alpha) {
			const colour = lookup(alpha[1]);
			if (colour) tints[name] = { colour, alpha: Number(alpha[2]) / 100 };
			continue;
		}
		const resolved = lookup(name);
		if (resolved) colours[name] = resolved;
	}

	return { colours, tints };
}

const darkRaw = declarations(':root');
const lightRaw = { ...darkRaw, ...declarations('.light') };

const { colours: dark, tints: darkTints } = resolve(darkRaw);
const { colours: light, tints: lightTints } = resolve(lightRaw);

const THEMES = [
	['dark', dark],
	['light', light]
] as const;

/** Every surface a glyph can sit on. */
const SURFACES = [
	'--surface-base',
	'--surface-sunken',
	'--surface-card',
	'--surface-raised',
	'--surface-overlay',
	'--surface-quiet'
] as const;

/** The three layers that carry the bulk of the product's text. */
const READING_SURFACES = ['--surface-base', '--surface-sunken', '--surface-card'] as const;

/** Selected rows, dialogs, quiet fills. Lighter in dark, darker in light — both directions
 * squeeze an accent's contrast, and the design's fixed accent hexes are tuned for the
 * reading surfaces. */
const ELEVATED_SURFACES = ['--surface-raised', '--surface-overlay', '--surface-quiet'] as const;

/** The text ramp, floor last. */
const TEXT = [
	'--text-primary',
	'--text-strong-secondary',
	'--text-secondary',
	'--text-muted'
] as const;

/** Colours that carry text: state labels, module accents, brand-as-ink. */
const INK_ACCENTS = [
	'--state-settled',
	'--state-attention',
	'--state-wrong',
	'--accent-quoting',
	'--accent-invoicing',
	'--accent-inventory',
	'--accent-payroll',
	'--accent-expenses',
	'--accent-bookings',
	'--accent-home',
	'--brand-ink'
] as const;

describe('token extraction', () => {
	it('finds the whole palette in both themes', () => {
		for (const name of [...SURFACES, ...TEXT, ...INK_ACCENTS]) {
			expect(dark[name], `${name} missing from :root`).toMatch(/^#[0-9a-f]{6}$/i);
			expect(light[name], `${name} missing from .light`).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});

	it('derives a genuinely different light theme', () => {
		// Guards the case where `.light` fails to parse and silently falls back to dark.
		expect(light['--surface-base']).not.toBe(dark['--surface-base']);
		expect(light['--text-primary']).not.toBe(dark['--text-primary']);
	});
});

describe.each(THEMES)('%s theme', (_theme, tokens) => {
	describe.each(SURFACES)('on %s', (surface) => {
		// The text ramp is the one thing that has to hold everywhere. If a label can land
		// on a surface at all, it is legible there.
		it.each(TEXT)(`%s clears the ${DESIGN_TEXT_FLOOR}:1 design floor`, (text) => {
			expect(contrastRatio(tokens[text], tokens[surface])).toBeGreaterThanOrEqual(
				DESIGN_TEXT_FLOOR
			);
		});

		it.each(INK_ACCENTS)('%s reads as a non-text mark', (accent) => {
			expect(contrastRatio(tokens[accent], tokens[surface])).toBeGreaterThanOrEqual(
				WCAG_AA_NON_TEXT
			);
		});

		it('--brand-focus-ring is visible against the surface', () => {
			expect(contrastRatio(tokens['--brand-focus-ring'], tokens[surface])).toBeGreaterThanOrEqual(
				WCAG_AA_NON_TEXT
			);
		});
	});

	describe.each(READING_SURFACES)('accent text on %s', (surface) => {
		it.each(INK_ACCENTS)(`%s clears the ${DESIGN_TEXT_FLOOR}:1 design floor`, (accent) => {
			expect(contrastRatio(tokens[accent], tokens[surface])).toBeGreaterThanOrEqual(
				DESIGN_TEXT_FLOOR
			);
		});
	});

	it('--brand-ink clears the design floor on every surface, elevated ones included', () => {
		// The reason --brand-ink exists. Brand-coloured labels turn up inside dialogs and
		// on selected rows, so it is held to a stricter bar than the fixed module accents.
		for (const surface of SURFACES) {
			expect(
				contrastRatio(tokens['--brand-ink'], tokens[surface]),
				`--brand-ink on ${surface}`
			).toBeGreaterThanOrEqual(DESIGN_TEXT_FLOOR);
		}
	});

	it('--decoration-quiet is never good enough for text, which is why it is named that', () => {
		// If this ever passes, the token has drifted into being a text colour and the name
		// stops protecting anyone. #7D7F88 measures 4.22:1 on --surface-card — below both
		// AA and the design's own floor. See README open question 4.
		expect(contrastRatio(tokens['--decoration-quiet'], tokens['--surface-card'])).toBeLessThan(
			WCAG_AA_TEXT
		);
	});
});

describe('paper is theme-invariant', () => {
	it.each(['--paper-bg', '--paper-ink', '--paper-ink-muted', '--paper-rule', '--paper-rule-light'])(
		'%s is not redefined by .light',
		(name) => {
			expect(dark[name]).toBeDefined();
			expect(declarations('.light')[name]).toBeUndefined();
		}
	);

	it('paper ink is legible on paper', () => {
		expect(contrastRatio(dark['--paper-ink'], dark['--paper-bg'])).toBeGreaterThanOrEqual(
			DESIGN_TEXT_FLOOR
		);
	});
});

describe('known deviations', () => {
	/**
	 * Recorded rather than fixed: every value below comes straight from the design, and
	 * changing one is a product decision that belongs to T27's accessibility pass, not to
	 * the token layer. These assertions exist so the pass can find them, and so nobody
	 * "fixes" a value halfway and leaves the rest of the ramp inconsistent.
	 */
	it('pins which accents fall under the design floor on elevated dark surfaces', () => {
		// Module accents are fixed across all tenants, so they cannot be lifted here the
		// way --text-muted and --brand-ink were. The practical rule this encodes: accent
		// text belongs on base / sunken / card. On a selected row, a dialog or a quiet
		// fill, an accent is a dot, a bar or a tint — not a word.
		const below: string[] = [];
		for (const accent of INK_ACCENTS) {
			if (accent === '--brand-ink') continue;
			for (const surface of ELEVATED_SURFACES) {
				const ratio = contrastRatio(dark[accent], dark[surface]);
				if (ratio < DESIGN_TEXT_FLOOR) below.push(`${accent} on ${surface}`);
			}
		}

		expect(below.sort()).toEqual([
			'--accent-payroll on --surface-overlay',
			'--accent-payroll on --surface-quiet',
			'--accent-payroll on --surface-raised',
			'--accent-quoting on --surface-raised',
			'--state-wrong on --surface-overlay',
			'--state-wrong on --surface-quiet',
			'--state-wrong on --surface-raised'
		]);
	});
});

describe('the primary button', () => {
	it('carries its white label at the design floor', () => {
		// The design states #5B6CFF for the fill and white for the label; together they are
		// 4.17:1, under the design's own 4.6:1. The fill was darkened by the smallest step
		// that earns the white — this is the assertion that keeps it earned.
		expect(contrastRatio(dark['--text-on-brand'], dark['--brand'])).toBeGreaterThanOrEqual(
			DESIGN_TEXT_FLOOR
		);
	});

	it('reads as a control against the surfaces it sits on', () => {
		// --surface-raised is the exception, at 2.95:1. WCAG 1.4.11 does not apply to a
		// component whose visible LABEL carries the contrast, and that label is at 4.74:1 —
		// but a bare brand-filled shape with no text on a selected row would be too quiet.
		for (const surface of ['--surface-base', '--surface-sunken', '--surface-card'] as const) {
			expect(contrastRatio(dark['--brand'], dark[surface])).toBeGreaterThanOrEqual(
				WCAG_AA_NON_TEXT
			);
		}
	});
});

describe.each([
	['dark', dark, darkTints],
	['light', light, lightTints]
] as const)('%s theme — ink on a tint', (_theme, tokens, tints) => {
	/**
	 * A tinted pill moves its own background toward its own colour, which eats the very
	 * contrast the colour was providing. --state-wrong on a 15% wrong tint measures 4.16:1
	 * and every module accent lands around 4.2–4.4 the same way, so a badge draws its text
	 * from the -ink partner rather than from the colour it is tinted with.
	 */
	const PAIRS = Object.keys(tints)
		.filter((name) => name.endsWith('-tint'))
		.map((tint) => ({ tint, ink: tint.replace(/-tint$/, '-ink') }));

	it('every tinted colour has an ink partner', () => {
		expect(PAIRS.length).toBeGreaterThan(0);
		for (const { tint, ink } of PAIRS) {
			expect(tokens[ink], `${ink} missing for ${tint}`).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});

	it.each(PAIRS)('$ink clears the design floor on $tint, on every surface', ({ tint, ink }) => {
		for (const surface of SURFACES) {
			const painted = composite(tints[tint].colour, tints[tint].alpha, tokens[surface]);
			expect(
				contrastRatio(tokens[ink], painted),
				`${ink} on ${tint} over ${surface}`
			).toBeGreaterThanOrEqual(DESIGN_TEXT_FLOOR);
		}
	});
});

describe('the per-tenant brand ramp', () => {
	/**
	 * The four options a tenant can pick, run through the same derivation `[data-brand]`
	 * applies. A colour that only works for the default would be a defect nobody sees
	 * until a customer picks teal.
	 */
	const OPTIONS = ['#5464EE', '#277E94', '#8660BF', '#2A835B'];

	it.each(OPTIONS)('%s carries a white label at rest, hover and active', (brand) => {
		const hover = mixOklab(brand, 92, '#000000');
		const active = mixOklab(brand, 84, '#000000');

		for (const [state, fill] of [
			['rest', brand],
			['hover', hover],
			['active', active]
		] as const) {
			expect(contrastRatio(dark['--text-on-brand'], fill), state).toBeGreaterThanOrEqual(
				DESIGN_TEXT_FLOOR
			);
		}
	});

	it.each(OPTIONS)('%s has an ink that works on every surface, in both themes', (brand) => {
		for (const [tokens, ink] of [
			[dark, mixOklab(brand, 66, '#ffffff')],
			[light, mixOklab(brand, 84, '#000000')]
		] as const) {
			for (const surface of SURFACES) {
				expect(contrastRatio(ink, tokens[surface]), `${ink} on ${surface}`).toBeGreaterThanOrEqual(
					DESIGN_TEXT_FLOOR
				);
			}
		}
	});

	it.each(OPTIONS)('%s has a focus ring visible on every surface, in both themes', (brand) => {
		for (const [tokens, ring] of [
			[dark, mixOklab(brand, 55, '#ffffff')],
			[light, mixOklab(brand, 92, '#000000')]
		] as const) {
			for (const surface of SURFACES) {
				expect(
					contrastRatio(ring, tokens[surface]),
					`${ring} on ${surface}`
				).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
			}
		}
	});

	it('matches what layout.css declares for the default', () => {
		// The options list lives in `brand.ts` and the default lives in the stylesheet.
		// This is the assertion that keeps them the same colour.
		expect(dark['--brand'].toLowerCase()).toBe(OPTIONS[0].toLowerCase());
	});
});
