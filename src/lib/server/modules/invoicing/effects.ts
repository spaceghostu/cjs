/**
 * WRITING INVOICES.
 *
 * Four acts, and the difference between them is the whole module:
 *
 *   EDITING A DRAFT     ordinary. Autosave, the same shape as Quoting's.
 *   ISSUING             one transaction: the number, the totals, the token, the status, the
 *                       ledger entry, the event and the email. All of it or none of it.
 *   RECORDING A PAYMENT reversible for thirty days, by a row.
 *   CANCELLING          one-way, and refused once money has been received.
 *
 * AFTER ISSUE, NOTHING HERE CAN EDIT A DOCUMENT — and that is not a property of this file. The
 * `freeze_issued_invoice` trigger in `0007_invoicing.sql` refuses the write at the database, so
 * a mistake in this file becomes a loud failure rather than a quietly altered tax record. The
 * checks below exist to produce a sentence a person can act on; the trigger exists because a
 * form is a suggestion and a database is where a rule lives.
 */
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { VAT_POLICY, type Money } from '$lib/core/money';
import { notFoundMessage } from '$lib/core/refusals';
import { STANDARD_VAT_RATE_PPM } from '$lib/core/quoting';
import { addDays, todayIn, type CalendarDate } from '$lib/core/calendar';
import {
	canReverse,
	settle,
	statusAfterSettlement,
	type InvoicePatch,
	type PaymentInput
} from '$lib/core/invoicing';
import { customer as customerTable } from '$lib/server/core/db/schema/core';
import { invoice, invoiceLine, invoicePayment } from '$lib/server/core/db/schema/invoicing';
import { toMoney, type Business } from '$lib/server/core/db/map';
import type { Tx } from '$lib/server/core/db/tx';
import { recordEvent } from './events';
import { postPaymentReceived, postPaymentReversed, postInvoiceCancelled } from './ledger';
import { loadInvoiceRow, loadPayments, loadSettings } from './queries';

/**
 * An issued invoice is frozen.
 *
 * `sent`, `viewed`, `paid` and `cancelled` all mean somebody outside the business has, or had, a
 * copy. Corrections are credit notes, not edits — which is what the `credit_note` sequence in
 * `core_document_number` has been reserved for since M2.
 */
export class InvoiceNotEditable extends Error {
	constructor(readonly status: string) {
		super(
			`This invoice has been issued, so it can't be changed. ` +
				`Corrections to an issued invoice are made with a credit note.`
		);
		this.name = 'InvoiceNotEditable';
	}
}

/** Something a person did that cannot be done, with a sentence explaining it. */
export class CannotDoThat extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CannotDoThat';
	}
}

/**
 * A new draft.
 *
 * The pricing contract is decided HERE, once, and snapshotted onto the row — never read from
 * configuration when the invoice is rendered. The tax engine follows the business's VAT
 * registration: `priceDocument` under engine `none` collapses the document into a single no-VAT
 * group, so a non-vendor cannot accidentally print a rate. VAT Act s58(1)(a) makes representing
 * tax where none is payable a criminal offence, which is too serious to leave to a template
 * remembering to branch.
 */
export async function createDraft(
	tx: Tx,
	business: Business,
	options: { now?: Date; customerId?: string | null } = {}
): Promise<string> {
	const { now = new Date(), customerId = null } = options;
	const settings = await loadSettings(tx);
	const today = todayIn(now);

	const [row] = await tx
		.insert(invoice)
		.values({
			businessId: business.id,
			customerId,
			status: 'draft',
			// The due date is offered from the business's own terms — "your usual 14 days" — and
			// the issue date is left null until the invoice is actually issued, because a draft
			// has not been issued and dating it today would be a lie that ages.
			dueDate: addDays(today, settings.paymentTermsDays),
			pricingMode: 'exclusive',
			taxEngine: business.vatNumber ? 'za_vat' : 'none',
			vatRatePpm: STANDARD_VAT_RATE_PPM,
			vatPolicy: VAT_POLICY,
			currency: business.currency
		})
		.returning({ id: invoice.id });

	if (customerId) await copyCustomerOntoInvoice(tx, row.id, customerId);
	return row.id;
}

/**
 * AN INVOICE FROM AN ACCEPTED QUOTE — the design's "Created from quote QT-1036".
 *
 * The lines are COPIED, not referenced. The quote is a document of its own that must not change
 * when the invoice does, and the invoice must survive the business removing Quoting entirely —
 * which is why `source_quote_id` is not a foreign key and the quote's NUMBER is copied alongside
 * it, so the timeline can say `QT-1036` without reaching into another module.
 *
 * The pricing contract is copied too. An invoice raised from a quote charges what the quote
 * promised, at the rate the quote promised it, even if the rate has changed since.
 */
export async function createFromQuote(
	tx: Tx,
	business: Business,
	source: {
		readonly quoteId: string;
		readonly quoteNumber: string | null;
		readonly customerId: string | null;
		readonly customer: Record<string, string | null>;
		readonly sendToName: string | null;
		readonly sendToEmail: string | null;
		readonly pricingMode: string;
		readonly taxEngine: string;
		readonly vatRatePpm: number;
		readonly vatPolicy: string;
		readonly currency: string;
		readonly lines: readonly {
			readonly position: number;
			readonly description: string;
			readonly provenance: string | null;
			readonly documentDescription: string | null;
			readonly qtyE6: number;
			readonly unitPriceMicros: number;
			readonly taxTreatment: string;
			readonly vatRatePpm: number;
			readonly sourceItemId: string | null;
		}[];
	},
	options: { now?: Date } = {}
): Promise<string> {
	const { now = new Date() } = options;
	const settings = await loadSettings(tx);
	const today = todayIn(now);

	const [row] = await tx
		.insert(invoice)
		.values({
			businessId: business.id,
			customerId: source.customerId,
			customerName: source.customer.name ?? null,
			customerContactPerson: source.customer.contactPerson ?? null,
			customerEmail: source.customer.email ?? null,
			customerPhone: source.customer.phone ?? null,
			customerVatNumber: source.customer.vatNumber ?? null,
			customerAddressLine1: source.customer.addressLine1 ?? null,
			customerAddressLine2: source.customer.addressLine2 ?? null,
			customerCity: source.customer.city ?? null,
			customerPostalCode: source.customer.postalCode ?? null,
			customerCountry: source.customer.country ?? 'ZA',
			sendToName: source.sendToName,
			sendToEmail: source.sendToEmail,
			status: 'draft',
			dueDate: addDays(today, settings.paymentTermsDays),
			sourceQuoteId: source.quoteId,
			sourceQuoteNumber: source.quoteNumber,
			pricingMode: source.pricingMode,
			taxEngine: source.taxEngine,
			vatRatePpm: source.vatRatePpm,
			vatPolicy: source.vatPolicy,
			currency: source.currency
		})
		.returning({ id: invoice.id });

	if (source.lines.length > 0) {
		await tx.insert(invoiceLine).values(
			source.lines.map((line) => ({
				businessId: business.id,
				invoiceId: row.id,
				position: line.position,
				description: line.description,
				provenance: line.provenance,
				documentDescription: line.documentDescription,
				qtyE6: line.qtyE6,
				unitPriceMicros: line.unitPriceMicros,
				currency: source.currency,
				taxTreatment: line.taxTreatment,
				vatRatePpm: line.vatRatePpm,
				sourceItemId: line.sourceItemId,
				sourceCapturedAt: line.sourceItemId ? now : null
			}))
		);
	}

	await recordEvent(tx, business.id, row.id, {
		kind: 'created',
		actor: 'business',
		detail: source.quoteNumber ? `from quote ${source.quoteNumber}` : 'from a quote',
		occurredAt: now
	});

	return row.id;
}

/**
 * BILL THE SAME THING AGAIN — T21's "Duplicate".
 *
 * A new DRAFT carrying this invoice's client, lines and pricing contract. Not a copy of the
 * document: it has no number, no dates, no snapshot and no share token, because none of those
 * belong to anything but the invoice that earned them. What it is for is the ordinary case of a
 * business that bills the same client for the same work every month.
 *
 * The DUE DATE is recalculated from today rather than copied. A duplicate of a January invoice
 * that arrived already overdue would be a trap, not a shortcut.
 *
 * The cost snapshots are copied too. They were what those materials cost when the job was done,
 * and a duplicate raised the same week should not silently lose its margin figures — but
 * `source_captured_at` keeps saying when they were true, so a duplicate raised a year later is
 * visibly working from old costs rather than pretending to be current.
 */
export async function duplicateInvoice(
	tx: Tx,
	business: Business,
	invoiceId: string,
	options: { now?: Date } = {}
): Promise<string> {
	const { now = new Date() } = options;

	const source = await loadInvoiceRow(tx, invoiceId);
	if (!source) throw new CannotDoThat(notFoundMessage('invoice'));

	const settings = await loadSettings(tx);
	const today = todayIn(now);

	const [row] = await tx
		.insert(invoice)
		.values({
			businessId: business.id,
			customerId: source.customerId,
			customerName: source.customerName,
			customerContactPerson: source.customerContactPerson,
			customerEmail: source.customerEmail,
			customerPhone: source.customerPhone,
			customerVatNumber: source.customerVatNumber,
			customerAddressLine1: source.customerAddressLine1,
			customerAddressLine2: source.customerAddressLine2,
			customerCity: source.customerCity,
			customerPostalCode: source.customerPostalCode,
			customerCountry: source.customerCountry,
			sendToName: source.sendToName,
			sendToEmail: source.sendToEmail,
			status: 'draft',
			dueDate: addDays(today, settings.paymentTermsDays),
			// The pricing contract is copied from the invoice being duplicated, not re-derived: a
			// business that deregistered for VAT last month should not have last month's document
			// silently re-issued under a different engine.
			pricingMode: source.pricingMode,
			taxEngine: source.taxEngine,
			vatRatePpm: source.vatRatePpm,
			vatPolicy: source.vatPolicy,
			currency: source.currency
		})
		.returning({ id: invoice.id });

	const lines = await tx
		.select()
		.from(invoiceLine)
		.where(and(eq(invoiceLine.invoiceId, invoiceId), isNull(invoiceLine.archivedAt)))
		.orderBy(invoiceLine.position);

	if (lines.length > 0) {
		await tx.insert(invoiceLine).values(
			lines.map((line) => ({
				businessId: business.id,
				invoiceId: row.id,
				position: line.position,
				description: line.description,
				provenance: line.provenance,
				documentDescription: line.documentDescription,
				qtyE6: line.qtyE6,
				unitPriceMicros: line.unitPriceMicros,
				currency: source.currency,
				taxTreatment: line.taxTreatment,
				vatRatePpm: line.vatRatePpm,
				noCharge: line.noCharge,
				sourceItemId: line.sourceItemId,
				sourceCapturedAt: line.sourceCapturedAt,
				costMicros: line.costMicros,
				costSource: line.costSource,
				costCapturedAt: line.costCapturedAt
			}))
		);
	}

	await recordEvent(tx, business.id, row.id, {
		kind: 'created',
		actor: 'business',
		detail: source.numberFormatted ? `copied from ${source.numberFormatted}` : 'copied',
		occurredAt: now
	});

	return row.id;
}

/**
 * Copy the address book entry onto the invoice — snapshot 1, taken once.
 *
 * Runs when the client is chosen and never again. From that moment the invoice owns what it says
 * about the customer, which is what stops a typo corrected on next month's document from
 * rewriting the address on a tax record from last year.
 */
async function copyCustomerOntoInvoice(
	tx: Tx,
	invoiceId: string,
	customerId: string
): Promise<void> {
	const [c] = await tx.select().from(customerTable).where(eq(customerTable.id, customerId));
	if (!c) return;

	await tx
		.update(invoice)
		.set({
			customerId: c.id,
			customerName: c.name,
			customerContactPerson: c.contactPerson,
			customerEmail: c.email,
			customerPhone: c.phone,
			customerVatNumber: c.vatNumber,
			customerAddressLine1: c.addressLine1,
			customerAddressLine2: c.addressLine2,
			customerCity: c.city,
			customerPostalCode: c.postalCode,
			customerCountry: c.country,
			sendToName: c.contactPerson,
			sendToEmail: c.email
		})
		.where(eq(invoice.id, invoiceId));
}

/**
 * THE AUTOSAVE.
 *
 * One transaction: the header, every line that is still there, and an archival sweep for every
 * line that is not. Line reconciliation is by id, and the id is minted in the BROWSER — which is
 * what makes the save idempotent, so a retry after a flaky connection cannot double a line.
 */
export async function saveDraft(
	tx: Tx,
	businessId: string,
	invoiceId: string,
	patch: InvoicePatch
): Promise<Date> {
	const [header] = await tx.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
	if (!header) throw new Error(`No such invoice: ${invoiceId}`);
	if (header.status !== 'draft') throw new InvoiceNotEditable(header.status);

	// Choosing a client for the first time takes the snapshot. Choosing a DIFFERENT one retakes
	// it — the document is now for somebody else, and carrying the previous client's address
	// across would be worse than any edit it might overwrite.
	if (patch.customerId && patch.customerId !== header.customerId) {
		await copyCustomerOntoInvoice(tx, invoiceId, patch.customerId);
	}

	await tx
		.update(invoice)
		.set({
			customerId: patch.customerId,
			customerName: patch.customer.name,
			customerContactPerson: patch.customer.contactPerson,
			customerEmail: patch.customer.email,
			customerPhone: patch.customer.phone,
			customerVatNumber: patch.customer.vatNumber,
			customerAddressLine1: patch.customer.addressLine1,
			customerAddressLine2: patch.customer.addressLine2,
			customerCity: patch.customer.city,
			customerPostalCode: patch.customer.postalCode,
			sendToName: patch.sendToName,
			sendToEmail: patch.sendToEmail,
			dueDate: patch.dueDate
		})
		.where(eq(invoice.id, invoiceId));

	await reconcileLines(tx, businessId, header.currency, header.vatRatePpm, invoiceId, patch);

	// Read the timestamp back rather than assuming it. The trigger set it, and the trigger is the
	// only thing that knows when.
	const [saved] = await tx
		.select({ updatedAt: invoice.updatedAt })
		.from(invoice)
		.where(eq(invoice.id, invoiceId));

	return saved.updatedAt;
}

/**
 * Lines in, missing lines archived.
 *
 * `onConflictDoUpdate` makes insert-or-update one statement per line. The archival sweep is a
 * single `UPDATE … WHERE id NOT IN (…)`, with the empty case spelled separately: `NOT IN ()` is
 * not valid SQL, and an invoice with every line removed is exactly when the sweep matters most.
 */
async function reconcileLines(
	tx: Tx,
	businessId: string,
	currency: string,
	vatRatePpm: number,
	invoiceId: string,
	patch: InvoicePatch
): Promise<void> {
	for (const line of patch.lines) {
		await tx
			.insert(invoiceLine)
			.values({
				id: line.id,
				businessId,
				invoiceId,
				position: line.position,
				description: line.description,
				provenance: line.provenance,
				documentDescription: line.documentDescription,
				qtyE6: line.qtyE6,
				unitPriceMicros: line.unitPriceMicros,
				currency,
				taxTreatment: line.taxTreatment,
				// The RATE IS NOT THE CLIENT'S TO SEND. It is the one this invoice was created
				// under, snapshotted on the header, and a browser that offered a different one
				// would be changing the tax on a tax record.
				vatRatePpm,
				noCharge: line.noCharge,
				sourceItemId: line.sourceItemId,
				sourceCapturedAt: line.sourceItemId ? new Date() : null
			})
			.onConflictDoUpdate({
				target: invoiceLine.id,
				set: {
					position: line.position,
					description: line.description,
					provenance: line.provenance,
					documentDescription: line.documentDescription,
					qtyE6: line.qtyE6,
					unitPriceMicros: line.unitPriceMicros,
					taxTreatment: line.taxTreatment,
					noCharge: line.noCharge,
					// An archived line whose id comes back is a line somebody un-deleted, which an
					// undo does. Clearing it here is what makes that work.
					archivedAt: null
				}
			});
	}

	const keep = patch.lines.map((l) => l.id);
	const stillHere = and(eq(invoiceLine.invoiceId, invoiceId), isNull(invoiceLine.archivedAt));

	await tx
		.update(invoiceLine)
		.set({ archivedAt: sql`now()` })
		.where(keep.length === 0 ? stillHere : and(stillHere, notInArray(invoiceLine.id, keep)));
}

/** Discard a draft. An archive, because there is no delete anywhere in this database. */
export async function archiveDraft(tx: Tx, invoiceId: string): Promise<void> {
	await tx
		.update(invoice)
		.set({ archivedAt: sql`now()` })
		.where(and(eq(invoice.id, invoiceId), eq(invoice.status, 'draft')));
}

/**
 * RECORDING A PAYMENT.
 *
 * Four things, together: the payment row, the ledger entry and its allocation, the settlement
 * status, and the event. The status is RECOMPUTED from every payment on the invoice rather than
 * inferred from this one — a second payment finishing off a part-paid invoice has to settle it,
 * and "did this payment cover the balance" is a different and wronger question.
 */
export async function recordPayment(
	tx: Tx,
	businessId: string,
	userId: string,
	invoiceId: string,
	input: PaymentInput,
	now: Date = new Date()
): Promise<{ readonly settled: boolean; readonly outstanding: Money }> {
	const header = await loadInvoiceRow(tx, invoiceId);
	if (!header) throw new CannotDoThat(notFoundMessage('invoice'));

	if (header.status === 'draft') {
		throw new CannotDoThat('That invoice has not been issued yet, so nothing is owed on it.');
	}
	if (header.status === 'cancelled') {
		throw new CannotDoThat('That invoice was cancelled, so a payment cannot be recorded on it.');
	}
	if (header.snapshotTotalCents === null) {
		// Unreachable: `snapshot_required_once_issued` makes it unstorable. Stated anyway,
		// because the alternative to a loud failure here is settling against a null total.
		throw new CannotDoThat('That invoice has no total, so nothing can be settled against it.');
	}

	const [payment] = await tx
		.insert(invoicePayment)
		.values({
			businessId,
			invoiceId,
			kind: 'payment',
			amountCents: input.amountCents,
			currency: header.currency,
			method: input.method,
			reference: input.reference,
			receivedOn: input.receivedOn,
			recordedAt: now,
			recordedByUserId: userId
		})
		.returning({ id: invoicePayment.id });

	// The SNAPSHOT is what the client owes — the number printed on the document they hold, not a
	// recomputation that could have moved. `snapshot_required_once_issued` guarantees it is there.
	const total = toMoney(header.snapshotTotalCents, header.currency);

	await postPaymentReceived(tx, businessId, {
		invoiceId,
		paymentId: payment.id,
		number: header.numberFormatted ?? invoiceId,
		amount: toMoney(input.amountCents, header.currency),
		receivedOn: input.receivedOn
	});

	const result = await applySettlement(
		tx,
		invoiceId,
		total,
		header.viewCount,
		input.receivedOn,
		now
	);

	await recordEvent(tx, businessId, invoiceId, {
		kind: result.settled ? 'paid' : 'part_paid',
		actor: 'business',
		actorUserId: userId,
		detail: input.reference,
		occurredAt: now
	});

	return result;
}

/**
 * UNDOING ONE.
 *
 * A reversal ROW, never a delete, and only inside the thirty-day window the screen promised. The
 * window is checked here so the person gets a sentence rather than a constraint error, and again
 * by `app.enforce_payment_rules()` because a form is a suggestion.
 */
export async function reversePayment(
	tx: Tx,
	businessId: string,
	userId: string,
	invoiceId: string,
	paymentId: string,
	now: Date = new Date()
): Promise<{ readonly settled: boolean; readonly outstanding: Money }> {
	const header = await loadInvoiceRow(tx, invoiceId);
	if (!header) throw new CannotDoThat(notFoundMessage('invoice'));

	const payments = await loadPayments(tx, invoiceId);
	const original = payments.find((p) => p.id === paymentId);
	if (!original) throw new CannotDoThat(notFoundMessage('payment'));

	const alreadyReversed = payments.some((p) => p.reversesPaymentId === paymentId);
	const verdict = canReverse(original, alreadyReversed, now);
	if (!verdict.can) throw new CannotDoThat(verdict.reason ?? 'That payment cannot be undone.');

	await tx.insert(invoicePayment).values({
		businessId,
		invoiceId,
		kind: 'reversal',
		amountCents: original.amount.cents,
		currency: original.amount.currency,
		method: original.method,
		reference: original.reference,
		// The day the undo happens, not the day the original money moved: the books should show
		// the money going back out when it went back out.
		receivedOn: todayIn(now),
		recordedAt: now,
		recordedByUserId: userId,
		reversesPaymentId: paymentId
	});

	await postPaymentReversed(tx, businessId, {
		invoiceId,
		paymentId,
		number: header.numberFormatted ?? invoiceId,
		amount: original.amount,
		receivedOn: todayIn(now)
	});

	const total = toMoney(header.snapshotTotalCents ?? 0, header.currency);
	const result = await applySettlement(tx, invoiceId, total, header.viewCount, null, now);

	await recordEvent(tx, businessId, invoiceId, {
		kind: 'payment_reversed',
		actor: 'business',
		actorUserId: userId,
		detail: original.reference,
		occurredAt: now
	});

	return result;
}

/**
 * Bring the stored status in line with what has actually been received.
 *
 * Called after every payment and every reversal, and it is the ONLY writer of `status` between
 * `sent`/`viewed` and `paid`. A reversal returns the invoice to `viewed` when the client had
 * opened it and `sent` when they had not — recomputed from `view_count` rather than remembered
 * in a column, because a column would be a second answer to a question already answered.
 */
async function applySettlement(
	tx: Tx,
	invoiceId: string,
	total: Money,
	viewCount: number,
	paidOn: CalendarDate | null,
	now: Date
): Promise<{ readonly settled: boolean; readonly outstanding: Money }> {
	const payments = await loadPayments(tx, invoiceId);
	const result = settle(total, payments);
	const status = statusAfterSettlement(result.settled, viewCount);

	await tx
		.update(invoice)
		.set({
			status,
			paidAt: result.settled ? now : null,
			// The DAY the settling money moved, for "Paid 24 Jul". Null the moment it is un-settled.
			paidOn: result.settled ? (paidOn ?? todayIn(now)) : null
		})
		.where(eq(invoice.id, invoiceId));

	return { settled: result.settled, outstanding: result.outstanding };
}

/**
 * CANCELLING.
 *
 * One-way, and the design says so on the screen before the action rather than in a dialog after
 * it: "Cancelling an invoice can't [be undone] — we'll ask you to confirm."
 *
 * Refused once money has been received, because a cancelled invoice with a payment allocated to
 * it is a contradiction — the client paid for a document that no longer claims anything. A
 * credit note is the instrument for that. The database refuses it too.
 */
export async function cancelInvoice(
	tx: Tx,
	businessId: string,
	userId: string,
	invoiceId: string,
	reason: string | null,
	now: Date = new Date()
): Promise<void> {
	const header = await loadInvoiceRow(tx, invoiceId);
	if (!header) throw new CannotDoThat(notFoundMessage('invoice'));

	if (header.status === 'draft') {
		throw new CannotDoThat(
			'That invoice is still a draft. Discard it instead — nothing has gone to the client.'
		);
	}
	if (header.status === 'cancelled') {
		throw new CannotDoThat('That invoice has already been cancelled.');
	}

	const payments = await loadPayments(tx, invoiceId);
	const reversed = new Set(
		payments.flatMap((p) => (p.reversesPaymentId ? [p.reversesPaymentId] : []))
	);
	if (payments.some((p) => p.kind === 'payment' && !reversed.has(p.id))) {
		throw new CannotDoThat(
			'There is money recorded against this invoice, so it cannot be cancelled. ' +
				'Undo the payment first, or issue a credit note.'
		);
	}

	await tx
		.update(invoice)
		.set({ status: 'cancelled', cancelledAt: now, cancelledReason: reason })
		.where(eq(invoice.id, invoiceId));

	// The claim on the client is withdrawn, so the receivable comes back off the books. The cost
	// entries stay: the materials were still consumed and the work was still done.
	if (
		header.snapshotSubtotalCents !== null &&
		header.snapshotTaxCents !== null &&
		header.snapshotTotalCents !== null
	) {
		await postInvoiceCancelled(tx, businessId, {
			invoiceId,
			number: header.numberFormatted ?? invoiceId,
			on: todayIn(now),
			subtotal: toMoney(header.snapshotSubtotalCents, header.currency),
			tax: toMoney(header.snapshotTaxCents, header.currency),
			total: toMoney(header.snapshotTotalCents, header.currency)
		});
	}

	await recordEvent(tx, businessId, invoiceId, {
		kind: 'cancelled',
		actor: 'business',
		actorUserId: userId,
		detail: reason,
		occurredAt: now
	});
}
