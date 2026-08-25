import { describe, it, expect } from 'vitest';
import { parseMoneyInput, parseQuantityInput, parseRateInput } from '$lib/core/money';
import {
	checkAmount,
	checkPercentage,
	checkQuantity,
	checkUnitPrice,
	fromParseResult
} from './input';
import type { Checked, Invalid } from './types';

const refused = <T>(result: Checked<T>): Invalid => {
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error('expected a refusal');
	return result;
};

describe('the money core stays the only parser', () => {
	it('accepts everything the sanctioned parsers accept, unchanged', () => {
		const amount = checkAmount('1 250,00');
		expect(amount.ok && amount.value.cents).toBe(125_000);

		const qty = checkQuantity('2,5');
		expect(qty.ok && qty.value.e6).toBe(2_500_000);

		const price = checkUnitPrice('33,333333');
		expect(price.ok && price.value.micros).toBe(33_333_333);

		const share = checkPercentage('50%');
		expect(share.ok && share.value.ppm).toBe(500_000);
	});

	it('keeps the parser own words when there is nothing to offer', () => {
		// Not reworded, not wrapped, not prefixed with a field path. The money core spent a file
		// deciding what to say about an unreadable amount; this module does not second-guess it.
		expect(refused(checkAmount('')).message).toBe('Enter an amount.');
		expect(refused(checkAmount('abc')).message).toBe(
			"That doesn't look like an amount. Try something like 1 250,00."
		);
		expect(refused(checkPercentage('120')).message).toBe('That is more than 100%.');
	});
});

describe('the probable intent, where the decimals give it away', () => {
	it('offers the amount with the extra decimals taken off', () => {
		expect(refused(checkAmount('10.005')).message).toBe(
			'An amount is exact to the cent — did you mean R10,00?'
		);
	});

	it('truncates rather than rounds, so a suggestion never charges anybody more', () => {
		// R10,005 rounds up to R10,01 and truncates down to R10,00. The suggestion is the one
		// that cannot quietly increase somebody's bill.
		expect(refused(checkAmount('10.005')).problems[0].suggestion?.value).toBe('R10,00');
		expect(refused(checkAmount('10,999')).problems[0].suggestion?.value).toBe('R10,99');
	});

	it('offers something the field can take straight back', () => {
		const offer = refused(checkAmount('10.005')).problems[0].suggestion;
		expect(offer).not.toBeNull();
		expect(parseMoneyInput(offer!.value).ok).toBe(true);

		const qty = checkQuantity('2,5555555');
		expect(qty.ok).toBe(false);
		if (!qty.ok) {
			expect(qty.message).toBe('A quantity is exact to six decimals — did you mean 2,555555?');
			expect(parseQuantityInput(qty.problems[0].suggestion!.value).ok).toBe(true);
		}
	});

	it('offers for a unit price and a percentage too', () => {
		const price = checkUnitPrice('33,3333333');
		expect(price.ok).toBe(false);
		if (!price.ok) {
			expect(price.message).toBe('A price is exact to six decimals — did you mean R33,333333?');
		}

		const share = checkPercentage('12,55555');
		expect(share.ok).toBe(false);
		if (!share.ok) {
			expect(share.problems[0].suggestion).not.toBeNull();
			expect(parseRateInput(share.problems[0].suggestion!.value).ok).toBe(true);
		}
	});

	it('never touches the whole part, so an offer cannot change the magnitude', () => {
		// Asserted by parsing the offer back rather than by matching a string: the formatter's
		// thousands separator is a non-breaking space, and a literal here would be testing my
		// keyboard rather than the code.
		const result = refused(checkAmount('1 000,005'));
		const back = parseMoneyInput(result.problems[0].suggestion!.value);
		expect(back.ok && back.value.cents).toBe(100_000);
	});

	it('offers nothing when the failure is not about decimals', () => {
		// Too large stays too large however many decimals come off it, so there is no honest
		// guess and none is made.
		const huge = refused(checkAmount('99999999999999999999,999'));
		expect(huge.problems[0].suggestion).toBeNull();

		// A percentage over 100 is the same: shortening the tail cannot rescue it.
		expect(refused(checkPercentage('120,5555')).problems[0].suggestion).toBeNull();

		// And nothing that is not a number gets an offer at all.
		expect(refused(checkAmount('12,3x4')).problems[0].suggestion).toBeNull();
		expect(refused(checkAmount('abc')).problems[0].suggestion).toBeNull();
	});
});

describe('anchoring', () => {
	it('carries the field so a form knows where to put the message', () => {
		const result = refused(checkQuantity('nonsense', 'lines.2.qty'));
		expect(result.problems[0].field).toBe('lines.2.qty');
		expect(result.message).not.toContain('lines.2.qty');
	});

	it('anchors nowhere by default', () => {
		expect(refused(checkAmount('')).problems[0].field).toBeNull();
	});
});

describe('the general adapter', () => {
	it('turns any ParseResult into the standard shape', () => {
		expect(fromParseResult({ ok: true, value: 7 })).toEqual({ ok: true, value: 7 });

		const failed = fromParseResult({ ok: false, message: 'Enter an amount.' }, { field: 'total' });
		expect(failed).toMatchObject({
			ok: false,
			message: 'Enter an amount.',
			problems: [{ field: 'total', says: 'Enter an amount', suggestion: null }]
		});
	});
});
