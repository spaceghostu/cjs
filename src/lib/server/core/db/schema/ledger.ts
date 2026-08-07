/**
 * THE LEDGER — `core_posting` / `core_allocation`.
 *
 * The schema barrel has reserved these two since M2, described as "unused until Invoicing".
 * This is where they get used, and T21 is the reason:
 *
 *   > **The numbers behind it.** Materials R14 280, Labour R6 720, then above a rule, **"What
 *   > you keep" R6 150**. … The figures reconcile to ledger postings, and "See the workings"
 *   > opens them.
 *
 * A display calculation could produce those numbers. It could not produce WORKINGS — a list of
 * entries somebody can read and check — and it could not survive the question "why does this
 * month's total not match the sum of the invoices?", which is the question every small business
 * eventually asks its software and rarely gets a straight answer to.
 *
 * WHY DOUBLE ENTRY, IN A PRODUCT THAT NEVER SAYS "DEBIT" TO ANYONE
 * ---------------------------------------------------------------
 * Because it is the only arrangement in which the books cannot quietly stop adding up. Every
 * entry balances to zero, which is asserted by a deferred constraint trigger rather than by the
 * code that writes it, so a half-written entry cannot commit — not from a bug, not from a crash
 * between two inserts, not from a future module that posts carelessly.
 *
 * The vocabulary stays in here. The screens say "Materials", "Labour" and "What you keep";
 * `$lib/core/invoicing/margin.ts` is where those words are decided, and nothing user-facing ever
 * sees the word `vat_output`.
 *
 * PLATFORM, NOT MODULE. `core_` because the ledger belongs to the floor: Invoicing writes to it
 * first, but Expenses, Payroll and Inventory all post to the same books, and a per-module ledger
 * is how a business ends up with three totals and no answer.
 */
import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { businessId, cents, exactRange, id, notBlank, oneOf, timestamps } from '../base';
import { business } from './core';

/**
 * THE CHART OF ACCOUNTS, closed.
 *
 * Small on purpose. Every account here exists because something in the product posts to it, and
 * the day a module needs a new one it is added here with the migration that needs it — rather
 * than accounts being free text, which is how a ledger becomes forty spellings of "Sales".
 *
 *   receivable      what clients owe. An issued invoice debits it; a receipt credits it.
 *   revenue         what was sold, before VAT. Never the business's VAT.
 *   vat_output      VAT charged to clients, owed to SARS. Held apart from revenue because it
 *                   was never the business's money — the whole reason the margin panel works
 *                   off the subtotal and not the total.
 *   bank            money actually received.
 *   cost_materials  what the materials on a job cost, from the Inventory snapshot.
 *   cost_labour     what the labour on a job cost, when somebody recorded it.
 *   inventory       stock on hand. Credited as materials are consumed by a job.
 *   cost_payable    what is owed for labour or subcontract that has been costed but not paid.
 */
export const LEDGER_ACCOUNTS = [
	'receivable',
	'revenue',
	'vat_output',
	'bank',
	'cost_materials',
	'cost_labour',
	'inventory',
	'cost_payable'
] as const;

export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];

/** What caused an entry. Kept as a pair rather than eight nullable foreign keys. */
export const POSTING_SOURCES = ['invoice', 'invoice_payment', 'stock_count'] as const;

export type PostingSource = (typeof POSTING_SOURCES)[number];

/**
 * One leg of one entry.
 *
 * `entry_id` groups the legs that belong together — it is not a foreign key to anything,
 * because the entry has no existence apart from its legs. `entry_kind` says what the whole
 * entry was FOR, so the workings can be listed as "Invoice issued", "Payment received" without
 * inferring it from the accounts.
 *
 * SIGNED CENTS: a debit is positive and a credit is negative, and the legs of one entry sum to
 * zero. Storing a `direction` column plus a magnitude would let a bug produce two debits that
 * balance on paper and not in the totals; a signed integer makes "balanced" a single SUM.
 */
export const posting = pgTable(
	'core_posting',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		/** The legs of one entry share this. Not a foreign key — see the note above. */
		entryId: uuid().notNull(),
		/** `invoice_issued`, `payment_received`, `payment_reversed`, `invoice_cancelled`, … */
		entryKind: text().notNull(),

		account: text().notNull(),
		/** Debit positive, credit negative. The legs of one entry sum to zero. */
		amountCents: cents().notNull(),
		currency: text().notNull().default('ZAR'),

		/** What caused it, so a posting can always be traced back to a document. */
		sourceKind: text().notNull(),
		sourceId: uuid().notNull(),

		/**
		 * The day the entry belongs to, in the books.
		 *
		 * A DATE, and separately from `created_at`: a payment received on the 24th and entered on
		 * the 28th belongs to the 24th, because that is the day the bank statement will show it
		 * and the day the VAT period will count it. The difference between when something
		 * happened and when it was recorded is exactly what an audit trail exists to keep.
		 */
		occurredOn: date().notNull(),

		/** Human-readable, for the workings. "Invoice INV-1042 to Meridian Developments". */
		memo: text(),

		...timestamps()
	},
	(t) => [
		oneOf('core_posting_account_known', t.account, LEDGER_ACCOUNTS),
		oneOf('core_posting_source_known', t.sourceKind, POSTING_SOURCES),
		oneOf('core_posting_currency_supported', t.currency, ['ZAR']),
		notBlank('core_posting_entry_kind_present', t.entryKind),
		exactRange('core_posting_amount_exact', t.amountCents),
		// A zero-value leg carries no information and would make an entry that balances trivially
		// look like a real one.
		check('core_posting_amount_not_zero', sql`${t.amountCents} <> 0`),

		// The workings for one document, and the account totals for a period. Both are the
		// queries this table exists to answer.
		index('core_posting_entry_idx').on(t.entryId),
		index('core_posting_source_idx').on(t.businessId, t.sourceKind, t.sourceId),
		index('core_posting_account_idx').on(t.businessId, t.account, t.occurredOn)
	]
);

/**
 * WHICH RECEIPT SETTLED WHICH INVOICE.
 *
 * Cash application. `invoicing_payment` already names the invoice it was recorded against, so
 * today this holds one row per payment and looks redundant — and it is not, for two reasons.
 *
 * The first is that the module's answer and the ledger's answer to "what is outstanding on
 * INV-1042?" must be derivable independently, or "the figures reconcile to postings" is a claim
 * with nothing behind it. `invoicing.test.ts` computes both and asserts they agree.
 *
 * The second is that one payment settling several invoices is the ordinary case the moment a
 * client pays a statement rather than an invoice, and `allocate()` in the money core already
 * exists to split it. The shape that supports that costs one table now and a migration over live
 * financial records later.
 */
export const allocation = pgTable(
	'core_allocation',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		/** The receipt leg this allocation spends. */
		postingId: uuid()
			.notNull()
			.references(() => posting.id, { onDelete: 'restrict' }),

		/** What it was applied to. `invoice` today; credit notes join later. */
		documentKind: text().notNull(),
		documentId: uuid().notNull(),

		/**
		 * How much of the receipt this document took. Positive on a payment, negative when a
		 * reversal gives it back — so the sum over a document is what has been applied to it,
		 * and nothing is ever deleted to correct one.
		 */
		amountCents: cents().notNull(),
		currency: text().notNull().default('ZAR'),

		occurredOn: date().notNull(),

		...timestamps()
	},
	(t) => [
		oneOf('core_allocation_document_known', t.documentKind, ['invoice']),
		oneOf('core_allocation_currency_supported', t.currency, ['ZAR']),
		exactRange('core_allocation_amount_exact', t.amountCents),
		check('core_allocation_amount_not_zero', sql`${t.amountCents} <> 0`),
		index('core_allocation_document_idx').on(t.businessId, t.documentKind, t.documentId),
		index('core_allocation_posting_idx').on(t.postingId)
	]
);
