/**
 * "IT ARRIVES READY" — and the empty case that makes it believable.
 *
 * The design asks the add confirmation to say what carries over and then claim "There's
 * nothing to set up". A static version of that sentence is a lie on somebody's first
 * afternoon, so the interesting test here is the business with nothing yet.
 */
import { describe, expect, it } from 'vitest';
import { carryoverLines, carryoverSummary, type Carryover } from './carryover';

const EMPTY: Carryover = {
	people: 0,
	customers: 0,
	ownedModules: [],
	hasCompanyDetails: false,
	hasVatNumber: false
};

const THORNHILL: Carryover = {
	people: 4,
	customers: 12,
	ownedModules: ['Quoting', 'Invoicing', 'Inventory'],
	hasCompanyDetails: true,
	hasVatNumber: true
};

describe('carryoverLines', () => {
	it('says nothing at all for a business with nothing yet', () => {
		// The honest empty case, and the whole reason this is a query rather than copy.
		expect(carryoverLines(EMPTY, 'payroll')).toEqual([]);
	});

	it('names real facts, in the order the design lists them', () => {
		expect(carryoverLines(THORNHILL, 'payroll')).toEqual([
			'Your company details and VAT number, already on every document',
			'4 people, already on your team',
			'12 customers you already invoice',
			'Everything in Quoting, Invoicing and Inventory stays exactly as it is'
		]);
	});

	it('leaves the VAT number out when there is not one', () => {
		// A great many small businesses are under the R1m threshold and have no VAT number.
		const line = carryoverLines({ ...THORNHILL, hasVatNumber: false }, 'payroll')[0];
		expect(line).toBe('Your company details, already on every document');
	});

	it('counts in the singular when there is one of something', () => {
		const lines = carryoverLines({ ...EMPTY, people: 1, customers: 1 }, 'payroll');
		expect(lines).toEqual(['1 person, already on your team', '1 customer you already invoice']);
	});
});

describe('carryoverSummary', () => {
	it('is null when there is genuinely nothing to say', () => {
		expect(carryoverSummary(EMPTY)).toBeNull();
	});

	it('reads the way a person would say it', () => {
		expect(carryoverSummary(THORNHILL)).toBe('4 people, 12 customers and your VAT details');
	});

	it('needs no comma for two facts', () => {
		expect(carryoverSummary({ ...EMPTY, people: 4, hasCompanyDetails: true })).toBe(
			'4 people and your company details'
		);
	});

	it('is a bare phrase for one', () => {
		expect(carryoverSummary({ ...EMPTY, people: 4 })).toBe('4 people');
	});
});
