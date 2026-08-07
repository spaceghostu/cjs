/**
 * Money. Import from here, never from the files inside.
 *
 * Note what is NOT re-exported: `./ctor`. Constructing money is restricted to `db/map.ts`
 * (rows -> domain) and `parseMoneyInput` (human -> domain), enforced by ESLint. If you find
 * yourself wanting a constructor, one of those two is the door you actually want.
 */
export type { CurrencyCode, Money, Quantity, Rate, UnitPrice } from './types';
export { MAX_CENTS, ZAR } from './types';

export {
	ONE_UNIT,
	ZERO_RATE,
	absMoney,
	addMoney,
	allocate,
	applyRate,
	cmpMoney,
	eqMoney,
	isNegative,
	isPositive,
	isZero,
	lineAmount,
	negateMoney,
	roundDiv,
	subMoney,
	sumMoney,
	taxInInclusive,
	zero
} from './math';

export type {
	Discount,
	LineInput,
	PriceOptions,
	PricedDocument,
	PricedLine,
	PricingMode,
	TaxEngineId,
	TaxGroup,
	TaxTreatment,
	VatPolicy
} from './price';
export { VAT_POLICY, priceDocument } from './price';

export type { BillingDate, ProrationPolicy, ProrationQuote } from './proration';
export {
	BILLING_OFFSET_MINUTES,
	PRORATION_POLICY,
	billingDate,
	daysInBillingMonth,
	daysRemainingInMonth,
	firstOfNextMonth,
	isSameBillingDay,
	prorateDaysHeld,
	prorateRemainderOfMonth,
	quoteAddition
} from './proration';

export type { ParseResult } from './parse';
export { parseMoneyInput, parseQuantityInput, parseRateInput, parseUnitPriceInput } from './parse';

export type { FormatOptions } from './format';
export {
	DECIMAL_SEPARATOR,
	THOUSANDS_SEPARATOR,
	formatQty,
	formatRate,
	formatRatePercent,
	formatUnitPrice,
	formatZar,
	moneyToDecimalString,
	quantityToDecimalString,
	unitPriceToDecimalString
} from './format';
