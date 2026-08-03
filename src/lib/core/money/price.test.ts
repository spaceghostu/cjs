import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { money, percent, quantity, unitPrice } from './ctor';
import { addMoney, sumMoney } from './math';
import { VAT_POLICY, priceDocument, type LineInput, type TaxTreatment } from './price';

const VAT15 = percent(15);
const R = (rands: number, cents = 0) => money(rands * 100 + cents, 'ZAR');

/** A line priced in whole rands. */
function line(
	rands: number,
	qty = 1,
	treatment: TaxTreatment = 'standard',
	extra: Partial<LineInput<'ZAR'>> = {}
): LineInput<'ZAR'> {
	return {
		unitPrice: unitPrice(Math.round(rands * 1_000_000), 'ZAR'),
		qty: quantity(Math.round(qty * 1_000_000)),
		taxTreatment: treatment,
		vatRate: VAT15,
		...extra
	};
}

const exclusive = { engine: 'za_vat', mode: 'exclusive' } as const;
const inclusive = { engine: 'za_vat', mode: 'inclusive' } as const;
const noVat = { engine: 'none', mode: 'inclusive' } as const;

describe('the worked cases', () => {
	it('3 x R33.33 exclusive at 15%', () => {
		const d = priceDocument([line(33.33, 3)], exclusive);
		expect(d.subtotal.cents).toBe(9999); // R99,99
		expect(d.tax.cents).toBe(1500); // R15,00
		expect(d.total.cents).toBe(11_499); // R114,99
	});

	it('R99.99 inclusive at 15% reconciles exactly', () => {
		const d = priceDocument([line(99.99)], inclusive);
		expect(d.tax.cents).toBe(1304); // R13,04
		expect(d.subtotal.cents).toBe(8695); // R86,95
		expect(d.total.cents).toBe(9999);
		expect(d.subtotal.cents + d.tax.cents).toBe(d.total.cents);
	});

	it('R1 000 000 inclusive at 15% — the case that catches the 0.13043 shortcut', () => {
		const d = priceDocument([line(1_000_000)], inclusive);
		// The five-decimal literal gives R130 430,00. That is R4,78 wrong, on one invoice.
		expect(d.tax.cents).toBe(13_043_478);
		expect(d.subtotal.cents).toBe(86_956_522);
		expect(d.total.cents).toBe(100_000_000);
	});

	it('R0.10 at 15% rounds the exact half-cent UP, per s66(b)(ii)', () => {
		const d = priceDocument([line(0.1)], exclusive);
		expect(d.tax.cents).toBe(2);
		expect(d.total.cents).toBe(12);
	});

	it("R0.30 at 15% — the banker's-rounding counter-case", () => {
		// Raw 4.5c. Banker's rounding gives R0,04 and is NON-COMPLIANT.
		const d = priceDocument([line(0.3)], exclusive);
		expect(d.tax.cents).toBe(5);
	});

	it('R100 across 33.33/33.33/33.34 less 15% allocates to exactly R85.00', () => {
		const d = priceDocument([line(33.33), line(33.33), line(33.34)], {
			...exclusive,
			docDiscount: { kind: 'rate', rate: percent(15) }
		});
		expect(d.docDiscount.cents).toBe(1500);
		expect(d.lines.map((l) => l.amount.cents)).toEqual([2833, 2833, 2834]);
		expect(d.subtotal.cents).toBe(8500); // exactly R85,00 — nothing lost to rounding
	});

	it('mixed standard and zero-rated lines are grouped separately', () => {
		const d = priceDocument([line(10.1, 1, 'standard'), line(5.05, 1, 'zero_rated')], inclusive);
		expect(d.groups).toHaveLength(2);
		const [std, zero] = d.groups;
		expect(std.treatment).toBe('standard');
		expect(std.label).toBe('VAT @ 15%');
		expect(zero.treatment).toBe('zero_rated');
		expect(zero.tax.cents).toBe(0);
		expect(d.total.cents).toBe(1515); // R15,15 — the inclusive sum is untouched
	});
});

describe('rounding happens ONCE PER TAX GROUP, never per line', () => {
	it('three lines of R10.10 exclusive give R4.55, not R4.56', () => {
		const d = priceDocument([line(10.1), line(10.1), line(10.1)], exclusive);
		// per line : 3 x round(151.5) = 3 x 152 = 456
		// per group: round(3030 x 15%) = round(454.5) = 455
		expect(d.subtotal.cents).toBe(3030);
		expect(d.tax.cents).toBe(455);
		expect(d.total.cents).toBe(3485);
	});

	it('groups by RATE as well as treatment, so a rate change mid-catalogue is safe', () => {
		const d = priceDocument(
			[
				line(100, 1, 'standard'),
				{ ...line(100, 1, 'standard'), vatRate: percent(15.5) } // a s67 rate change
			],
			exclusive
		);
		expect(d.groups).toHaveLength(2);
		expect(d.groups.map((g) => g.label)).toEqual(['VAT @ 15.5%', 'VAT @ 15%']);
		expect(d.groups[0].tax.cents).toBe(1550);
		expect(d.groups[1].tax.cents).toBe(1500);
	});

	it('orders groups deterministically, so a 2033 reprint is identical', () => {
		const forwards = priceDocument(
			[line(10, 1, 'standard'), line(10, 1, 'exempt'), line(10, 1, 'zero_rated')],
			exclusive
		);
		const backwards = priceDocument(
			[line(10, 1, 'zero_rated'), line(10, 1, 'exempt'), line(10, 1, 'standard')],
			exclusive
		);
		expect(forwards.groups.map((g) => g.label)).toEqual(backwards.groups.map((g) => g.label));
	});
});

describe('inclusive pricing derives the net BY SUBTRACTION', () => {
	it('never breaks base + tax == the inclusive amount, for every cent to R50', () => {
		// Rounding net and VAT independently breaks this roughly half the time, and a
		// one-cent mismatch on a printed tax invoice is the defect class the brief refuses.
		for (let cents = 0; cents <= 5000; cents++) {
			const d = priceDocument(
				[{ ...line(0), unitPrice: unitPrice(cents * 10_000, 'ZAR') }],
				inclusive
			);
			expect(d.subtotal.cents + d.tax.cents).toBe(d.total.cents);
			expect(d.total.cents).toBe(cents);
		}
	});
});

describe('a business that is NOT registered for VAT', () => {
	it('produces no tax, one no-VAT group, and no rate anywhere', () => {
		// VAT Act s58(1)(a) makes it a criminal offence for a non-vendor to represent that
		// tax is included. This collapses in the ENGINE, so a template cannot leak a rate by
		// forgetting to branch.
		const d = priceDocument([line(100, 1, 'standard'), line(50, 1, 'zero_rated')], noVat);
		expect(d.tax.cents).toBe(0);
		expect(d.groups).toHaveLength(1);
		expect(d.groups[0].treatment).toBe('no_vat');
		expect(d.groups[0].ratePpm).toBe(0);
		expect(d.groups[0].label).toBe('No VAT');
		expect(d.subtotal.cents).toBe(15_000);
		expect(d.total.cents).toBe(15_000);
	});
});

describe('discounts', () => {
	it('takes a percentage off a line', () => {
		const d = priceDocument(
			[line(100, 1, 'standard', { discount: { kind: 'rate', rate: percent(10) } })],
			exclusive
		);
		expect(d.lines[0].gross.cents).toBe(10_000);
		expect(d.lines[0].lineDiscount.cents).toBe(1000);
		expect(d.lines[0].amount.cents).toBe(9000);
		expect(d.tax.cents).toBe(1350);
	});

	it('takes a fixed AMOUNT off a line — "R500 off" is the commonest real discount', () => {
		const d = priceDocument(
			[line(2000, 1, 'standard', { discount: { kind: 'amount', amount: R(500) } })],
			exclusive
		);
		expect(d.lines[0].amount.cents).toBe(150_000);
		expect(d.tax.cents).toBe(22_500);
	});

	it('takes a fixed AMOUNT off the whole document, spread across lines', () => {
		const d = priceDocument([line(60), line(40)], {
			...exclusive,
			docDiscount: { kind: 'amount', amount: R(10) }
		});
		expect(d.docDiscount.cents).toBe(1000);
		expect(d.lines.map((l) => l.docDiscountShare.cents)).toEqual([-600, -400]);
		expect(d.subtotal.cents).toBe(9000);
	});

	it('gives a zero or negative line no share of a document discount', () => {
		const d = priceDocument([line(100), line(0)], {
			...exclusive,
			docDiscount: { kind: 'amount', amount: R(10) }
		});
		expect(d.lines.map((l) => l.docDiscountShare.cents)).toEqual([-1000, 0]);
	});

	it('spreads a document discount evenly when every line is zero', () => {
		const d = priceDocument([line(0), line(0)], {
			...exclusive,
			docDiscount: { kind: 'amount', amount: R(0, 3) }
		});
		expect(
			sumMoney(
				'ZAR',
				d.lines.map((l) => l.docDiscountShare)
			).cents
		).toBe(-3);
	});

	it('refuses a discount in the wrong currency', () => {
		expect(() =>
			priceDocument([line(100)], {
				...exclusive,
				docDiscount: {
					kind: 'amount',
					amount: { cents: 100, currency: 'EUR' } as unknown as ReturnType<typeof R>
				}
			})
		).toThrow(/currency mismatch/);
	});
});

describe('document shape', () => {
	it('prices an empty document as zero without dividing by anything', () => {
		const d = priceDocument([], { ...exclusive, currency: 'ZAR' });
		expect(d.total.cents).toBe(0);
		expect(d.groups).toHaveLength(0);
		expect(d.lines).toHaveLength(0);
	});

	it('falls back to ZAR for an empty document with no stated currency', () => {
		// A brand-new blank quote, before a single line has been added.
		const d = priceDocument([], exclusive);
		expect(d.currency).toBe('ZAR');
		expect(d.total.cents).toBe(0);
	});

	it('takes the currency from the first line when none is stated', () => {
		expect(priceDocument([line(10)], exclusive).currency).toBe('ZAR');
	});

	it('stamps the policy version, so a future _v2 cannot alter an issued document', () => {
		expect(priceDocument([line(1)], exclusive).policy).toBe(VAT_POLICY);
		expect(VAT_POLICY).toBe('za_vat_per_group_half_away_v1');
	});

	it('refuses a line in a different currency to the document', () => {
		const foreign = { ...line(1), unitPrice: unitPrice(1_000_000, 'EUR' as 'ZAR') };
		expect(() => priceDocument([foreign], { ...exclusive, currency: 'ZAR' })).toThrow(
			/currency mismatch/
		);
	});

	it('reports per-line workings, so the UI can show how a number was reached', () => {
		const d = priceDocument(
			[line(100, 2, 'standard', { discount: { kind: 'rate', rate: percent(10) } })],
			{
				...exclusive,
				docDiscount: { kind: 'rate', rate: percent(5) }
			}
		);
		const [l] = d.lines;
		expect(l.gross.cents).toBe(20_000);
		expect(l.lineDiscount.cents).toBe(2000);
		expect(l.afterLineDiscount.cents).toBe(18_000);
		expect(l.docDiscountShare.cents).toBe(-900);
		expect(l.amount.cents).toBe(17_100);
	});
});

describe('properties', () => {
	const amounts = fc.integer({ min: 0, max: 50_000_000 }); // up to R500 000, in cents
	const treatments = fc.constantFrom<TaxTreatment>('standard', 'zero_rated', 'exempt', 'no_vat');

	const lines = fc.array(fc.record({ cents: amounts, treatment: treatments }), {
		minLength: 1,
		maxLength: 20
	});

	function build(spec: { cents: number; treatment: TaxTreatment }[]): LineInput<'ZAR'>[] {
		return spec.map((s) => ({
			unitPrice: unitPrice(s.cents * 10_000, 'ZAR'),
			qty: quantity(1_000_000),
			taxTreatment: s.treatment,
			vatRate: VAT15
		}));
	}

	it('subtotal + tax always equals total', () => {
		fc.assert(
			fc.property(lines, fc.constantFrom('inclusive', 'exclusive'), (spec, mode) => {
				const d = priceDocument(build(spec), { engine: 'za_vat', mode });
				return addMoney(d.subtotal, d.tax).cents === d.total.cents;
			}),
			{ numRuns: 1500 }
		);
	});

	it('in inclusive mode the total always equals the sum of the line amounts', () => {
		fc.assert(
			fc.property(lines, (spec) => {
				const d = priceDocument(build(spec), inclusive);
				const lineSum = sumMoney(
					'ZAR',
					d.lines.map((l) => l.amount)
				);
				return d.total.cents === lineSum.cents;
			}),
			{ numRuns: 1500 }
		);
	});

	it('a document discount is never lost or invented', () => {
		fc.assert(
			fc.property(lines, fc.integer({ min: 0, max: 1_000_000 }), (spec, ppm) => {
				const d = priceDocument(build(spec), {
					...exclusive,
					docDiscount: { kind: 'rate', rate: { ppm } as ReturnType<typeof percent> }
				});
				const shares = sumMoney(
					'ZAR',
					d.lines.map((l) => l.docDiscountShare)
				);
				return shares.cents === -d.docDiscount.cents;
			}),
			{ numRuns: 1500 }
		);
	});

	it('the group bases always sum to the subtotal', () => {
		fc.assert(
			fc.property(lines, fc.constantFrom('inclusive', 'exclusive'), (spec, mode) => {
				const d = priceDocument(build(spec), { engine: 'za_vat', mode });
				return (
					sumMoney(
						'ZAR',
						d.groups.map((g) => g.base)
					).cents === d.subtotal.cents
				);
			}),
			{ numRuns: 1000 }
		);
	});

	it('engine "none" always produces exactly zero tax', () => {
		fc.assert(
			fc.property(lines, (spec) => priceDocument(build(spec), noVat).tax.cents === 0),
			{ numRuns: 500 }
		);
	});
});
