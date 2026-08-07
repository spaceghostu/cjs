/**
 * WHAT AN INVOICE IS, on both sides of the network.
 *
 * Client-safe, like Quoting's model and for the same reason: the totals a screen shows and the
 * totals the PDF prints come out of the same pure functions, so the two cannot drift. Nothing
 * here touches the database, `$lib/server`, or the DOM.
 *
 * THE ONE THING AN INVOICE IS THAT A QUOTE IS NOT
 * ----------------------------------------------
 * A tax record. `.env.example` states why the database is physically in South Africa (SARS
 * GN 787 rule 4.1) and `0003_platform.sql` revokes DELETE so that "business records are never
 * destroyed" is structural. Invoicing is the module those two decisions were made for, and the
 * model below carries that: an issued invoice is immutable, a payment is reversed by a row and
 * never removed, and a cancellation is a one-way door.
 *
 * WHY THIS DUPLICATES A LITTLE OF `$lib/core/quoting`
 * --------------------------------------------------
 * `InvoiceCustomer` is field-for-field `QuoteCustomer`, and that is on purpose. The two modules
 * do not import each other — ESLint zone 3 says so for the server halves, and the same reasoning
 * holds here: a business may own Invoicing and not Quoting, and the day one module's document
 * needs a field the other's does not, a shared type is a change to both. Thirty lines of
 * repetition is the cheaper side of that trade.
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
import type { CalendarDate } from '$lib/core/calendar';

/**
 * WHAT A ROW MAY HOLD.
 *
 * Five, and `overdue` is deliberately not among them. T19: "overdue is derived from the due
 * date, not stored — storing it guarantees a stale row somewhere." An invoice becomes overdue
 * at midnight, by the calendar, with nothing running; a stored flag would be correct only until
 * the next day and wrong for every business whose sweeper had not reached them yet.
 *
 * The database CHECK constraint is built from this list, so the stored vocabulary and the type
 * cannot disagree.
 */
export const STORED_INVOICE_STATUSES = ['draft', 'sent', 'viewed', 'paid', 'cancelled'] as const;

export type StoredInvoiceStatus = (typeof STORED_INVOICE_STATUSES)[number];

/**
 * WHAT A SCREEN MAY SHOW — the design's own six, from its filter tabs and badges.
 *
 * `overdue` appears here and nowhere in storage. `effectiveInvoiceStatus` is the one function
 * that produces it, and every list, badge and count reads through that function.
 */
export const INVOICE_STATUSES = [...STORED_INVOICE_STATUSES, 'overdue'] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export function isStoredInvoiceStatus(value: unknown): value is StoredInvoiceStatus {
	return (
		typeof value === 'string' && (STORED_INVOICE_STATUSES as readonly string[]).includes(value)
	);
}

export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
	return typeof value === 'string' && (INVOICE_STATUSES as readonly string[]).includes(value);
}

/**
 * HOW LONG A RECORDED PAYMENT CAN BE TAKEN BACK.
 *
 * The design states it on the screen, in advance of the action: "Recording a payment can be
 * undone for 30 days. Cancelling an invoice can't — we'll ask you to confirm." One constant
 * behind that sentence, the server rule and the database trigger, so the promise on the screen
 * and the rule that enforces it cannot drift apart.
 */
export const REVERSAL_WINDOW_DAYS = 30;

/**
 * How the money arrived. A closed list because it is a CHECK constraint, and because "EFT"
 * and "eft" and "bank transfer" in one column is a report nobody can run.
 */
export const PAYMENT_METHODS = ['eft', 'cash', 'card', 'debit_order', 'other'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** A payment row, or the row that takes one back. Never a deletion — see the file header. */
export const PAYMENT_KINDS = ['payment', 'reversal'] as const;

export type PaymentKind = (typeof PAYMENT_KINDS)[number];

/**
 * The activity timeline in T21, as a closed vocabulary.
 *
 * `opened` is the client's, and it is counted rather than listed once per open — "Twice · last
 * 26 Jul, 08:41" is one line about two events.
 */
export const INVOICE_EVENT_KINDS = [
	'created',
	'issued',
	'emailed',
	'opened',
	'reminded',
	'paid',
	'part_paid',
	'payment_reversed',
	'cancelled'
] as const;

export type InvoiceEventKind = (typeof INVOICE_EVENT_KINDS)[number];

/** `business` (somebody signed in), `client` (the shared link), `system` (a background job). */
export const INVOICE_EVENT_ACTORS = ['business', 'client', 'system'] as const;

export type InvoiceEventActor = (typeof INVOICE_EVENT_ACTORS)[number];

/**
 * WHERE A LINE'S COST CAME FROM.
 *
 * `inventory` is the design's promise made checkable — "Materials came from Inventory at the
 * price you paid" is only true if the cost was snapshotted from a stock item at the moment the
 * line was added. `manual` is a cost somebody typed. Null is the honest third answer: nobody
 * knows what this line cost, and the margin panel says so rather than guessing.
 */
export const COST_SOURCES = ['inventory', 'manual'] as const;

export type CostSource = (typeof COST_SOURCES)[number];

/** One line of what is being billed. */
export type InvoiceLine = {
	readonly id: string;
	readonly position: number;
	readonly description: string;
	/** The 12px second line: "From Inventory · European oak, 40mm". */
	readonly provenance: string | null;
	/** What the DOCUMENT shows, when it says more than the editor does. Null means "the same". */
	readonly documentDescription: string | null;
	readonly qty: Quantity;
	readonly unitPrice: UnitPrice;
	readonly taxTreatment: TaxTreatment;
	readonly vatRate: Rate;
	/**
	 * INCLUDED, NO CHARGE — the design's `±0.00` on "Fitting and finishing".
	 *
	 * A deliberate zero is not the same fact as a price nobody has filled in yet, and a document
	 * that renders both as `0,00` has lost the difference. The flag is what lets the editor warn
	 * about one and stay quiet about the other, and what lets the document say "included" where
	 * the design shows a bare zero.
	 */
	readonly noCharge: boolean;
	/** The inventory item this came from, if any. Provenance, never a live link. */
	readonly sourceItemId: string | null;
	/**
	 * What ONE of this line cost, when that is known — the margin panel's input.
	 *
	 * A unit cost rather than a line cost, in millionths like every other unit price, so that
	 * "two shelving units cost me R1 830 each" survives a change of quantity and the line cost
	 * comes out of the same `lineAmount` the charge does. Null means nobody knows, which the
	 * panel states rather than guessing at.
	 */
	readonly cost: UnitPrice | null;
	readonly costSource: CostSource | null;
};

/** What this document says about the client — the invoice's own copy, not the address book's. */
export type InvoiceCustomer = {
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

/** Who it is emailed to. A person at the client, on this invoice. */
export type SendTo = {
	readonly name: string | null;
	readonly email: string | null;
};

/**
 * The pricing contract this document was issued under.
 *
 * Snapshotted on the row and carried here rather than read from configuration: a VAT rate change
 * must not alter an invoice already in a client's hands, and on a tax record that is not a
 * preference — it is the difference between the document and the return that was filed from it.
 */
export type InvoicePricing = {
	readonly mode: PricingMode;
	readonly engine: TaxEngineId;
	readonly vatRate: Rate;
	readonly policy: string;
};

/** One recorded payment, or one reversal of one. */
export type InvoicePayment = {
	readonly id: string;
	readonly kind: PaymentKind;
	/** Always positive. `kind` carries the direction — see `settlement.ts`. */
	readonly amount: Money;
	readonly method: PaymentMethod;
	readonly reference: string | null;
	/** The day the money moved, which is not the day somebody typed it in. */
	readonly receivedOn: CalendarDate;
	readonly recordedAt: Date;
	readonly recordedByUserId: string | null;
	/** The payment this row takes back. Set on a reversal, null on a payment. */
	readonly reversesPaymentId: string | null;
};

/** One thing that happened, for the timeline. */
export type InvoiceEvent = {
	readonly id: string;
	readonly kind: InvoiceEventKind;
	readonly actor: InvoiceEventActor;
	readonly actorUserId: string | null;
	readonly detail: string | null;
	readonly occurredAt: Date;
};

/** An invoice, whole. What the screens render and the document prints. */
export type Invoice = {
	readonly id: string;
	/** What is STORED. Screens use `effectiveInvoiceStatus` — `overdue` never lives here. */
	readonly status: StoredInvoiceStatus;
	/** `INV-1042`. Null until the invoice is issued — a draft has no number. */
	readonly number: string | null;
	readonly customer: InvoiceCustomer;
	readonly sendTo: SendTo;
	/** The day it was issued. Null on a draft, which has not been issued. */
	readonly issueDate: CalendarDate | null;
	/** The day it falls due. */
	readonly dueDate: CalendarDate | null;
	readonly pricing: InvoicePricing;
	readonly lines: readonly InvoiceLine[];
	/** "Created from quote QT-1036" — the quote this came from, when there was one. */
	readonly sourceQuoteId: string | null;
	readonly sourceQuoteNumber: string | null;
	readonly issuedAt: Date | null;
	readonly viewCount: number;
	readonly lastViewedAt: Date | null;
	readonly cancelledAt: Date | null;
	readonly cancelledReason: string | null;
	readonly savedAt: Date;
};
