/**
 * WHAT CROSSES THE NETWORK.
 *
 * The autosave payload and the list row, as types both sides hold. The browser builds them; the
 * server validates with zod (`modules/invoicing/wire.ts`) and never trusts one before that.
 * Declaring the shape here rather than only in the validator means a change to the editor's form
 * and a change to what the server accepts cannot compile independently of each other.
 *
 * WHY THE WHOLE DOCUMENT, EVERY TIME
 * ----------------------------------
 * The same reasoning as `quoting/wire.ts`: a granular patch stream has to arrive in order to be
 * correct, and an autosaving editor on a train does not guarantee that. A full document is
 * idempotent — the last one to arrive is the truth, which is also the only rule a person can
 * predict.
 *
 * MONEY CROSSES AS INTEGERS, produced by the sanctioned parsers in the browser and rebuilt
 * through `db/map.ts` on the way in. A number that arrived over the network is an input like any
 * other.
 */
import type { Money } from '$lib/core/money';
import type { TaxTreatment } from '$lib/core/money';
import type { CalendarDate } from '$lib/core/calendar';
import type { InvoiceStatus, PaymentMethod } from './types';

/** One line, as the editor holds it. `id` is minted in the browser for a new line. */
export type LinePatch = {
	readonly id: string;
	readonly position: number;
	readonly description: string;
	readonly provenance: string | null;
	readonly documentDescription: string | null;
	/** Millionths of a unit. */
	readonly qtyE6: number;
	/** Millionths of a rand. */
	readonly unitPriceMicros: number;
	readonly taxTreatment: TaxTreatment;
	/**
	 * Included, no charge — the design's `±0.00`.
	 *
	 * Sent explicitly rather than inferred from a zero price, because the two facts differ: a
	 * line somebody has not priced yet is also zero, and the editor must be able to warn about
	 * one and stay quiet about the other.
	 */
	readonly noCharge: boolean;
	/** The inventory item this line was picked from, if any. */
	readonly sourceItemId: string | null;
};

/** What this document says about the client — the invoice's own copy, editable in place. */
export type CustomerPatch = {
	readonly name: string | null;
	readonly contactPerson: string | null;
	readonly email: string | null;
	readonly phone: string | null;
	readonly vatNumber: string | null;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly city: string | null;
	readonly postalCode: string | null;
};

export type InvoicePatch = {
	readonly customerId: string | null;
	readonly customer: CustomerPatch;
	readonly sendToName: string | null;
	readonly sendToEmail: string | null;
	readonly dueDate: CalendarDate | null;
	readonly lines: readonly LinePatch[];
};

/** What a save returns. `savedAt` is the database's `updated_at`, never the browser's clock. */
export type SaveResult = {
	/** ISO 8601. */
	readonly savedAt: string;
};

/**
 * Recording a payment.
 *
 * `receivedOn` is the day the MONEY moved, which is not the day somebody typed it in — a
 * Thursday payment entered on Monday is a Thursday payment, and the ledger has to agree with the
 * bank statement rather than with the data entry.
 */
export type PaymentInput = {
	/** Cents. Positive; direction is not the client's to choose. */
	readonly amountCents: number;
	readonly receivedOn: CalendarDate;
	readonly method: PaymentMethod;
	readonly reference: string | null;
};

/**
 * A row in the invoices list.
 *
 * Not an `Invoice`: the list shows one line per invoice and never its lines, and loading every
 * line of every invoice to render a total nobody asked for is the N+1 the review checklist
 * names. The total comes from the SNAPSHOT for an issued invoice and is null for a draft — a
 * draft's total is only knowable by pricing it, and the list is not the place to do that fifty
 * times. The design agrees: a draft shows `—`.
 */
export type InvoiceListItem = {
	readonly id: string;
	readonly number: string | null;
	/** Derived — `overdue` is never read from a column. */
	readonly status: InvoiceStatus;
	readonly customerName: string | null;
	readonly issueDate: CalendarDate | null;
	readonly dueDate: CalendarDate | null;
	/** The day it settled, for "Paid 24 Jul". */
	readonly paidOn: CalendarDate | null;
	readonly total: Money | null;
	/** What is still owed on it. Null on a draft, zero once settled. */
	readonly outstanding: Money | null;
	/** A draft with at least one priced line. Drives "Draft · needs an amount". */
	readonly hasAmount: boolean;
	readonly updatedAt: Date;
};
