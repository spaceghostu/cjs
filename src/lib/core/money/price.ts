/**
 * Document pricing — the one place a document's totals are calculated.
 *
 * Quotes, invoices, credit notes, debit notes, corrections, purchase orders and every
 * future document kind go through this function. There is no second VAT engine.
 *
 * THE TWO DECISIONS THAT MATTER
 * -----------------------------
 *
 * 1. ROUND ONCE PER (treatment, rate) GROUP, NEVER PER LINE.
 *
 *    Three lines of R10.10 exclusive at 15%:
 *      per line  : 3 x round(1.515) = 3 x 1.52 = R4.56
 *      per group : round(30.30 x 15%) = round(4.545) = R4.55
 *
 *    One cent per document, forever. SARS publishes no rule on which to use, so this is a
 *    reasoned choice rather than a cited one — but per-group is also how the VAT201 return
 *    is completed, and it produces the "VAT summary by rate" block a valid tax invoice
 *    needs anyway. The compliant presentation and the numerically sound one are the same
 *    presentation.
 *
 * 2. IN INCLUSIVE MODE, THE NET IS DERIVED BY SUBTRACTION.
 *
 *    net = inclusive - tax, never rounded independently. Rounding both separately breaks
 *    `net + vat == inclusive` roughly half the time, and a one-cent mismatch printed on a
 *    tax invoice is exactly the defect class the brief calls unacceptable.
 *
 * Every priced document records `policy`. A future `_v2` never alters a document that was
 * already issued under `_v1` — the policy is snapshotted on the row.
 */
import { money } from './ctor';
import { formatRatePercent } from './format';
import {
	addMoney,
	allocate,
	applyRate,
	lineAmount,
	subMoney,
	sumMoney,
	taxInInclusive,
	zero
} from './math';
import {
	type CurrencyCode,
	type Money,
	type Quantity,
	type Rate,
	type UnitPrice,
	ZAR
} from './types';

/** Bump this when the ARITHMETIC changes, never for a presentation change. */
export const VAT_POLICY = 'za_vat_per_group_half_away_v1' as const;
export type VatPolicy = typeof VAT_POLICY;

/**
 * `za_paye` is reserved but deliberately absent. PAYE is annualised year-to-date income
 * against progressive brackets, so it will NOT fit this per-line-group shape — payroll gets
 * its own engine behind the same seam rather than bending this one out of shape.
 */
export type TaxEngineId = 'za_vat' | 'none';

export type TaxTreatment = 'standard' | 'zero_rated' | 'exempt' | 'no_vat';
export type PricingMode = 'exclusive' | 'inclusive';

/** "10% off" and "R500 off" are both things people actually ask for. Both are supported. */
export type Discount =
	| { readonly kind: 'rate'; readonly rate: Rate }
	| { readonly kind: 'amount'; readonly amount: Money };

export type LineInput<C extends CurrencyCode = CurrencyCode> = {
	readonly unitPrice: UnitPrice<C>;
	readonly qty: Quantity;
	readonly taxTreatment: TaxTreatment;
	/** The rate in force for this line, snapshotted at issue. Ignored unless 'standard'. */
	readonly vatRate: Rate;
	readonly discount?: Discount;
};

export type PricedLine<C extends CurrencyCode = CurrencyCode> = {
	/** unit price x quantity, before any discount. */
	readonly gross: Money<C>;
	/** What the line discount took off. Zero when there is none. */
	readonly lineDiscount: Money<C>;
	readonly afterLineDiscount: Money<C>;
	/** This line's share of a document-level discount. Zero or negative. */
	readonly docDiscountShare: Money<C>;
	/** What prints in the line's Amount column. */
	readonly amount: Money<C>;
};

export type TaxGroup<C extends CurrencyCode = CurrencyCode> = {
	readonly treatment: TaxTreatment;
	readonly ratePpm: number;
	/** Plain language, as it prints: "VAT @ 15%". */
	readonly label: string;
	/** The amount the tax is calculated on (exclusive of tax). */
	readonly base: Money<C>;
	readonly tax: Money<C>;
};

export type PricedDocument<C extends CurrencyCode = CurrencyCode> = {
	readonly policy: VatPolicy;
	readonly engine: TaxEngineId;
	readonly mode: PricingMode;
	readonly currency: C;
	readonly lines: readonly PricedLine<C>[];
	readonly groups: readonly TaxGroup<C>[];
	/** Total document-level discount, as a positive amount. */
	readonly docDiscount: Money<C>;
	/** Sum of the group bases — "Subtotal (excl. VAT)". */
	readonly subtotal: Money<C>;
	readonly tax: Money<C>;
	readonly total: Money<C>;
};

export type PriceOptions<C extends CurrencyCode = CurrencyCode> = {
	readonly engine: TaxEngineId;
	readonly mode: PricingMode;
	readonly docDiscount?: Discount;
	readonly currency?: C;
};

function labelFor(treatment: TaxTreatment, ppm: number): string {
	switch (treatment) {
		case 'standard':
			return `VAT @ ${formatRatePercent(ppm)}%`;
		case 'zero_rated':
			return 'Zero-rated (0%)';
		case 'exempt':
			return 'Exempt';
		case 'no_vat':
			return 'No VAT';
	}
}

/** Only 'standard' supplies actually carry a rate. Everything else is 0 by definition. */
function effectiveRatePpm(treatment: TaxTreatment, vatRate: Rate): number {
	return treatment === 'standard' ? vatRate.ppm : 0;
}

function discountAmount<C extends CurrencyCode>(
	on: Money<C>,
	discount: Discount | undefined,
	currency: C
): Money<C> {
	if (!discount) return zero(currency);
	if (discount.kind === 'rate') return applyRate(on, discount.rate);
	if (discount.amount.currency !== currency) {
		throw new Error(
			`currency mismatch: discount is ${discount.amount.currency}, document is ${currency}`
		);
	}
	return discount.amount as Money<C>;
}

export function priceDocument<C extends CurrencyCode = CurrencyCode>(
	lines: readonly LineInput<C>[],
	opts: PriceOptions<C>
): PricedDocument<C> {
	const currency = (opts.currency ?? (lines[0]?.unitPrice.currency as C) ?? (ZAR as C)) as C;

	for (const line of lines) {
		if (line.unitPrice.currency !== currency) {
			throw new Error(
				`currency mismatch: a line is ${line.unitPrice.currency}, document is ${currency}`
			);
		}
	}

	// 1 + 2 — per-line gross and line-level discount.
	const gross = lines.map((l) => lineAmount(l.unitPrice, l.qty));
	const lineDiscounts = lines.map((l, i) => discountAmount(gross[i], l.discount, currency));
	const afterLine = gross.map((g, i) => subMoney(g, lineDiscounts[i]));

	// 3 — document-level discount, computed on the post-line-discount subtotal.
	const afterLineTotal = sumMoney(currency, afterLine);
	const docDiscount = discountAmount(afterLineTotal, opts.docDiscount, currency);

	// 4 — spread it across the lines by largest remainder, so nothing is lost or invented.
	//
	// Weights are the POSITIVE line amounts. A zero or negative line takes no share of a
	// discount (you cannot discount a credit), and when every line is zero `allocate`
	// spreads evenly — which still satisfies "the parts sum to the whole".
	const weights = afterLine.map((m) => (m.cents > 0 ? m.cents : 0));
	const shares =
		docDiscount.cents === 0
			? afterLine.map(() => zero(currency))
			: allocate(money(-docDiscount.cents, currency), weights);

	const amounts = afterLine.map((m, i) => addMoney(m, shares[i]));

	// 5 — group by (treatment, effective rate). Under engine 'none' the whole document
	// collapses into a single no-VAT group, so a non-vendor's template cannot accidentally
	// print a rate. VAT Act s58(1)(a) makes representing tax where none is payable a
	// criminal offence, so this must not depend on the template remembering to branch.
	const groups = new Map<string, { treatment: TaxTreatment; ppm: number; amounts: Money<C>[] }>();

	for (let i = 0; i < lines.length; i++) {
		const treatment: TaxTreatment = opts.engine === 'none' ? 'no_vat' : lines[i].taxTreatment;
		const ppm = opts.engine === 'none' ? 0 : effectiveRatePpm(treatment, lines[i].vatRate);
		const key = `${treatment}:${ppm}`;
		const bucket = groups.get(key) ?? { treatment, ppm, amounts: [] };
		bucket.amounts.push(amounts[i]);
		groups.set(key, bucket);
	}

	// 6 — ONE rounding per group. Deterministic order so a 2033 reprint is identical.
	const priced: TaxGroup<C>[] = [...groups.values()]
		.sort((a, b) => b.ppm - a.ppm || a.treatment.localeCompare(b.treatment))
		.map(({ treatment, ppm, amounts: groupAmounts }) => {
			const groupSum = sumMoney(currency, groupAmounts); // exact integer sum, no rounding
			const rate = { ppm } as Rate;

			if (opts.engine === 'none' || ppm === 0) {
				return {
					treatment,
					ratePpm: ppm,
					label: labelFor(treatment, ppm),
					base: groupSum,
					tax: zero(currency)
				};
			}

			if (opts.mode === 'exclusive') {
				return {
					treatment,
					ratePpm: ppm,
					label: labelFor(treatment, ppm),
					base: groupSum,
					tax: applyRate(groupSum, rate)
				};
			}

			// Inclusive: extract the tax, then derive the net BY SUBTRACTION.
			const tax = taxInInclusive(groupSum, rate);
			return {
				treatment,
				ratePpm: ppm,
				label: labelFor(treatment, ppm),
				base: subMoney(groupSum, tax),
				tax
			};
		});

	// 7
	const subtotal = sumMoney(
		currency,
		priced.map((g) => g.base)
	);
	const tax = sumMoney(
		currency,
		priced.map((g) => g.tax)
	);
	const total = addMoney(subtotal, tax);

	// 8 — the invariant, asserted in code as well as by a database CHECK on every document
	// header. If these ever disagree it is a bug in this file, and it must not reach a page.
	//
	// Unreachable while `total` is defined as `subtotal + tax`, and kept anyway: this is the
	// assertion that would catch a future refactor computing the total some other way. It is
	// excluded from coverage rather than left as a permanently red branch, so that a REAL
	// gap in this file's coverage is never lost in the noise.
	/* v8 ignore start -- unreachable invariant guard, deliberately kept */
	if (subtotal.cents + tax.cents !== total.cents) {
		throw new Error(
			`priceDocument: totals do not reconcile (${subtotal.cents} + ${tax.cents} != ${total.cents})`
		);
	}
	/* v8 ignore stop */

	const linesOut: PricedLine<C>[] = lines.map((_, i) => ({
		gross: gross[i],
		lineDiscount: lineDiscounts[i],
		afterLineDiscount: afterLine[i],
		docDiscountShare: shares[i],
		amount: amounts[i]
	}));

	return {
		policy: VAT_POLICY,
		engine: opts.engine,
		mode: opts.mode,
		currency,
		lines: linesOut,
		groups: priced,
		docDiscount,
		subtotal,
		tax,
		total
	};
}
