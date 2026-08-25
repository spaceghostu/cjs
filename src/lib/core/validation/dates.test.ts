import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isCalendarDate } from '$lib/core/calendar';
import { checkCalendarDate, explainDate } from './dates';
import { sentence } from './types';

const refused = (raw: string) => {
	const result = checkCalendarDate(raw);
	expect(result.ok, `expected "${raw}" to be refused`).toBe(false);
	return result.ok ? { message: '', problems: [] } : result;
};

const accepted = (raw: string) => {
	const result = checkCalendarDate(raw);
	if (!result.ok) throw new Error(`expected "${raw}" to be accepted, got: ${result.message}`);
	return result.value;
};

describe('the message the whole standard is built from', () => {
	it('is exactly what the design shows', () => {
		expect(refused('2026/13/02').message).toBe("There's no 13th month — did you mean 2 Dec 2026?");
	});

	it('offers the correction as a value the field can adopt, not only as words', () => {
		const [problem] = refused('2026/13/02').problems;
		expect(problem.suggestion?.value).toBe('2026-12-02');
		expect(isCalendarDate(problem.suggestion?.value ?? '')).toBe(true);
	});

	it('leaves the day exactly as typed — one field reinterpreted, not two', () => {
		// The rejected alternative was to read 13/02 as a transposed 13 February. See the
		// header: that rewrites two fields and invents a day nobody typed in that position.
		expect(refused('2026/13/02').problems[0].suggestion?.value).not.toBe('2026-02-13');
	});
});

describe('months that do not exist', () => {
	it('names the month it cannot find', () => {
		expect(refused('2026/21/02').message).toContain("There's no 21st month");
		expect(refused('2026/22/02').message).toContain("There's no 22nd month");
		expect(refused('2026/23/02').message).toContain("There's no 23rd month");
		expect(refused('2026/11/45').message).toContain("There's no 45th day");
	});

	it('offers December for anything past it', () => {
		expect(refused('2026/13/02').problems[0].suggestion?.value).toBe('2026-12-02');
		expect(refused('2026/99/02').problems[0].suggestion?.value).toBe('2026-12-02');
	});

	it('handles a month of zero without pretending it is December', () => {
		const result = refused('2026/00/02');
		expect(result.message).toContain('Months are numbered 1 to 12');
		expect(result.problems[0].suggestion?.value).toBe('2026-01-02');
	});

	it('never offers a day the clamped month does not have', () => {
		// 13/31 clamps to December, which has 31 days. 13/32 has no such luck.
		expect(refused('2026/13/31').problems[0].suggestion?.value).toBe('2026-12-31');
		expect(refused('2026/13/32').problems[0].suggestion?.value).toBe('2026-12-31');
	});
});

describe('days that do not exist', () => {
	it('catches the case the quoting boundary calls out by name', () => {
		// `2026-02-30` matches \d{4}-\d{2}-\d{2} and is not a day.
		expect(refused('2026-02-30').message).toBe(
			"There's no 30th day in that month — did you mean 28 Feb 2026?"
		);
	});

	it('knows about February in a leap year', () => {
		expect(refused('2028-02-30').problems[0].suggestion?.value).toBe('2028-02-29');
		expect(accepted('2028-02-29')).toBe('2028-02-29');
	});

	it('knows the short months', () => {
		expect(refused('2026-04-31').problems[0].suggestion?.value).toBe('2026-04-30');
		expect(accepted('2026-05-31')).toBe('2026-05-31');
	});

	it('handles a day of zero', () => {
		const result = refused('2026-05-00');
		expect(result.message).toContain('Days are numbered from 1');
		expect(result.problems[0].suggestion?.value).toBe('2026-05-01');
	});
});

describe('what people actually type', () => {
	it('accepts the form the database stores', () => {
		expect(accepted('2026-08-22')).toBe('2026-08-22');
	});

	it('accepts the form a South African writes, in any of the usual separators', () => {
		expect(accepted('22/08/2026')).toBe('2026-08-22');
		expect(accepted('22-08-2026')).toBe('2026-08-22');
		expect(accepted('22.08.2026')).toBe('2026-08-22');
		expect(accepted('22 08 2026')).toBe('2026-08-22');
		expect(accepted('2/8/2026')).toBe('2026-08-02');
		expect(accepted('  22/08/2026  ')).toBe('2026-08-22');
	});

	it('refuses a two-digit year, and offers the year it almost certainly is', () => {
		expect(refused('02/12/26').message).toBe(
			'Write the year in full, like 2026 — did you mean 2 Dec 2026?'
		);
		// A four-digit-looking year below 1000 is the same mistake wearing a disguise, and it
		// matters: Date.UTC reads 26 as 1926, so an unguarded version would suggest a date the
		// calendar itself rejects.
		expect(refused('0026-12-02').message).toBe(
			'Write the year in full, like 2026 — did you mean 2 Dec 2026?'
		);
	});

	it('asks for a date rather than complaining when the field is empty', () => {
		expect(refused('').message).toBe('Enter a date.');
		expect(refused('   ').message).toBe('Enter a date.');
	});

	it('says what shape it wants when the input is not three numbers', () => {
		for (const raw of ['next tuesday', '22 August 2026', '2026', '22/08', '1/2/3/4', 'x/y/z']) {
			expect(refused(raw).message).toBe('Dates go in as day/month/year, like 02/12/2026.');
		}
	});

	it('never guesses with Date.parse — a month name is refused, not interpreted', () => {
		expect(checkCalendarDate('Dec 2 2026').ok).toBe(false);
	});
});

describe('anchoring', () => {
	it('carries the field it was asked about, and shows it to nobody', () => {
		const result = refused('2026/13/02');
		expect(checkCalendarDate('2026/13/02', 'validUntil')).toMatchObject({
			problems: [{ field: 'validUntil' }]
		});
		expect(result.message).not.toContain('validUntil');
	});
});

describe('explainDate, the form the zod bridge uses', () => {
	it('returns nothing for a date it is happy with, so the bridge falls back', () => {
		expect(explainDate('2026-08-22')).toBeNull();
	});

	it('returns nothing for a value that is not a string at all', () => {
		expect(explainDate(undefined)).toBeNull();
		expect(explainDate(20261302)).toBeNull();
	});

	it('returns the standard sentence for a date it can explain', () => {
		const found = explainDate('2026/13/02');
		expect(found).not.toBeNull();
		expect(sentence(found!)).toBe("There's no 13th month — did you mean 2 Dec 2026?");
	});
});

describe('what it accepts and what the calendar accepts cannot drift apart', () => {
	it('only ever returns a day that exists', () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[0-9]{1,4}[/-][0-9]{1,2}[/-][0-9]{1,4}$/), (raw: string) => {
				const result = checkCalendarDate(raw);
				return !result.ok || isCalendarDate(result.value);
			})
		);
	});

	it('only ever suggests a day that exists', () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[0-9]{1,4}[/-][0-9]{1,2}[/-][0-9]{1,4}$/), (raw: string) => {
				const result = checkCalendarDate(raw);
				if (result.ok) return true;
				return result.problems.every(
					(p) => p.suggestion === null || isCalendarDate(p.suggestion.value)
				);
			})
		);
	});

	it('agrees with the calendar about every canonical date it is given', () => {
		fc.assert(
			fc.property(
				fc.date({ min: new Date('1970-01-01'), max: new Date('2099-12-31'), noInvalidDate: true }),
				(d) => {
					const iso = d.toISOString().slice(0, 10);
					const result = checkCalendarDate(iso);
					return result.ok && result.value === iso;
				}
			)
		);
	});
});
