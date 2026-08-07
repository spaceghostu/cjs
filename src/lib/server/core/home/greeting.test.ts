/**
 * "Friday evening, Chantal." — the design's second line, and four ways to get it wrong.
 *
 * Every instant below is written in UTC and asserted in SAST, which is the point: the product
 * has one calendar, and a greeting computed off the server's own timezone would read
 * differently on a machine in Frankfurt than on the one in the design.
 */
import { describe, expect, it } from 'vitest';
import { greeting, partOfDay } from './greeting';

const LOCALE = 'en-ZA';

describe('partOfDay', () => {
	it('reads the clock in the billing zone, not in UTC', () => {
		// 22:30 UTC is 00:30 the next day in SAST. A UTC reading would call this the evening.
		expect(partOfDay(new Date('2025-08-01T22:30:00Z'))).toBe('night');
	});

	it('covers the whole day', () => {
		expect(partOfDay(new Date('2025-08-01T06:00:00Z'))).toBe('morning'); // 08:00
		expect(partOfDay(new Date('2025-08-01T11:00:00Z'))).toBe('afternoon'); // 13:00
		expect(partOfDay(new Date('2025-08-01T17:00:00Z'))).toBe('evening'); // 19:00
		expect(partOfDay(new Date('2025-08-01T21:00:00Z'))).toBe('night'); // 23:00
	});

	it('is generous at the ends, because 22:30 is a night', () => {
		expect(partOfDay(new Date('2025-08-01T20:30:00Z'))).toBe('night'); // 22:30
	});
});

describe('greeting', () => {
	it('is the design line', () => {
		expect(greeting(new Date('2025-08-01T17:30:00Z'), LOCALE, 'Chantal Thornhill')).toBe(
			'Friday evening, Chantal.'
		);
	});

	it('uses the first name only', () => {
		expect(greeting(new Date('2025-08-04T07:00:00Z'), LOCALE, 'Sipho Ndlovu')).toContain(
			', Sipho.'
		);
	});

	it('names the weekday in the billing zone', () => {
		// 23:00 UTC on Friday is Saturday morning in SAST.
		expect(greeting(new Date('2025-08-01T23:00:00Z'), LOCALE, 'Chantal')).toBe(
			'Saturday night, Chantal.'
		);
	});

	it('greets someone with no name rather than apologising for not knowing it', () => {
		expect(greeting(new Date('2025-08-01T17:30:00Z'), LOCALE, null)).toBe('Friday evening.');
		expect(greeting(new Date('2025-08-01T17:30:00Z'), LOCALE, '   ')).toBe('Friday evening.');
	});
});
