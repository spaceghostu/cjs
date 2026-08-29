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
 *
 * ---------------------------------------------------------------------------------------
 * HOW TO ADD A TOKEN
 * ---------------------------------------------------------------------------------------
 * Every list this file measures used to be typed out by hand, which meant a token added to
 * `layout.css` was measured only if somebody remembered to come here and add it a second
 * time. Nobody ever remembers. The lists are now DERIVED from the stylesheet by naming
 * convention, and `classify()` below is the whole convention in one function.
 *
 * The consequence, which is the point: a token whose name matches none of the rules lands
 * in the `unclassified` bucket and fails `classifies every token the design block declares`
 * BY NAME. That failure is not an obstacle to route around — it is the contrast decision
 * being asked for at the moment the token is created rather than skipped for good. Either
 * name the token so it falls into the bucket that describes what it is, or add a rule to
 * `classify()` and say in prose what that new kind of token is held to.
 *
 * Three things are deliberately classified but NOT measured. Each exclusion below was
 * measured before it was written down, rather than assumed:
 *
 *   `border` — light `--state-wrong-border-quiet` is 2.26:1 on `--surface-base`, so a
 *     blanket 3:1 check would fail on the first run. A border is a hint at the edge of a
 *     control whose contrast is carried by the control's own label and fill; WCAG 1.4.11
 *     does not ask every rule in a UI to clear 3:1. If a border ever becomes the ONLY
 *     thing distinguishing a state, it needs its own assertion, not this comment.
 *   `--brand-ring-soft` — the other half of the `ring` bucket, and the only member of a
 *     measured bucket that is exempt. It is the brand at 28% alpha, and by construction it
 *     cannot clear 3:1 against anything: it is a widening glow, not an indicator. The
 *     indicator on a focused input is `focus-visible:border-brand` beside it (see
 *     `input.svelte:19`), and `--brand` against the reading surfaces IS measured, in `the
 *     primary button` below. `--brand-focus-ring`, which is the indicator everywhere else,
 *     is measured on all six surfaces in both themes.
 *   `non-colour` — `--radius*` and `--motion-*` are lengths and easings. There is nothing
 *     to measure. They are classified anyway so exhaustiveness accounts for them instead
 *     of skipping anything it does not recognise.
 *
 * And two lists stay hand-written on purpose: READING_SURFACES and ELEVATED_SURFACES.
 * Which layers a paragraph is actually drawn on is a semantic judgement about the product,
 * not a fact recoverable from a name, and inventing a convention that pretended otherwise
 * would be a lie in a file whose whole job is to not lie. The guarantee comes from the
 * other side instead — the two lists are asserted to partition SURFACES exactly, so a new
 * surface breaks the suite until somebody decides which kind it is.
 */

const CSS = readFileSync(
	fileURLToPath(new URL('../../../routes/layout.css', import.meta.url)),
	'utf8'
);

/**
 * Every colour declaration in the top-level rule blocks whose selector matches, ONE MAP PER
 * BLOCK rather than one merged map.
 *
 * Block provenance is load-bearing. `layout.css` declares `:root` twice: the design palette
 * near the top and the shadcn compatibility aliases near the bottom, which are 32 pure
 * `var()` references and explicitly say of themselves that they are "aliases, never
 * independent values". Merging the two would mean classifying `--accent-foreground` as a
 * module accent and `--card` as a surface, and every one of those would fail immediately.
 *
 * Note what is NOT used to tell them apart: the shape of the value. "Skip anything whose
 * value is a `var()`" would look equivalent and would quietly reopen the hole this file
 * exists to close — `--text-whisper: var(--decoration-quiet)` added to the DESIGN block is
 * a real text token pointing at a colour that measures 4.22:1 on `--surface-card`, and a
 * value-shaped rule would wave it through as "just an alias". Classification is by name,
 * over the design block only; `resolve()` follows the alias afterwards to get something
 * measurable.
 */
function blocks(selector: string): Record<string, string>[] {
	const matches = CSS.matchAll(/^([^@{}\n][^{}\n]*)\{\n([\s\S]*?)\n\}/gm);
	const found: Record<string, string>[] = [];

	for (const [, rawSelector, body] of matches) {
		if (rawSelector.trim() !== selector) continue;
		const block: Record<string, string> = {};
		for (const [, name, value] of body.matchAll(/^\t(--[a-z0-9-]+):\s*([^;]+);/gm)) {
			block[name] = value.trim();
		}
		found.push(block);
	}
	return found;
}

/** The same declarations flattened, which is what the cascade leaves a browser holding. */
function declarations(selector: string): Record<string, string> {
	const merged: Record<string, string> = {};
	for (const block of blocks(selector)) Object.assign(merged, block);
	return merged;
}

const ROOT_BLOCKS = blocks(':root');
const [DESIGN_RAW, COMPAT_RAW] = ROOT_BLOCKS;
const LIGHT_RAW = declarations('.light');

/** The per-tenant re-derivation. Three blocks, because the ramp differs by theme. */
const BRAND_RAW = declarations('[data-brand]');
const BRAND_DARK_RAW = declarations(':root:not(.light) [data-brand]');
const BRAND_LIGHT_RAW = declarations('.light [data-brand]');

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
const lightRaw = { ...darkRaw, ...LIGHT_RAW };

const { colours: dark, tints: darkTints } = resolve(darkRaw);
const { colours: light, tints: lightTints } = resolve(lightRaw);

const THEMES = [
	['dark', dark],
	['light', light]
] as const;

/**
 * ---------------------------------------------------------------------------------------
 * THE NAMING CONVENTION, AS CODE
 * ---------------------------------------------------------------------------------------
 * The prose version lives at the top of this file and again in `layout.css`, next to where
 * a token is actually added. This is the same rule in a form that can fail a build.
 *
 * ORDER IS LOAD-BEARING. First match wins, and three of the rules only work because of
 * where they sit:
 *
 *   `--paper-*` must precede the `-ink` rule. `--paper-ink` ends in `-ink` but has no
 *     `--paper-tint` partner and never will — paper is a printed sheet, not a pill — so
 *     letting it reach the ink bucket would break the partnership assertion for a token
 *     that is behaving perfectly.
 *   `--text-on-*` must precede `--text-*`. `--text-on-brand` is #ffffff and only ever sits
 *     on a brand fill; measured against the six surfaces it would fail on the first one.
 *     What it IS held to is its own fill, plus that fill's hover and active states.
 *   the border rule must precede the single-word mark rule. `--state-wrong-border` and
 *     `--state-wrong-border-quiet` are outlines, not marks; the mark regex is deliberately
 *     single-word (`--state-wrong`, `--accent-quoting`) so it admits the colour itself and
 *     excludes every -border, -tint and -ink sibling of it.
 */
type Bucket =
	| 'non-colour'
	| 'paper'
	| 'on-fill'
	| 'text'
	| 'surface'
	| 'decoration'
	| 'border'
	| 'tint'
	| 'ink'
	| 'mark'
	| 'ring'
	| 'brand-fill'
	| 'unclassified';

const CONVENTION: readonly (readonly [RegExp, Bucket])[] = [
	[/^--(radius|motion)/, 'non-colour'],
	[/^--paper-/, 'paper'],
	[/^--text-on-/, 'on-fill'],
	[/^--text-/, 'text'],
	[/^--surface-/, 'surface'],
	[/^--decoration-/, 'decoration'],
	[/^--border-|-border(-[a-z]+)?$/, 'border'],
	[/-tint$/, 'tint'],
	[/-ink$/, 'ink'],
	[/^--(state|accent)-[a-z]+$/, 'mark'],
	[/^--brand-(focus-ring|ring-soft)$/, 'ring'],
	[/^--brand(-hover|-active)?$/, 'brand-fill']
];

function classify(name: string): Bucket {
	for (const [pattern, bucket] of CONVENTION) {
		if (pattern.test(name)) return bucket;
	}
	return 'unclassified';
}

/** Every token in the design block that falls into `bucket`, in declaration order. */
function bucketOf(bucket: Bucket): string[] {
	return Object.keys(DESIGN_RAW).filter((name) => classify(name) === bucket);
}

/** Every surface a glyph can sit on. Derived: `--surface-*` is a place, and a place is
 * measured under every text token in the ramp. */
const SURFACES = bucketOf('surface');

/** The three layers that carry the bulk of the product's text. Hand-written on purpose —
 * see the note at the top of this file about why no naming convention can derive it. */
const READING_SURFACES = ['--surface-base', '--surface-sunken', '--surface-card'] as const;

/** Selected rows, dialogs, quiet fills. Lighter in dark, darker in light — both directions
 * squeeze an accent's contrast, and the design's fixed accent hexes are tuned for the
 * reading surfaces. */
const ELEVATED_SURFACES = ['--surface-raised', '--surface-overlay', '--surface-quiet'] as const;

/** The text ramp, floor last — declaration order in `layout.css` IS the ramp. */
const TEXT = bucketOf('text');

/** White-on-a-fill. Held to its fill rather than to the surfaces, because it never lands
 * on a surface. */
const ON_FILLS = bucketOf('on-fill');

/**
 * Colours that carry text: state labels, module accents, brand-as-ink.
 *
 * The marks derive from the convention; `--brand-ink` is named explicitly because it is
 * held to a STRICTER bar than the rest — all six surfaces rather than the reading three —
 * and no naming rule carries that. See the assertion that spells it out below.
 */
const INK_ACCENTS = [...bucketOf('mark'), '--brand-ink'];

const TINTS = bucketOf('tint');
const INKS = bucketOf('ink');

/** `--text-on-brand` is held to `--brand`, `--brand-hover` and `--brand-active`. */
function fillsUnder(onFill: string, tokens: Resolved): string[] {
	const fill = onFill.replace(/^--text-on-/, '--');
	return [fill, `${fill}-hover`, `${fill}-active`].filter((name) => tokens[name]);
}

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

describe('the token inventory', () => {
	/**
	 * This block is the machinery. Everything else in the file measures colours; these
	 * assertions measure whether the file is still looking at all of them.
	 */
	it('finds the design block and the alias block, in that order', () => {
		// A reordering of the stylesheet would otherwise swap the two silently, and every
		// classification below would then be running over the wrong 32 names.
		expect(ROOT_BLOCKS).toHaveLength(2);
		expect(DESIGN_RAW['--surface-base']).toBeDefined();
		expect(COMPAT_RAW['--background']).toBeDefined();
		expect(DESIGN_RAW['--background']).toBeUndefined();
	});

	it('classifies every token the design block declares', () => {
		// THE assertion this rewrite exists for. A token nobody has decided about fails here
		// by its own name, and the message tells the next person exactly what to do.
		const unclassified = Object.keys(DESIGN_RAW).filter(
			(name) => classify(name) === 'unclassified'
		);

		expect(
			unclassified,
			'These tokens match no naming rule, so nothing measures them. Rename them into a ' +
				'bucket, or add a rule to CONVENTION and say what the new kind is held to.'
		).toEqual([]);
	});

	it('classifies every token the per-tenant brand blocks declare', () => {
		// The ramp is re-declared three times for `[data-brand]`, and an exhaustiveness check
		// that walked only `:root` would let a new --brand-* token escape through any of them.
		const names = [
			...Object.keys(BRAND_RAW),
			...Object.keys(BRAND_DARK_RAW),
			...Object.keys(BRAND_LIGHT_RAW)
		];

		expect(names.filter((name) => classify(name) === 'unclassified')).toEqual([]);
	});

	it('holds the alias block to being nothing but aliases', () => {
		// The block says of itself: "These are aliases, never independent values." This is
		// that sentence as a test. If one of them ever becomes a literal it is a new colour
		// that no bucket measures, because classification deliberately skips this block.
		expect(Object.keys(COMPAT_RAW).length).toBeGreaterThan(0);

		for (const [name, value] of Object.entries(COMPAT_RAW)) {
			const alias = value.match(/^var\((--[a-z0-9-]+)\)$/);
			expect(alias, `${name} is ${value}, which is not an alias`).not.toBeNull();
			expect(
				DESIGN_RAW[alias![1]],
				`${name} points at ${alias![1]}, which does not exist`
			).toBeDefined();
		}
	});

	it('measures every surface: reading and elevated together are the whole list', () => {
		// The other half of the hand-written-lists decision. Adding `--surface-deep` to
		// layout.css breaks this until somebody says which kind of surface it is — which is
		// the same forcing function as the exhaustiveness check, from the semantic side.
		expect([...READING_SURFACES, ...ELEVATED_SURFACES].sort()).toEqual([...SURFACES].sort());
	});

	it('declares nothing in .light that the design block does not already declare', () => {
		// `lightRaw` is built by spreading `.light` OVER the dark block, so a token that only
		// exists in `.light` is in the light theme and in no list derived from the design
		// block — never measured in dark, and never classified at all. Empty today.
		const lightOnly = Object.keys(LIGHT_RAW).filter((name) => !(name in DESIGN_RAW));
		expect(lightOnly).toEqual([]);
	});

	it('pairs every tint with an ink and every ink with a tint', () => {
		// One-way was not enough: adding `--accent-jobs` and `--accent-jobs-tint` while
		// forgetting `--accent-jobs-ink` would have passed, and the badge would then draw its
		// label in the colour it is tinted with — the exact mistake the -ink family exists to
		// prevent. Paper is excluded by classification, not by an exception: `--paper-ink` is
		// in the `paper` bucket and never reaches here.
		expect(TINTS.length).toBeGreaterThan(0);

		for (const tint of TINTS) {
			expect(INKS, `${tint} has no -ink partner`).toContain(tint.replace(/-tint$/, '-ink'));
		}
		for (const ink of INKS) {
			expect(TINTS, `${ink} has no -tint partner`).toContain(ink.replace(/-ink$/, '-tint'));
		}
	});

	it('derives at least as many tokens as the hand-written lists it replaced', () => {
		// A ratchet, not a census. The lists this file used to type out by hand held six
		// surfaces, four text steps and eleven ink accents; a derived list that came back
		// SHORTER would mean a green suite measuring fewer pairs than before, which is the
		// one failure mode this whole rewrite would otherwise introduce.
		expect(SURFACES.length).toBeGreaterThanOrEqual(6);
		expect(TEXT.length).toBeGreaterThanOrEqual(4);
		expect(INK_ACCENTS.length).toBeGreaterThanOrEqual(11);
		expect(ON_FILLS.length).toBeGreaterThanOrEqual(1);
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

	/**
	 * The general rule behind `the primary button` below: a `--text-on-X` token is measured
	 * against the fill X names, and against that fill's hover and active states — because a
	 * label does not stop being a label while a thumb is on it, and hover and active are the
	 * two places a fill moves without the label moving with it.
	 */
	it.each(ON_FILLS)(`%s clears the design floor at rest, hover and active`, (onFill) => {
		const fills = fillsUnder(onFill, tokens);
		expect(fills.length).toBeGreaterThan(0);

		for (const fill of fills) {
			expect(
				contrastRatio(tokens[onFill], tokens[fill]),
				`${onFill} on ${fill}`
			).toBeGreaterThanOrEqual(DESIGN_TEXT_FLOOR);
		}
	});

	it('--decoration-quiet is never good enough for text, which is why it is named that', () => {
		// If this ever passes, the token has drifted into being a text colour and the name
		// stops protecting anyone. #7D7F88 measures 4.22:1 on --surface-card — below both
		// AA and the design's own floor.
		//
		// Deliberately scoped to --surface-card and NOT generalised to every surface: in
		// dark the same colour measures 4.80:1 on --surface-base and 4.62:1 on
		// --surface-sunken, so a blanket "fails everywhere" assertion would fail on the
		// first run. What is being pinned is that the token is unusable on the surface most
		// helper text is drawn on, which is what makes the name honest.
		expect(contrastRatio(tokens['--decoration-quiet'], tokens['--surface-card'])).toBeLessThan(
			WCAG_AA_TEXT
		);
	});
});

describe('paper is theme-invariant', () => {
	it.each(bucketOf('paper'))('%s is not redefined by .light', (name) => {
		expect(dark[name]).toBeDefined();
		expect(LIGHT_RAW[name]).toBeUndefined();
	});

	it('paper ink is legible on paper', () => {
		expect(contrastRatio(dark['--paper-ink'], dark['--paper-bg'])).toBeGreaterThanOrEqual(
			DESIGN_TEXT_FLOOR
		);
	});

	it('paper muted ink is legible on paper', () => {
		expect(contrastRatio(dark['--paper-ink-muted'], dark['--paper-bg'])).toBeGreaterThanOrEqual(
			DESIGN_TEXT_FLOOR
		);
	});
});

/**
 * The four surfaces a FORM sits on, which is a shorter list than the six a glyph can land on.
 *
 * A form is a page, a card, or a dialog. It is never a selected nav row (`--surface-raised`)
 * and never a draft badge's fill (`--surface-quiet`) — those are marks, not places you type.
 * That is the whole reason this list can exist: `--state-wrong` measures 4.20:1 on raised and
 * 4.49:1 on quiet in the dark theme and would fail below, but no field error is ever drawn on
 * either, and the assertion in `known deviations` already records that fact rather than hiding
 * it.
 */
const FORM_SURFACES = [
	'--surface-base',
	'--surface-sunken',
	'--surface-card',
	'--surface-overlay'
] as const;

describe.each(THEMES)('%s theme — the message under a field', (_theme, tokens) => {
	/**
	 * The design draws the invalid message in `--state-wrong` at 12px, and 12px is small text,
	 * so it is held to the text bar rather than the non-text one. `--surface-overlay` is the
	 * tight one — 4.55:1 in dark, above WCAG AA and below the design's own 4.6 floor — and it
	 * is the surface every dialog in the product uses, which is why it is measured here rather
	 * than assumed from the reading-surface pass above.
	 *
	 * If this fails, the fix is the token or the surface, not this number. A field error that
	 * cannot be read is a field error that did not happen.
	 */
	it.each(FORM_SURFACES)('--state-wrong is legible as 12px text on %s', (surface) => {
		expect(
			contrastRatio(tokens['--state-wrong'], tokens[surface]),
			`--state-wrong on ${surface}`
		).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
	});
});

describe('known deviations', () => {
	/**
	 * Recorded rather than fixed: every value below comes straight from the design, and the
	 * module accents are fixed across all tenants, so they cannot be lifted the way
	 * `--text-muted` and `--brand-ink` were without changing what a module looks like for
	 * everybody.
	 *
	 * ---------------------------------------------------------------------------------------
	 * THE ACCESSIBILITY PASS'S VERDICT ON THESE SEVEN — closed, not deferred.
	 * ---------------------------------------------------------------------------------------
	 * All seven are below the design's 4.6:1 floor; FOUR are also below WCAG AA's 4.5:1
	 * (`--state-wrong` on raised and on quiet, `--accent-payroll` on raised,
	 * `--accent-quoting` on raised). The criterion is that the floor holds on the surface a
	 * word ACTUALLY sits on, so each of the four was traced to where the colour is painted:
	 *
	 *   `--accent-*` on `--surface-raised` happens in exactly one place, the active sidebar
	 *     row. `AppSidebar.svelte` sets the raised background at line 89
	 *     (`class:bg-surface-raised={active}`) and the accent lands on the ICON at lines
	 *     103-108, which carries `aria-hidden="true"`. The row's label right beside it is
	 *     `text-ink`. Nothing there is a word in an accent.
	 *   `--state-wrong` as a word never lands on raised or quiet. `SaveState.svelte:29` puts
	 *     the raw colour on an aria-hidden icon and the WORDS in `--state-wrong-ink` at line
	 *     30. `FieldError.svelte:59` draws in `text-wrong`, but only ever on the four
	 *     FORM_SURFACES, which the block above already measures at the AA bar. The
	 *     destructive `Button` variant declares `text-wrong` at `button.svelte:43` and hovers
	 *     to `wrong-tint` at line 44 — never to raised. And `CountHeader.svelte:100` draws a
	 *     word in raw `text-wrong`, on `--surface-base`, where it measures 5.75:1 in dark and
	 *     5.76:1 in light.
	 *
	 * `CountHeader` is named rather than quietly left out: it is what a reader greping for
	 * `text-wrong` will find, and a list that stopped one call site short would read as
	 * refuted. It is fine where it is and would break if that header ever moved onto a
	 * raised or quiet surface — which is precisely what this assertion is here to catch.
	 *
	 * So: no token value changes. The practical rule the seven encode is the one the design
	 * already states — accent text belongs on base, sunken and card. On a selected row, a
	 * dialog or a quiet fill, an accent is a dot, a bar or a tint, not a word.
	 */
	it('pins which accents fall under the design floor on elevated dark surfaces', () => {
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
		// The named specimen for the general `--text-on-X` rule above. The design states
		// #5B6CFF for the fill and white for the label; together they are 4.17:1, under the
		// design's own 4.6:1. The fill was darkened by the smallest step that earns the white
		// — this is the assertion that keeps it earned, at the one pairing the design named.
		expect(contrastRatio(dark['--text-on-brand'], dark['--brand'])).toBeGreaterThanOrEqual(
			DESIGN_TEXT_FLOOR
		);
	});

	it('reads as a control against the surfaces it sits on', () => {
		// --surface-raised is the exception, at 2.95:1. WCAG 1.4.11 does not apply to a
		// component whose visible LABEL carries the contrast, and that label is at 4.74:1 —
		// but a bare brand-filled shape with no text on a selected row would be too quiet.
		for (const surface of READING_SURFACES) {
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
	 *
	 * That every tint HAS an ink partner, in both directions, is asserted once in `the token
	 * inventory` above rather than here — this block is about what the pair measures to.
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
	 *
	 * The ramp is READ OUT OF THE STYLESHEET rather than restated here. It used to be three
	 * pairs of hardcoded percentages — 92/84, 66/84, 55/92 — which agreed with `layout.css`
	 * on the day they were typed and would have gone on passing while measuring last month's
	 * colours the day somebody retuned the ramp.
	 *
	 * Each option is resolved over the MERGED map rather than over the brand block alone,
	 * because `.light [data-brand]` sets `--brand-focus-ring: var(--brand-hover)` while
	 * `--brand-hover` is declared in a different block; a resolver run over one block would
	 * dead-end on that alias.
	 */
	const OPTIONS = ['#5464EE', '#277E94', '#8660BF', '#2A835B'];

	function tenant(option: string, theme: 'dark' | 'light'): Resolved {
		const base = theme === 'dark' ? darkRaw : lightRaw;
		const override = theme === 'dark' ? BRAND_DARK_RAW : BRAND_LIGHT_RAW;
		return resolve({ ...base, ...BRAND_RAW, ...override, '--brand': option }).colours;
	}

	it.each(OPTIONS)('%s carries a white label at rest, hover and active', (brand) => {
		const ramp = tenant(brand, 'dark');

		for (const state of ['--brand', '--brand-hover', '--brand-active']) {
			expect(contrastRatio(ramp['--text-on-brand'], ramp[state]), state).toBeGreaterThanOrEqual(
				DESIGN_TEXT_FLOOR
			);
		}
	});

	it.each(OPTIONS)('%s has an ink that works on every surface, in both themes', (brand) => {
		for (const theme of ['dark', 'light'] as const) {
			const ramp = tenant(brand, theme);
			for (const surface of SURFACES) {
				expect(
					contrastRatio(ramp['--brand-ink'], ramp[surface]),
					`${theme} --brand-ink on ${surface}`
				).toBeGreaterThanOrEqual(DESIGN_TEXT_FLOOR);
			}
		}
	});

	it.each(OPTIONS)('%s has a focus ring visible on every surface, in both themes', (brand) => {
		for (const theme of ['dark', 'light'] as const) {
			const ramp = tenant(brand, theme);
			for (const surface of SURFACES) {
				expect(
					contrastRatio(ramp['--brand-focus-ring'], ramp[surface]),
					`${theme} --brand-focus-ring on ${surface}`
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
