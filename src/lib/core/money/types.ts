/**
 * MONEY.
 *
 * The brief's hardest requirement: "Financial accuracy is absolute. Rounding and precision
 * errors in money are not acceptable defects." So float maths on money is not discouraged
 * here — it is a COMPILE ERROR.
 *
 * These are OBJECT types, not branded primitives. That distinction is the whole trick:
 *
 *   const a: Money, b: Money;
 *   a + b;          // TS2365 — operator '+' cannot be applied to 'Money' and 'Money'
 *   a * 0.15;       // TS2362
 *   a < b;          // TS2365 — relational operators need number|bigint|string|enum
 *   -a;             // TS2356
 *
 * A branded `number` would let every one of those through. An object lets through none.
 *
 * The one remaining escape is reaching into the field: `a.cents * 1.15` compiles. It gets
 * you nowhere, because there is no exported way back to `Money` — the constructors live in
 * ./ctor.ts and ESLint restricts importing them to exactly three places: this directory,
 * `db/map.ts` (rows -> domain), and tests. A module author who computes a raw number has
 * nothing to do with it.
 *
 * WHY `number` CENTS AND NOT `bigint`
 * -----------------------------------
 * |cents| < 2^53 is exact in a double — about R90 trillion, comfortably beyond any small
 * business. Using `number` means `JSON.stringify` works, devalue works across the SvelteKit
 * load boundary, and `Intl.NumberFormat` works, so there is NO transport hook to forget.
 * With `bigint` you get a class of bug where a page throws at serialisation, in production
 * only, on the pages that happen to carry money. The exactness that actually matters —
 * price x quantity, VAT extraction — is done in BigInt inside ./math.ts, where overflow is
 * impossible regardless of input magnitude.
 */

declare const MoneyBrand: unique symbol;
declare const PriceBrand: unique symbol;
declare const QtyBrand: unique symbol;
declare const RateBrand: unique symbol;

/**
 * ZAR today. Widening this union later is a FEATURE, not a migration — every money row in
 * the database already stores its currency explicitly, and a composite (id, currency)
 * foreign key from document lines to their header already makes a mixed-currency document
 * a database error rather than a silent wrong total.
 *
 * Legal note for whoever adds the second one: VAT Act s20(4) requires ZAR on a tax invoice
 * for a domestic supply, so multi-currency is confined to export/zero-rated scenarios.
 */
export type CurrencyCode = 'ZAR';

/** An amount of money. Runtime shape is `{ cents, currency }` — plain, serialisable JSON. */
export type Money<C extends CurrencyCode = CurrencyCode> = {
	readonly [MoneyBrand]: true;
	readonly cents: number;
	readonly currency: C;
};

/**
 * A price per unit, in MILLIONTHS of a rand. R33.333333/unit -> 33_333_333.
 *
 * Unit prices need more precision than cents: "R100 for 3" is R33.333333 each, and storing
 * that as R33.33 loses a cent on every third line. The rounding to cents happens once, at
 * the line amount.
 */
export type UnitPrice<C extends CurrencyCode = CurrencyCode> = {
	readonly [PriceBrand]: true;
	readonly micros: number;
	readonly currency: C;
};

/** A quantity, in millionths of a unit. 2.5 hours -> 2_500_000. Not money — no currency. */
export type Quantity = { readonly [QtyBrand]: true; readonly e6: number };

/** A ratio in parts per million. 15% -> 150_000. A 7.5% discount -> 75_000. */
export type Rate = { readonly [RateBrand]: true; readonly ppm: number };

/**
 * 2^53 - 1 cents ~ R90 trillion. Enforced in code by `roundDiv` and at the database by a
 * CHECK on every money column, so a corrupt or hostile input cannot silently produce a
 * number that has stopped being exact.
 */
export const MAX_CENTS = 9_007_199_254_740_991;

/** The default currency everywhere until the union widens. */
export const ZAR: CurrencyCode = 'ZAR';
