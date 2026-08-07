/**
 * WHAT A QUOTE IS, on both sides of the network.
 *
 * Client-safe, and that is the point. The editor's whole promise — "the document is
 * client-facing, so it leads", a live preview beside the form — only holds if the browser can
 * price a quote without asking the server. `priceDocument` is pure and already client-safe, so
 * the model it works on has to be too.
 *
 * Nothing here touches the database, `$lib/server`, or the DOM. `db/map.ts` turns rows into
 * these; `$lib/components/quoting` and `$lib/components/document` render them; the PDF worker
 * uses the same functions the browser does, which is what stops the preview and the sent
 * document from ever disagreeing.
 */
import type {
	Money,
	PricingMode,
	Quantity,
	Rate,
	TaxEngineId,
	TaxTreatment,
	UnitPrice
} from '$lib/core/money';

/**
 * The six states T15 names.
 *
 * `viewed` sits between sent and answered because the design's copy depends on it — "Opened it
 * twice" is a different sentence from "sent 4 days ago, no word yet". `expired` is reached by
 * the calendar rather than by an act, so it is derived on read as well as written by the
 * sweeper: a quote whose valid-until passed at midnight is expired even if nothing has run.
 */
export const QUOTE_STATUSES = [
	'draft',
	'sent',
	'viewed',
	'accepted',
	'declined',
	'expired'
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export function isQuoteStatus(value: unknown): value is QuoteStatus {
	return typeof value === 'string' && (QUOTE_STATUSES as readonly string[]).includes(value);
}

/**
 * The money engine's vocabulary, as runtime lists.
 *
 * `$lib/core/money` exports these as TYPES only — nothing in the engine needs to enumerate
 * them. The database does, because every one of them is a CHECK constraint, so the lists live
 * here with a `satisfies` that turns any future drift between the two into a compile error
 * rather than a constraint that quietly refuses a legitimate value.
 */
export const PRICING_MODES = ['exclusive', 'inclusive'] as const satisfies readonly PricingMode[];
export const TAX_ENGINES = ['za_vat', 'none'] as const satisfies readonly TaxEngineId[];
export const TAX_TREATMENTS = [
	'standard',
	'zero_rated',
	'exempt',
	'no_vat'
] as const satisfies readonly TaxTreatment[];

/**
 * The South African standard rate, in parts per million.
 *
 * A constant rather than configuration, and snapshotted onto every quote and every line the
 * moment one is created — so the day the rate changes, documents already issued keep the rate
 * they were issued under. That is the same discipline `VAT_POLICY` applies to the arithmetic,
 * applied to the number the arithmetic uses.
 */
export const STANDARD_VAT_RATE_PPM = 150_000;

/**
 * A calendar date, `YYYY-MM-DD`.
 *
 * "Valid until 22 August" is a promise about a day, not an instant. Carrying it as a `Date`
 * would attach a timezone to it, and the quote would then expire at a different moment for the
 * client reading it than for the business that sent it. See `validity.ts`.
 */
export type CalendarDate = string;

/** One line, as the editor holds it and the document prints it. */
export type QuoteLine = {
	readonly id: string;
	readonly position: number;
	/** What the editor's table shows. */
	readonly description: string;
	/** The 12px second line: "From Inventory · European oak, 40mm". */
	readonly provenance: string | null;
	/** What the DOCUMENT shows, when it says more than the editor does. Null means "the same". */
	readonly documentDescription: string | null;
	readonly qty: Quantity;
	readonly unitPrice: UnitPrice;
	readonly taxTreatment: TaxTreatment;
	readonly vatRate: Rate;
	/** The inventory item this came from, if any. Provenance, never a live link. */
	readonly sourceItemId: string | null;
};

/** What this document says about the client — the quote's own copy, not the address book's. */
export type QuoteCustomer = {
	readonly customerId: string | null;
	readonly name: string | null;
	readonly contactPerson: string | null;
	readonly email: string | null;
	readonly phone: string | null;
	readonly vatNumber: string | null;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly city: string | null;
	readonly postalCode: string | null;
	readonly country: string;
};

/** Who the quote is emailed to. A person at the client, on this quote. */
export type SendTo = {
	readonly name: string | null;
	readonly email: string | null;
};

/**
 * Deposit terms.
 *
 * Two forms because both are things people ask for: "50% to start" and "R5 000 to start". The
 * database refuses to hold both at once, and `none` is a first-class answer rather than a zero
 * — a business that asks for no deposit prints no deposit line at all.
 */
export type DepositTerms =
	| { readonly kind: 'none' }
	| { readonly kind: 'rate'; readonly rate: Rate }
	| { readonly kind: 'amount'; readonly amount: Money };

/**
 * The pricing contract this document was issued under.
 *
 * Snapshotted on the row and carried here rather than read from configuration: a VAT rate
 * change must not alter a quote a client already holds.
 */
export type QuotePricing = {
	readonly mode: PricingMode;
	readonly engine: TaxEngineId;
	readonly vatRate: Rate;
	readonly policy: string;
};

/** A quote, whole. What the editor edits and the renderer renders. */
export type Quote = {
	readonly id: string;
	readonly status: QuoteStatus;
	/** `QT-1043`. Null until the quote is sent — see `schema/quoting.ts`. */
	readonly number: string | null;
	readonly customer: QuoteCustomer;
	readonly sendTo: SendTo;
	readonly validUntil: CalendarDate | null;
	readonly deposit: DepositTerms;
	readonly pricing: QuotePricing;
	readonly lines: readonly QuoteLine[];
	/** When the server last persisted a change. The save indicator reads this and nothing else. */
	readonly savedAt: Date;
	readonly sentAt: Date | null;
};
