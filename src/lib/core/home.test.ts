/**
 * The panel's own words. Tested as a pure function because the not-all-clear variant is a
 * DESIGN decision expressed in copy, and a design decision that only exists inside a Svelte
 * component is one nobody can check without a browser.
 */
import { describe, expect, it } from 'vitest';
import { orderPoints, standingCopy, standingOf, type StandingPoint } from './home';

function point(standing: 'clear' | 'attention', statement: string): StandingPoint {
	return { module: 'quoting', standing, statement, explanation: '', href: null };
}

describe('standingOf', () => {
	it('is clear when nothing was contributed at all', () => {
		// A business with one module, or none, still gets a coherent panel.
		expect(standingOf([])).toBe('clear');
	});

	it('is clear when every module is', () => {
		expect(standingOf([point('clear', 'a'), point('clear', 'b')])).toBe('clear');
	});

	it('is attention when a single module says so', () => {
		// Never a majority: one unchased quote among five reassurances is exactly the small
		// thing this screen exists to surface before it becomes a large one.
		expect(standingOf([point('clear', 'a'), point('attention', 'b'), point('clear', 'c')])).toBe(
			'attention'
		);
	});
});

describe('orderPoints', () => {
	it('puts concerns first and keeps contribution order otherwise', () => {
		const ordered = orderPoints([
			point('clear', 'a'),
			point('attention', 'b'),
			point('clear', 'c'),
			point('attention', 'd')
		]);

		expect(ordered.map((p) => p.statement)).toEqual(['b', 'd', 'a', 'c']);
	});

	it('does not mutate the input', () => {
		const input = [point('clear', 'a'), point('attention', 'b')];
		orderPoints(input);
		expect(input.map((p) => p.statement)).toEqual(['a', 'b']);
	});
});

describe('standingCopy', () => {
	it('says nothing needs you, and when it last checked', () => {
		const copy = standingCopy('clear', 0, 'Checked just now');

		expect(copy.headline).toBe("You're all clear.");
		expect(copy.explanation).toContain('Nothing needs you today');
		expect(copy.explanation).toContain('Checked just now');
	});

	it('counts what needs you, in words, and agrees with itself', () => {
		expect(standingCopy('attention', 1, 'Checked just now').headline).toBe('One thing needs you.');
		expect(standingCopy('attention', 2, 'Checked just now').headline).toBe('Two things need you.');
	});

	it('falls back to a numeral past ten', () => {
		expect(standingCopy('attention', 12, 'Checked just now').headline).toBe('12 things need you.');
	});

	it('keeps the calm register when something does need you', () => {
		const copy = standingCopy('attention', 3, 'Checked just now');

		// The design's whole argument: state the fact, say everything else is fine, and do not
		// manufacture urgency on the screen an owner opens first.
		expect(copy.explanation).toContain('Everything else is fine');
		expect(copy.explanation).toContain('Checked just now');
		expect(copy.headline).not.toContain('!');
	});
});
