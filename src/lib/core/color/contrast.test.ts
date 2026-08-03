import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex, relativeLuminance } from './contrast.js';

describe('parseHex', () => {
	it('reads six-digit hex', () => {
		expect(parseHex('#5B6CFF')).toEqual({ r: 0x5b, g: 0x6c, b: 0xff });
	});

	it('expands three-digit hex', () => {
		expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
	});

	it('is case-insensitive and tolerates surrounding space', () => {
		expect(parseHex('  #aAbBcC ')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
	});

	it.each(['5B6CFF', '#12345', '#gggggg', 'rebeccapurple', ''])('rejects %o', (bad) => {
		expect(() => parseHex(bad)).toThrow(/Not a hex colour/);
	});
});

describe('relativeLuminance', () => {
	it('anchors at the endpoints', () => {
		expect(relativeLuminance('#000000')).toBe(0);
		expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
	});

	it('uses the linear ramp below the sRGB knee', () => {
		// #0a0a0a is 10/255 = 0.0392, under the 0.04045 threshold, so it must divide by
		// 12.92 rather than take the power curve.
		expect(relativeLuminance('#0a0a0a')).toBeCloseTo(10 / 255 / 12.92, 12);
	});
});

describe('contrastRatio', () => {
	it('is 21:1 for black on white', () => {
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
	});

	it('is 1:1 for a colour against itself', () => {
		expect(contrastRatio('#5B6CFF', '#5B6CFF')).toBeCloseTo(1, 10);
	});

	it('is symmetric', () => {
		expect(contrastRatio('#96989F', '#1B1D22')).toBeCloseTo(
			contrastRatio('#1B1D22', '#96989F'),
			12
		);
	});
});
