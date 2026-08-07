/**
 * INVOICING — the module the platform's hardest decisions were made for.
 *
 * `.env.example` says why the database must be physically in South Africa: SARS GN 787 rule 4.1
 * requires electronic tax records to be kept in the Republic. `0003_platform.sql` revokes DELETE
 * from the application role so that "business records are never destroyed" is structural rather
 * than a policy somebody can forget. Both of those exist because of the rows in this file. An
 * invoice is not a document the business owns — it is a tax record, and the client, the client's
 * accountant and SARS all have a legitimate claim on it being what it was the day it was issued.
 *
 * WHAT THAT MEANS, CONCRETELY
 * ---------------------------
 *  1. ISSUED IS FROZEN. Once an invoice leaves draft, its lines, its totals, its number, its
 *     dates and its client cannot change. Not through the editor, not through a stray UPDATE,
 *     not through a migration script somebody runs at 2am. `app.freeze_issued_invoice()` in
 *     `0007_invoicing.sql` refuses the write at the database — T19 makes that an acceptance
 *     criterion in exactly those words: "the attempt fails at the database, not just the UI."
 *     Corrections are credit notes, which is what the `credit_note` document number in
 *     `core.ts` has been reserved for since M2.
 *
 *  2. A PAYMENT IS REVERSED BY A ROW. "Recording a payment can be undone for 30 days" is a
 *     promise about an ACT, and undoing it by deleting the row would erase the fact that it
 *     happened. `invoicing_payment` therefore holds both payments and reversals, and the
 *     window is enforced by a trigger as well as by the service.
 *
 *  3. CANCELLATION IS ONE-WAY. "Cancelling an invoice can't [be undone] — we'll ask you to
 *     confirm." A cancelled invoice stays cancelled; `app.refuse_uncancel()` makes that true of
 *     the database and not only of the dialog.
 *
 *  4. `overdue` IS NOT IN HERE. It is derived from `due_date` on read — see
 *     `$lib/core/invoicing/status.ts`. Storing it would guarantee a stale row somewhere, and
 *     the list screen shows "Overdue" as a real count that an owner would act on.
 *
 * THE SNAPSHOTS ARE THE SAME THREE AS QUOTING'S, for the same reasons — the customer as this
 * document states them, the line as it was priced, and the totals as they were at issue. See
 * the header of `quoting.ts`; nothing about that reasoning changes, except that here the
 * consequence of getting it wrong is a tax record that disagrees with the return filed from it.
 */
import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	date,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid
} from 'drizzle-orm/pg-core';
import { PRICING_MODES, TAX_ENGINES, TAX_TREATMENTS } from '$lib/core/quoting';
import {
	COST_SOURCES,
	INVOICE_EVENT_ACTORS,
	INVOICE_EVENT_KINDS,
	PAYMENT_KINDS,
	PAYMENT_METHODS,
	STORED_INVOICE_STATUSES
} from '$lib/core/invoicing';
import {
	businessId,
	cents,
	exactRange,
	id,
	micros,
	notBlank,
	oneOf,
	ppm,
	qtyE6,
	timestamps
} from '../base';
import { business, customer } from './core';

/**
 * Per-business invoicing defaults.
 *
 * The same shape as `quoting_setting` and for the same reason: the payment terms and the banking
 * details are the BUSINESS's, set once, not a decision retaken on every invoice. `business_id` is
 * the primary key, so there is exactly one row per tenant and no way to end up with two
 * disagreeing sets of banking details — which on an invoice would mean a client paying money
 * into an account the business is not watching.
 */
export const invoicingSetting = pgTable(
	'invoicing_setting',
	{
		businessId: businessId()
			.primaryKey()
			.references(() => business.businessId, { onDelete: 'restrict' }),

		/** Days from issue to due. "Sent 18 July. Due Monday, 1 August" is fourteen of them. */
		paymentTermsDays: integer().notNull().default(14),

		/**
		 * How to pay, in the business's own words, one printed line per row of the footer.
		 *
		 * Text rather than structured fields: a South African invoice usually carries bank, account
		 * number and branch code, but a business banking somewhere unusual, or wanting a payment
		 * reference convention on the same line, should not be blocked by a form that knows better.
		 */
		bankingDetails: text(),

		/** The closing line. Defaults live in `$lib/core/invoicing` so the renderer agrees. */
		footerTerms: text(),

		/** The words a reminder goes out with, when a business would rather write its own. */
		reminderTemplate: text(),

		...timestamps()
	},
	(t) => [check('invoicing_setting_terms_sane', sql`${t.paymentTermsDays} between 0 and 365`)]
);

/**
 * The invoice header — `INV-1042`.
 *
 * WHY THE NUMBER IS NULLABLE, and why that matters more here than on a quote: an invoice number
 * is the identifier a client phones about, an accountant reconciles against and SARS expects to
 * be sequential. `numbering.ts` allocates one inside the transaction that issues the invoice, so
 * a draft that is never issued burns nothing and an issued invoice always has one — which is
 * what `number_required_once_issued` says.
 *
 * `(id, currency)` is unique so lines and payments can carry a COMPOSITE foreign key to it.
 * `money/types.ts` names this as the thing that makes a mixed-currency document a database error
 * rather than a silently wrong total.
 */
export const invoice = pgTable(
	'invoicing_invoice',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		/**
		 * The address book entry this document was drawn from. Nullable, because a fresh draft has
		 * no client yet; required the moment it is issued.
		 */
		customerId: uuid().references(() => customer.id, { onDelete: 'restrict' }),

		/** WHAT THIS DOCUMENT SAYS ABOUT THE CLIENT — snapshot 1. See `quoting.ts`. */
		customerName: text(),
		customerContactPerson: text(),
		customerEmail: text(),
		customerPhone: text(),
		customerVatNumber: text(),
		customerAddressLine1: text(),
		customerAddressLine2: text(),
		customerCity: text(),
		customerPostalCode: text(),
		customerCountry: text().notNull().default('ZA'),

		/** WHO IT IS SENT TO, which is not the same as who it is for. */
		sendToName: text(),
		sendToEmail: text(),

		/** `INV`, 1042, `INV-1042`. All three null until the invoice is issued. */
		numberPrefix: text(),
		numberValue: integer(),
		numberFormatted: text(),

		/** One of five. `overdue` is NOT among them — see the file header. */
		status: text().notNull().default('draft'),

		/**
		 * The two dates a client reads. DATEs, not timestamps: "due Monday, 1 August" is a promise
		 * about a day in the client's life, and storing an instant would make it fall due at a
		 * different moment for a client in another timezone than the one printed on their copy.
		 */
		issueDate: date(),
		dueDate: date(),

		/**
		 * "Created from quote QT-1036" — the design's own line on the invoice detail timeline.
		 *
		 * Deliberately NOT a foreign key to `quoting_quote`. An invoice must survive its business
		 * removing Quoting entirely, and a reference constraint across a module boundary is exactly
		 * the coupling that would make removing a module a data-integrity problem. The NUMBER is
		 * stored alongside so the timeline can say `QT-1036` without reaching into Quoting at all.
		 */
		sourceQuoteId: uuid(),
		sourceQuoteNumber: text(),

		/** THE PRICING CONTRACT, SNAPSHOTTED. See `quoting.ts` — the same discipline, higher stakes. */
		pricingMode: text().notNull().default('exclusive'),
		taxEngine: text().notNull().default('za_vat'),
		vatRatePpm: ppm().notNull().default(150_000),
		vatPolicy: text().notNull(),

		currency: text().notNull().default('ZAR'),

		/**
		 * WHAT `priceDocument` PRODUCED AT ISSUE — snapshot 3, and the number the client owes.
		 *
		 * Everything live recomputes from the lines; this is the RECORD of what the document said.
		 * `snapshot_reconciles` refuses a subtotal and a VAT figure that do not sum to the total —
		 * the one arithmetic claim a client can check with a calculator, and the one an auditor
		 * will.
		 */
		snapshotSubtotalCents: cents(),
		snapshotTaxCents: cents(),
		snapshotTotalCents: cents(),
		snapshotAt: timestamp({ withTimezone: true }),

		/** THE SHARE TOKEN — how a client with no account reads their own invoice. See `quoting.ts`. */
		shareTokenHash: text(),
		shareTokenIssuedAt: timestamp({ withTimezone: true }),

		/**
		 * The tracking the design's copy depends on: "They opened it twice."
		 *
		 * Denormalised alongside `invoicing_invoice_event` rather than derived from it, because the
		 * list screen asks for these on every row and a correlated count per invoice is the N+1 the
		 * review checklist names.
		 */
		issuedAt: timestamp({ withTimezone: true }),
		firstViewedAt: timestamp({ withTimezone: true }),
		lastViewedAt: timestamp({ withTimezone: true }),
		viewCount: integer().notNull().default(0),
		lastRemindedAt: timestamp({ withTimezone: true }),
		reminderCount: integer().notNull().default(0),

		/**
		 * When it was settled in full, and the DAY the settling payment was received.
		 *
		 * The day, separately, because the list says "Paid 24 Jul" and that is the day the money
		 * moved rather than the day somebody typed it in.
		 */
		paidAt: timestamp({ withTimezone: true }),
		paidOn: date(),

		/** One-way. See `app.refuse_uncancel()` in the migration. */
		cancelledAt: timestamp({ withTimezone: true }),
		cancelledReason: text(),

		/**
		 * A discarded DRAFT. There is no archive path for an issued invoice — a tax record does not
		 * get to be tidied away, and `freeze_issued_invoice` refuses to set this after issue.
		 * Cancellation is the only exit an issued invoice has.
		 */
		archivedAt: timestamp({ withTimezone: true }),

		...timestamps()
	},
	(t) => [
		unique('invoicing_invoice_id_currency').on(t.id, t.currency),

		oneOf('invoicing_invoice_status_known', t.status, STORED_INVOICE_STATUSES),
		oneOf('invoicing_invoice_pricing_mode_known', t.pricingMode, PRICING_MODES),
		oneOf('invoicing_invoice_tax_engine_known', t.taxEngine, TAX_ENGINES),
		oneOf('invoicing_invoice_currency_supported', t.currency, ['ZAR']),

		// Everything an issued invoice must have. Each of these is a column the client's copy
		// shows, so a row missing one is a document that cannot be reprinted as it was sent.
		check(
			'invoicing_invoice_customer_required_once_issued',
			sql`${t.status} = 'draft' or ${t.customerId} is not null`
		),
		check(
			'invoicing_invoice_dates_required_once_issued',
			sql`${t.status} = 'draft' or (${t.issueDate} is not null and ${t.dueDate} is not null)`
		),
		// A due date before the issue date is not a term of business, it is a typo — and one that
		// would make an invoice overdue the moment it was sent.
		check(
			'invoicing_invoice_due_after_issue',
			sql`${t.issueDate} is null or ${t.dueDate} is null or ${t.dueDate} >= ${t.issueDate}`
		),

		// A number is allocated as a unit or not at all.
		check(
			'invoicing_invoice_number_complete',
			sql`(${t.numberPrefix} is null and ${t.numberValue} is null and ${t.numberFormatted} is null)
			 or (${t.numberPrefix} is not null and ${t.numberValue} is not null and ${t.numberFormatted} is not null)`
		),
		check(
			'invoicing_invoice_number_required_once_issued',
			sql`${t.status} = 'draft' or ${t.numberFormatted} is not null`
		),
		// `INV-1042` means exactly one document, forever.
		unique('invoicing_invoice_number_unique').on(t.businessId, t.numberFormatted),

		unique('invoicing_invoice_share_token_unique').on(t.shareTokenHash),
		check(
			'invoicing_invoice_share_token_complete',
			sql`(${t.shareTokenHash} is null and ${t.shareTokenIssuedAt} is null)
			 or (${t.shareTokenHash} is not null and ${t.shareTokenIssuedAt} is not null)`
		),

		check('invoicing_invoice_view_count_not_negative', sql`${t.viewCount} >= 0`),
		check('invoicing_invoice_reminder_count_not_negative', sql`${t.reminderCount} >= 0`),

		// The status and its evidence move together. A row that says `paid` with no settlement
		// date, or carries a cancellation date without being cancelled, is a state no screen can
		// render honestly.
		check(
			'invoicing_invoice_paid_has_date',
			sql`(${t.status} = 'paid') = (${t.paidAt} is not null)`
		),
		check(
			'invoicing_invoice_cancelled_has_date',
			sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null)`
		),
		check(
			'invoicing_invoice_issued_has_date',
			sql`${t.status} = 'draft' or ${t.issuedAt} is not null`
		),

		exactRange('invoicing_invoice_vat_rate_exact', t.vatRatePpm),
		exactRange('invoicing_invoice_snapshot_subtotal_exact', t.snapshotSubtotalCents),
		exactRange('invoicing_invoice_snapshot_tax_exact', t.snapshotTaxCents),
		exactRange('invoicing_invoice_snapshot_total_exact', t.snapshotTotalCents),

		check(
			'invoicing_invoice_snapshot_complete',
			sql`(${t.snapshotSubtotalCents} is null and ${t.snapshotTaxCents} is null
			     and ${t.snapshotTotalCents} is null and ${t.snapshotAt} is null)
			 or (${t.snapshotSubtotalCents} is not null and ${t.snapshotTaxCents} is not null
			     and ${t.snapshotTotalCents} is not null and ${t.snapshotAt} is not null)`
		),
		check(
			'invoicing_invoice_snapshot_reconciles',
			sql`${t.snapshotTotalCents} is null
			 or ${t.snapshotSubtotalCents} + ${t.snapshotTaxCents} = ${t.snapshotTotalCents}`
		),
		// An issued invoice without frozen totals could be re-priced by an edit to a stock item.
		check(
			'invoicing_invoice_snapshot_required_once_issued',
			sql`${t.status} = 'draft' or ${t.snapshotTotalCents} is not null`
		),

		notBlank('invoicing_invoice_vat_policy_present', t.vatPolicy),

		// The list, its filter tabs and Home's "owed to you": all three ask for one business's
		// invoices in a status, ordered by when they fall due.
		index('invoicing_invoice_business_status_idx').on(t.businessId, t.status, t.dueDate),
		index('invoicing_invoice_business_updated_idx').on(t.businessId, t.updatedAt),
		index('invoicing_invoice_customer_idx').on(t.businessId, t.customerId),
		// "Created from quote QT-1036", asked the other way round: T18's accepted quote needs to
		// know whether it has already been invoiced.
		index('invoicing_invoice_source_quote_idx').on(t.businessId, t.sourceQuoteId)
	]
);

/**
 * One line of what is being billed.
 *
 * `invoice_id` has no `references()` here on purpose: the real constraint is composite,
 * `(invoice_id, currency) -> invoicing_invoice (id, currency)`, and drizzle-kit cannot express
 * one. It is written by hand in `0007_invoicing.sql`.
 *
 * THE AMOUNT COLUMN IS THE LINE TOTAL — README open question 1, settled. What is stored is a
 * quantity and a UNIT price; the line total is derived by `priceDocument` and never stored, so
 * there is no second copy of it to disagree. The design's `Shelving unit` is qty 2 at R2 300
 * each, printing R4 600; the mobile screen's R9 200 is the error.
 */
export const invoiceLine = pgTable(
	'invoicing_invoice_line',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		invoiceId: uuid().notNull(),

		/** Display order. Sparse on purpose, so a reorder is an UPDATE and never a shuffle. */
		position: integer().notNull().default(0),

		description: text().notNull(),
		/** The 12px second line: "From Inventory · European oak, 40mm". */
		provenance: text(),
		/** What the document shows, when it says more than the editor does. */
		documentDescription: text(),

		qtyE6: qtyE6('qty_e6').notNull(),
		unitPriceMicros: micros().notNull(),
		currency: text().notNull().default('ZAR'),

		taxTreatment: text().notNull().default('standard'),
		vatRatePpm: ppm().notNull().default(150_000),

		/**
		 * INCLUDED, NO CHARGE — the design's `±0.00` against "Fitting and finishing".
		 *
		 * README open question 2. A line at zero because the business is throwing it in is not the
		 * same fact as a line nobody has priced yet, and a document that renders both as `0,00` has
		 * lost the difference. The flag is what lets the editor block one and allow the other, and
		 * what lets the sheet say "included" where the design shows a bare zero.
		 *
		 * `no_charge_is_zero` keeps the flag and the number from ever disagreeing.
		 */
		noCharge: boolean().notNull().default(false),

		/** WHERE THIS LINE CAME FROM — snapshot 2. Not a foreign key; see `quoting.ts`. */
		sourceItemId: uuid(),
		sourceCapturedAt: timestamp({ withTimezone: true }),

		/**
		 * WHAT ONE OF THIS COST — the margin panel's only honest input.
		 *
		 * Snapshotted when the line is added, from the stock item's cost at that moment: "Materials
		 * came from Inventory at the price you paid" is only true if the price paid was recorded
		 * then rather than looked up later, when it will have moved.
		 *
		 * NULL means nobody knows, and that is a first-class answer — `margin.ts` says so on the
		 * screen rather than treating an unknown cost as zero, which would report a margin the
		 * business did not make.
		 */
		costMicros: micros(),
		costSource: text(),
		costCapturedAt: timestamp({ withTimezone: true }),

		/** A removed line. Nothing is deleted; and after issue, nothing is removed at all. */
		archivedAt: timestamp({ withTimezone: true }),

		...timestamps()
	},
	(t) => [
		notBlank('invoicing_invoice_line_description_present', t.description),
		oneOf('invoicing_invoice_line_tax_treatment_known', t.taxTreatment, TAX_TREATMENTS),
		oneOf('invoicing_invoice_line_currency_supported', t.currency, ['ZAR']),
		oneOf('invoicing_invoice_line_cost_source_known', t.costSource, COST_SOURCES),

		exactRange('invoicing_invoice_line_qty_exact', t.qtyE6),
		exactRange('invoicing_invoice_line_unit_price_exact', t.unitPriceMicros),
		exactRange('invoicing_invoice_line_vat_rate_exact', t.vatRatePpm),
		exactRange('invoicing_invoice_line_cost_exact', t.costMicros),
		check('invoicing_invoice_line_qty_not_negative', sql`${t.qtyE6} >= 0`),
		check(
			'invoicing_invoice_line_cost_not_negative',
			sql`${t.costMicros} is null or ${t.costMicros} >= 0`
		),

		// A no-charge line that carries a price is a contradiction, and it would print one number
		// while meaning another.
		check(
			'invoicing_invoice_line_no_charge_is_zero',
			sql`${t.noCharge} = false or ${t.unitPriceMicros} = 0`
		),
		// A cost with no provenance cannot be explained in the workings, and provenance with no
		// cost explains nothing.
		check(
			'invoicing_invoice_line_cost_complete',
			sql`(${t.costMicros} is null and ${t.costSource} is null and ${t.costCapturedAt} is null)
			 or (${t.costMicros} is not null and ${t.costSource} is not null and ${t.costCapturedAt} is not null)`
		),

		index('invoicing_invoice_line_invoice_idx').on(t.invoiceId, t.position)
	]
);

/**
 * MONEY RECEIVED, AND MONEY GIVEN BACK.
 *
 * One table for both, because a reversal is a fact about the same event and splitting them would
 * make "what happened to this payment" a join. `kind` carries the direction and `amount_cents` is
 * always positive, so a stray minus sign cannot turn one into the other.
 *
 * THE THIRTY-DAY WINDOW is a property of `recorded_at`, not of `received_on`: the design's
 * promise is about the ACT of recording — "Recording a payment can be undone for 30 days" — and
 * a payment entered late for an old bank date would otherwise arrive already un-undoable.
 * `app.enforce_reversal_window()` refuses a late reversal at the database.
 */
export const invoicePayment = pgTable(
	'invoicing_payment',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		/** Composite FK to `(id, currency)`, written by hand in the migration. */
		invoiceId: uuid().notNull(),

		kind: text().notNull().default('payment'),

		/** Always positive. Direction lives in `kind`. */
		amountCents: cents().notNull(),
		currency: text().notNull().default('ZAR'),

		method: text().notNull().default('eft'),
		/** The client's payment reference, as it appears on the statement. */
		reference: text(),

		/** The DAY the money moved. Not the day somebody typed it in — see `recorded_at`. */
		receivedOn: date().notNull(),

		/** The moment it was recorded. What the thirty days are counted from. */
		recordedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		/** Who recorded it. `text`, because better-auth mints string ids. */
		recordedByUserId: text(),

		/** The payment this row takes back. Null on a payment, required on a reversal. */
		reversesPaymentId: uuid(),

		...timestamps()
	},
	(t) => [
		oneOf('invoicing_payment_kind_known', t.kind, PAYMENT_KINDS),
		oneOf('invoicing_payment_method_known', t.method, PAYMENT_METHODS),
		oneOf('invoicing_payment_currency_supported', t.currency, ['ZAR']),

		exactRange('invoicing_payment_amount_exact', t.amountCents),
		// A zero payment records nothing and a negative one is a reversal wearing a disguise.
		check('invoicing_payment_amount_positive', sql`${t.amountCents} > 0`),

		// A reversal points at what it reverses; a payment points at nothing. Both halves stated,
		// so neither shape can be stored the wrong way round.
		check(
			'invoicing_payment_reversal_shape',
			sql`(${t.kind} = 'reversal' and ${t.reversesPaymentId} is not null)
			 or (${t.kind} = 'payment' and ${t.reversesPaymentId} is null)`
		),
		// One reversal per payment. Two people clicking Undo at the same moment is a real thing,
		// and a service-level check has a race in it that this does not.
		unique('invoicing_payment_one_reversal_per_payment').on(t.reversesPaymentId),

		index('invoicing_payment_invoice_idx').on(t.invoiceId, t.receivedOn)
	]
);

/**
 * WHAT HAPPENED TO AN INVOICE, AND WHEN.
 *
 * The activity timeline in T21, and the design's "Opened by Baraka Café · Twice · last 26 Jul,
 * 08:41". Append-only in practice and in intent — there is no update path in
 * `modules/invoicing` and no delete anywhere in this database.
 *
 * `actor` is deliberately loose, as it is on a quote: half of these events are caused by a
 * person with no account. A client opening an emailed invoice is not a user, has no `user_id`,
 * and never will — so the column says WHAT KIND of actor it was and the detail carries the rest.
 * The design's "by you" comes from `actor_user_id` matching the person reading the screen.
 */
export const invoiceEvent = pgTable(
	'invoicing_invoice_event',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),
		invoiceId: uuid()
			.notNull()
			.references(() => invoice.id, { onDelete: 'restrict' }),

		kind: text().notNull(),
		actor: text().notNull(),
		actorUserId: text(),
		/** Free text: the address it went to, the reference on a payment, a cancellation reason. */
		detail: text(),

		/** When it happened, as its own column rather than relying on `created_at`. */
		occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),

		...timestamps()
	},
	(t) => [
		oneOf('invoicing_invoice_event_kind_known', t.kind, INVOICE_EVENT_KINDS),
		oneOf('invoicing_invoice_event_actor_known', t.actor, INVOICE_EVENT_ACTORS),
		index('invoicing_invoice_event_invoice_idx').on(t.invoiceId, t.occurredAt)
	]
);
