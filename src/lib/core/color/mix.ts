/**
 * The two colour operations `layout.css` performs, done the same way here.
 *
 * The token layer derives most of its ramp with `color-mix()` rather than by hand, which
 * is what keeps a per-tenant brand and a seven-module accent family consistent without
 * seventy literals. The cost is that a stylesheet full of expressions cannot be measured
 * by reading hex out of it — so these reproduce what the browser does, and the contrast
 * test resolves the expressions before measuring them.
 *
 * Both are exact reimplementations of the CSS spec, not approximations:
 * https://www.w3.org/TR/css-color-5/#color-mix
 * https://bottosson.github.io/posts/oklab/
 */
import { parseHex, type Rgb } from './contrast.js';

const clamp255 = (v: number) => Math.min(255, Math.max(0, v));

const toHex = ({ r, g, b }: Rgb): string =>
	'#' +
	[r, g, b]
		// eslint-disable-next-line no-restricted-syntax -- an sRGB channel is not money.
		.map((v) => Math.round(clamp255(v)).toString(16).padStart(2, '0'))
		.join('');

const toLinear = (channel: number): number => {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (c: number): number =>
	255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

type Oklab = readonly [number, number, number];

function toOklab(hex: string): Oklab {
	const { r, g, b } = parseHex(hex);
	const [lr, lg, lb] = [r, g, b].map(toLinear);
	const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
	const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
	const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}

function fromOklab([L, a, b]: Oklab): string {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return toHex({
		r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
	});
}

/** `color-mix(in oklab, a percent%, b)`. */
export function mixOklab(a: string, percent: number, b: string): string {
	const t = percent / 100;
	const [al, aa, ab] = toOklab(a);
	const [bl, ba, bb] = toOklab(b);
	return fromOklab([al * t + bl * (1 - t), aa * t + ba * (1 - t), ab * t + bb * (1 - t)]);
}

/**
 * What a translucent fill actually looks like once it is painted.
 *
 * `color-mix(in srgb, X 15%, transparent)` is not a colour a contrast checker can use —
 * it depends on what is behind it. A 15% tint of a state colour on a card is a different
 * measurement from the same tint on a dialog, and both have to hold.
 */
export function composite(foreground: string, alpha: number, background: string): string {
	const fg = parseHex(foreground);
	const bg = parseHex(background);
	return toHex({
		r: fg.r * alpha + bg.r * (1 - alpha),
		g: fg.g * alpha + bg.g * (1 - alpha),
		b: fg.b * alpha + bg.b * (1 - alpha)
	});
}
