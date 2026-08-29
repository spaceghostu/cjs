/**
 * ROWS -> DOMAIN.
 *
 * The second of the two doors money can come through. `parseMoneyInput` is the first (a
 * human typed it); this is the other (Postgres returned it). ESLint rule 5 restricts
 * importing `$lib/core/money/ctor` to the money module, this file, and tests — so there is
 * no third way, and a module author who computes `row.cents * 1.15` has nowhere to put the
 * answer.
 *
 * WHY THE CONVERSIONS ARE DEFENSIVE
 * ---------------------------------
 * `int8` is wider than a JavaScript number is exact. node-postgres therefore hands back
 * `bigint` columns as STRINGS by default, and Drizzle's `mode: 'number'` converts them —
 * but a hand-written `sql\`\`` query, a view, or a `count(*)` bypasses that and returns the
 * string. Rather than remember which is which at every call site, every constructor here
 * accepts `string | number | bigint` and refuses anything that is not an exact integer in
 * range. A value that has stopped being exactly representable is a wrong number on
 * somebody's invoice, and it is caught here, at the boundary, or not at all.
 *
 * Nothing in this file talks to the database. It maps values, so it is a pure unit under
 * test.
 */
import {
	MAX_CENTS,
	ZAR,
	type CurrencyCode,
	type Money,
	type Quantity,
	type Rate,
	type UnitPrice
} from '$lib/core/money';
import { money, quantity, rate, unitPrice } from '$lib/core/money/ctor';
import { toBrandColor, type BrandColor } from '$lib/components/theme/brand';
import {
	PRICING_MODES,
	QUOTE_STATUSES,
	TAX_ENGINES,
	TAX_TREATMENTS,
	type Quote,
	type QuoteLine
} from '$lib/core/quoting';
import {
	COST_SOURCES,
	PAYMENT_KINDS,
	PAYMENT_METHODS,
	STORED_INVOICE_STATUSES,
	type Invoice,
	type InvoiceLine,
	type InvoicePayment
} from '$lib/core/invoicing';
import { JOB_PRIORITIES, JOB_STATUSES, type Job } from '$lib/core/jobs';
import type { business, customer, member, MemberRole } from './schema/core';
import type { job } from './schema/jobs';
import type { quote, quoteLine } from './schema/quoting';
import type { invoice, invoiceLine, invoicePayment } from './schema/invoicing';

/** What a numeric column can arrive as, depending on how it was queried. */
export type NumericColumn = string | number | bigint;

/**
 * Narrow a column value to an exact integer.
 *
 * Throws rather than coercing. The alternative — silently returning 0, or NaN, or a rounded
 * approximation — turns a database or driver problem into an arithmetic one that surfaces
 * days later as a total nobody can explain.
 */
function exactInteger(value: NumericColumn, what: string): number {
	if (typeof value === 'bigint') {
		if (value > BigInt(MAX_CENTS) || value < -BigInt(MAX_CENTS)) {
			throw new RangeError(`${what} is outside the exactly-representable range: ${value}`);
		}
		return Number(value);
	}

	if (typeof value === 'string') {
		// Not `parseInt`: it happily reads "12abc" as 12 and "" as NaN. An int8 column that
		// contains anything other than an integer means something upstream is wrong.
		if (!/^-?\d+$/.test(value.trim())) {
			throw new RangeError(`${what} is not an integer column value: "${value}"`);
		}
		return exactInteger(BigInt(value), what);
	}

	if (!Number.isInteger(value)) {
		throw new RangeError(`${what} must be an integer, got ${value}`);
	}
	return value;
}

/** A currency column, narrowed. An unknown code is a corrupt row, not a default. */
export function toCurrency(value: unknown): CurrencyCode {
	if (value === ZAR) return ZAR;
	throw new RangeError(`unsupported currency in row: ${JSON.stringify(value)}`);
}

/** `int8` cents -> `Money`. */
export function toMoney(cents: NumericColumn, currency: unknown = ZAR): Money {
	return money(exactInteger(cents, 'money cents'), toCurrency(currency));
}

/** `int8` millionths of a rand -> `UnitPrice`. */
export function toUnitPrice(micros: NumericColumn, currency: unknown = ZAR): UnitPrice {
	return unitPrice(exactInteger(micros, 'unit price micros'), toCurrency(currency));
}

/** `int8` millionths of a unit -> `Quantity`. */
export function toQuantity(e6: NumericColumn): Quantity {
	return quantity(exactInteger(e6, 'quantity e6'));
}

/** `int8` parts per million -> `Rate`. */
export function toRate(ppm: NumericColumn): Rate {
	return rate(exactInteger(ppm, 'rate ppm'));
}

/**
 * Nullable columns. An outer join or an optional amount gives NULL, and NULL is not zero —
 * "no discount recorded" and "a discount of R0.00" are different facts.
 */
export function toMoneyOrNull(cents: NumericColumn | null, currency: unknown = ZAR): Money | null {
	return cents === null ? null : toMoney(cents, currency);
}

export function toQuantityOrNull(e6: NumericColumn | null): Quantity | null {
	return e6 === null ? null : toQuantity(e6);
}

/**
 * An unrecorded price, which is emphatically not a free one.
 *
 * `inventory_item.cost_micros` is the case this was added for: "nobody has told us what this
 * costs" is a real state, and rendering it as `R0` would be a lie the valuation then adds up.
 */
export function toUnitPriceOrNull(
	micros: NumericColumn | null,
	currency: unknown = ZAR
): UnitPrice | null {
	return micros === null ? null : toUnitPrice(micros, currency);
}

// ── Domain -> column ────────────────────────────────────────────────────────────────
//
// The way back out. Deliberately trivial: the whole point of the object types is that the
// integer inside is already exact, so writing it is a field access and never arithmetic.

export function moneyToColumn(value: Money): number {
	return value.cents;
}

export function unitPriceToColumn(value: UnitPrice): number {
	return value.micros;
}

export function quantityToColumn(value: Quantity): number {
	return value.e6;
}

export function rateToColumn(value: Rate): number {
	return value.ppm;
}

// ── Rows -> domain records ──────────────────────────────────────────────────────────

/**
 * The tenant.
 *
 * `business_id` is the column name (see the note in `schema/core.ts` — it is the primary
 * key so that every RLS policy in the database is one expression). The domain calls it
 * `id`, because outside the database nobody needs to care.
 */
export type Business = {
	id: string;
	tradingName: string;
	legalName: string | null;
	registrationNumber: string | null;
	vatNumber: string | null;
	phone: string | null;
	email: string | null;
	address: PostalAddress;
	brandColor: BrandColor;
	currency: CurrencyCode;
	locale: string;
	aiEnabled: boolean;
};

export type PostalAddress = {
	line1: string | null;
	line2: string | null;
	city: string | null;
	postalCode: string | null;
	country: string;
};

export type Member = {
	id: string;
	businessId: string;
	userId: string;
	role: MemberRole;
};

export type Customer = {
	id: string;
	businessId: string;
	name: string;
	contactPerson: string | null;
	email: string | null;
	phone: string | null;
	vatNumber: string | null;
	address: PostalAddress;
	archivedAt: Date | null;
};

type BusinessRow = typeof business.$inferSelect;
type MemberRow = typeof member.$inferSelect;
type CustomerRow = typeof customer.$inferSelect;
type QuoteRow = typeof quote.$inferSelect;
type QuoteLineRow = typeof quoteLine.$inferSelect;

function toAddress(row: {
	addressLine1: string | null;
	addressLine2: string | null;
	city: string | null;
	postalCode: string | null;
	country: string;
}): PostalAddress {
	return {
		line1: row.addressLine1,
		line2: row.addressLine2,
		city: row.city,
		postalCode: row.postalCode,
		country: row.country
	};
}

export function toBusiness(row: BusinessRow): Business {
	return {
		id: row.businessId,
		tradingName: row.tradingName,
		legalName: row.legalName,
		registrationNumber: row.registrationNumber,
		vatNumber: row.vatNumber,
		phone: row.phone,
		email: row.email,
		address: toAddress(row),
		// Narrows rather than throws: a brand colour that has drifted out of the palette is
		// a cosmetic problem, and blanking someone's dashboard over it would be worse than
		// showing them the default.
		brandColor: toBrandColor(row.brandColor),
		currency: toCurrency(row.currency),
		locale: row.locale,
		aiEnabled: row.aiEnabled
	};
}

export function toMember(row: MemberRow): Member {
	return {
		id: row.id,
		businessId: row.businessId,
		userId: row.userId,
		role: row.role
	};
}

export function toCustomer(row: CustomerRow): Customer {
	return {
		id: row.id,
		businessId: row.businessId,
		name: row.name,
		contactPerson: row.contactPerson,
		email: row.email,
		phone: row.phone,
		vatNumber: row.vatNumber,
		address: toAddress(row),
		archivedAt: row.archivedAt
	};
}

// ── Jobs ────────────────────────────────────────────────────────────────────────────

type JobRow = typeof job.$inferSelect;

/**
 * A job, from its row.
 *
 * The simplest mapper in this file, and that is the point rather than an accident: a job holds
 * no money at all, because the money is on the quotes and invoices linked to it and
 * `$lib/core/jobs/commercial.ts` folds those on read. A mapper with nothing to construct is what
 * the status split looks like from down here.
 *
 * `number_formatted` becomes `ref`: the row keeps prefix, value and formatted so that sorting
 * and printing stay different questions, and the domain type needs only the answer a screen
 * shows.
 */
export function toJob(row: JobRow): Job {
	return {
		id: row.id,
		businessId: row.businessId,
		ref: row.numberFormatted,
		customerId: row.customerId,
		service: row.service,
		area: row.area,
		description: row.description,
		priority: narrow(row.priority, JOB_PRIORITIES, 'job priority'),
		status: narrow(row.status, JOB_STATUSES, 'job status'),
		startedByUserId: row.startedByUserId,
		archivedAt: row.archivedAt,
		createdAt: row.createdAt
	};
}

// ── Quoting ─────────────────────────────────────────────────────────────────────────
//
// Quoting's rows map here rather than inside the module for one reason: this file is the
// only door money may come through from the database, and a quote is nothing BUT money.
// Putting `toQuoteLine` in `modules/quoting` would mean either a second import of
// `money/ctor` — which ESLint refuses — or a module holding raw integers and hoping.

/**
 * A closed union, narrowed from a text column.
 *
 * The CHECK constraints make an unknown value nearly impossible, so reaching the throw means
 * the row is corrupt or the code and the database have drifted apart. Both are worth failing
 * loudly for: the alternative is a quote that silently prices itself under the wrong VAT
 * engine, which is a wrong number on a document somebody signs.
 */
function narrow<T extends string>(value: string, allowed: readonly T[], what: string): T {
	if ((allowed as readonly string[]).includes(value)) return value as T;
	throw new RangeError(`unknown ${what} in row: ${JSON.stringify(value)}`);
}

/**
 * Deposit terms, from the two columns that hold them.
 *
 * `deposit_single_form` guarantees at most one is set, so this reads as three cases rather
 * than four. Neither set means the business asks for no deposit — which is a real answer, not
 * a missing one, and `none` is what stops it printing as "R0,00 on acceptance".
 */
function toDeposit(row: { depositRatePpm: number | null; depositAmountCents: number | null }) {
	if (row.depositRatePpm !== null)
		return { kind: 'rate' as const, rate: toRate(row.depositRatePpm) };
	if (row.depositAmountCents !== null) {
		return { kind: 'amount' as const, amount: toMoney(row.depositAmountCents) };
	}
	return { kind: 'none' as const };
}

export function toQuoteLine(row: QuoteLineRow): QuoteLine {
	return {
		id: row.id,
		position: row.position,
		description: row.description,
		provenance: row.provenance,
		documentDescription: row.documentDescription,
		qty: toQuantity(row.qtyE6),
		unitPrice: toUnitPrice(row.unitPriceMicros, row.currency),
		taxTreatment: narrow(row.taxTreatment, TAX_TREATMENTS, 'tax treatment'),
		vatRate: toRate(row.vatRatePpm),
		sourceItemId: row.sourceItemId
	};
}

/**
 * A quote and its lines.
 *
 * Lines arrive as a separate argument rather than being fetched here — nothing in this file
 * talks to the database, which is what keeps it a pure unit under test. The caller has already
 * filtered out archived lines and ordered them; this does not re-sort, because the order a
 * document prints in is a decision the query made.
 */
export function toQuote(row: QuoteRow, lines: readonly QuoteLineRow[]): Quote {
	return {
		id: row.id,
		status: narrow(row.status, QUOTE_STATUSES, 'quote status'),
		number: row.numberFormatted,
		customer: {
			customerId: row.customerId,
			name: row.customerName,
			contactPerson: row.customerContactPerson,
			email: row.customerEmail,
			phone: row.customerPhone,
			vatNumber: row.customerVatNumber,
			addressLine1: row.customerAddressLine1,
			addressLine2: row.customerAddressLine2,
			city: row.customerCity,
			postalCode: row.customerPostalCode,
			country: row.customerCountry
		},
		sendTo: { name: row.sendToName, email: row.sendToEmail },
		validUntil: row.validUntil,
		deposit: toDeposit(row),
		pricing: {
			mode: narrow(row.pricingMode, PRICING_MODES, 'pricing mode'),
			engine: narrow(row.taxEngine, TAX_ENGINES, 'tax engine'),
			vatRate: toRate(row.vatRatePpm),
			policy: row.vatPolicy
		},
		lines: lines.map(toQuoteLine),
		// The save indicator's only input. `updated_at` is maintained by the `touch_updated_at`
		// trigger, so it reflects what the database actually did — not what the server intended
		// to do, and never an optimistic guess in the browser.
		savedAt: row.updatedAt,
		sentAt: row.sentAt
	};
}

/**
 * The totals a sent quote froze, if it has been sent.
 *
 * Returned as a triple rather than three loose reads so a caller cannot pick up two of the
 * three. `snapshot_complete` makes a partial row unstorable; this makes a partial read
 * unexpressible.
 */
export type QuoteSnapshot = {
	subtotal: Money;
	tax: Money;
	total: Money;
	at: Date;
};

export function toQuoteSnapshot(row: QuoteRow): QuoteSnapshot | null {
	if (
		row.snapshotSubtotalCents === null ||
		row.snapshotTaxCents === null ||
		row.snapshotTotalCents === null ||
		row.snapshotAt === null
	) {
		return null;
	}

	return {
		subtotal: toMoney(row.snapshotSubtotalCents, row.currency),
		tax: toMoney(row.snapshotTaxCents, row.currency),
		total: toMoney(row.snapshotTotalCents, row.currency),
		at: row.snapshotAt
	};
}

// ── Invoicing ───────────────────────────────────────────────────────────────────────
//
// Here for the same reason Quoting's mappers are: this file is the only door money may come
// through from the database, and an invoice is nothing BUT money. Putting `toInvoiceLine` in
// `modules/invoicing` would mean either a second import of `money/ctor` — which ESLint
// refuses — or a module holding raw integers and hoping.

type InvoiceRow = typeof invoice.$inferSelect;
type InvoiceLineRow = typeof invoiceLine.$inferSelect;
type InvoicePaymentRow = typeof invoicePayment.$inferSelect;

export function toInvoiceLine(row: InvoiceLineRow): InvoiceLine {
	return {
		id: row.id,
		position: row.position,
		description: row.description,
		provenance: row.provenance,
		documentDescription: row.documentDescription,
		qty: toQuantity(row.qtyE6),
		unitPrice: toUnitPrice(row.unitPriceMicros, row.currency),
		taxTreatment: narrow(row.taxTreatment, TAX_TREATMENTS, 'tax treatment'),
		vatRate: toRate(row.vatRatePpm),
		noCharge: row.noCharge,
		sourceItemId: row.sourceItemId,
		// Null is a first-class answer here: nobody knows what this line cost. The margin panel
		// says so rather than treating an unknown cost as zero — see `invoicing/margin.ts`.
		cost: row.costMicros === null ? null : toUnitPrice(row.costMicros, row.currency),
		costSource: row.costSource === null ? null : narrow(row.costSource, COST_SOURCES, 'cost source')
	};
}

/**
 * An invoice and its lines.
 *
 * Lines arrive as a separate argument rather than being fetched here — nothing in this file
 * talks to the database, which is what keeps it a pure unit under test. The caller has already
 * filtered out archived lines and ordered them.
 *
 * `status` is the STORED one. `overdue` is derived on read by `effectiveInvoiceStatus`, and a
 * mapper that produced it would be putting a date-dependent value into a cached object.
 */
export function toInvoice(row: InvoiceRow, lines: readonly InvoiceLineRow[]): Invoice {
	return {
		id: row.id,
		status: narrow(row.status, STORED_INVOICE_STATUSES, 'invoice status'),
		number: row.numberFormatted,
		customer: {
			customerId: row.customerId,
			name: row.customerName,
			contactPerson: row.customerContactPerson,
			email: row.customerEmail,
			phone: row.customerPhone,
			vatNumber: row.customerVatNumber,
			addressLine1: row.customerAddressLine1,
			addressLine2: row.customerAddressLine2,
			city: row.customerCity,
			postalCode: row.customerPostalCode,
			country: row.customerCountry
		},
		sendTo: { name: row.sendToName, email: row.sendToEmail },
		issueDate: row.issueDate,
		dueDate: row.dueDate,
		pricing: {
			mode: narrow(row.pricingMode, PRICING_MODES, 'pricing mode'),
			engine: narrow(row.taxEngine, TAX_ENGINES, 'tax engine'),
			vatRate: toRate(row.vatRatePpm),
			policy: row.vatPolicy
		},
		lines: lines.map(toInvoiceLine),
		sourceQuoteId: row.sourceQuoteId,
		sourceQuoteNumber: row.sourceQuoteNumber,
		issuedAt: row.issuedAt,
		viewCount: row.viewCount,
		lastViewedAt: row.lastViewedAt,
		cancelledAt: row.cancelledAt,
		cancelledReason: row.cancelledReason,
		savedAt: row.updatedAt
	};
}

export function toInvoicePayment(row: InvoicePaymentRow): InvoicePayment {
	return {
		id: row.id,
		kind: narrow(row.kind, PAYMENT_KINDS, 'payment kind'),
		amount: toMoney(row.amountCents, row.currency),
		method: narrow(row.method, PAYMENT_METHODS, 'payment method'),
		reference: row.reference,
		receivedOn: row.receivedOn,
		recordedAt: row.recordedAt,
		recordedByUserId: row.recordedByUserId,
		reversesPaymentId: row.reversesPaymentId
	};
}

/**
 * The totals an issued invoice froze.
 *
 * A triple rather than three loose reads, so a caller cannot pick up two of the three.
 * `snapshot_complete` makes a partial row unstorable; this makes a partial read unexpressible.
 */
export type InvoiceSnapshot = {
	subtotal: Money;
	tax: Money;
	total: Money;
	at: Date;
};

export function toInvoiceSnapshot(row: InvoiceRow): InvoiceSnapshot | null {
	if (
		row.snapshotSubtotalCents === null ||
		row.snapshotTaxCents === null ||
		row.snapshotTotalCents === null ||
		row.snapshotAt === null
	) {
		return null;
	}

	return {
		subtotal: toMoney(row.snapshotSubtotalCents, row.currency),
		tax: toMoney(row.snapshotTaxCents, row.currency),
		total: toMoney(row.snapshotTotalCents, row.currency),
		at: row.snapshotAt
	};
}
