import { describe, expect, it } from 'vitest';
import { composite, mixOklab } from './mix.js';
import { relativeLuminance } from './contrast.js';

describe('mixOklab', () => {
	it('returns the endpoints unchanged', () => {
		expect(mixOklab('#5464ee', 100, '#ffffff')).toBe('#5464ee');
		expect(mixOklab('#5464ee', 0, '#ffffff')).toBe('#ffffff');
	});

	it('moves monotonically toward the second colour', () => {
		const steps = [100, 90, 80, 70, 60].map((p) =>
			relativeLuminance(mixOklab('#5464ee', p, '#ffffff'))
		);
		for (let i = 1; i < steps.length; i++) {
			expect(steps[i]).toBeGreaterThan(steps[i - 1]);
		}
	});

	it('mixing with black darkens', () => {
		expect(relativeLuminance(mixOklab('#5464ee', 84, '#000000'))).toBeLessThan(
			relativeLuminance('#5464ee')
		);
	});

	it('reproduces the ramp layout.css declares for the default brand', () => {
		// If these drift, either this file or the browser is wrong about color-mix, and the
		// contrast test built on it stops meaning anything.
		expect(mixOklab('#5464ee', 92, '#000000')).toBe('#4a59d5');
		expect(mixOklab('#5464ee', 84, '#000000')).toBe('#414ebd');
		expect(mixOklab('#5464ee', 74, '#ffffff')).toBe('#7b90f6');
		expect(mixOklab('#5464ee', 55, '#ffffff')).toBe('#9aadfb');
	});

	it('is a grey when both endpoints are grey', () => {
		expect(mixOklab('#000000', 50, '#ffffff')).toMatch(/^#([0-9a-f]{2})\1\1$/);
	});
});

describe('composite', () => {
	it('is the background at zero alpha and the foreground at one', () => {
		expect(composite('#e0685c', 0, '#1b1d22')).toBe('#1b1d22');
		expect(composite('#e0685c', 1, '#1b1d22')).toBe('#e0685c');
	});

	it('lands between the two', () => {
		const tint = relativeLuminance(composite('#e0685c', 0.15, '#1b1d22'));
		expect(tint).toBeGreaterThan(relativeLuminance('#1b1d22'));
		expect(tint).toBeLessThan(relativeLuminance('#e0685c'));
	});

	it('mixes per channel in sRGB, as the compositor does', () => {
		expect(composite('#ffffff', 0.5, '#000000')).toBe('#808080');
	});
});
