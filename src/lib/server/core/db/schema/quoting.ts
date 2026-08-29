/**
 * QUOTING — the first module with real documents.
 *
 * A quote is the first thing in this database that a person outside the business ever reads.
 * That single fact decides most of what follows: what prints has to be stable, what was sent
 * has to stay sent, and nothing a colleague edits next month may change what a client already
 * has in their inbox.
 *
 * THREE SNAPSHOTS, AND WHY EACH ONE EXISTS
 * ----------------------------------------
 *  1. THE CUSTOMER. `core_customer` is the address book; the columns below are what this
 *     document says. The editor's own copy is explicit about it — "Filled in from your
 *     customer list. Change it here and we'll ask if you want it saved." An edit here is
 *     local until somebody promotes it, so correcting a typo on one quote cannot silently
 *     rewrite the customer record every other document reads from.
 *
 *  2. THE LINE. A line sourced from Inventory keeps `description` and `unit_price_micros` as
 *     its own columns and remembers where they came from in `source_item_id`. Re-pricing a
 *     stock item must not re-price a quote that was sent last month — the same principle the
 *     money core applies to `VAT_POLICY`, applied to the thing being sold.
 *
 *  3. THE TOTALS. `priceDocument` is the only thing that computes a total, and the columns
 *     here are a RECORD of what it produced at the moment of sending, never the source of
 *     truth. Everything live recomputes. The snapshot is what makes "this is the document
 *     they accepted" a claim with evidence behind it, and `snapshot_reconciles` is the
 *     database refusing to hold a pair of numbers that do not add up.
 *
 * NOTHING IS EVER DELETED
 * -----------------------
 * The application role holds no DELETE (see `drizzle/0003_platform.sql`), so removing a line
 * from a quote is an UPDATE that sets `archived_at`, and discarding a draft is the same move
 * on the header. Every query in `modules/quoting` filters on it. The alternative — a line
 * that vanishes — would also vanish from the audit trail of a document somebody may have to
 * defend years later.
 */
import { sql } from 'drizzle-orm';
import {
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
import { PRICING_MODES, QUOTE_STATUSES, TAX_ENGINES, TAX_TREATMENTS } from '$lib/core/quoting';
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
 * Per-business quoting defaults.
 *
 * The editor's helper text is "Your usual 14 days", which is a promise that the number is the
 * business's and not the product's. Deposit terms are the same shape — the design shows "50%
 * to start" as a default somebody set once, not as a decision retaken on every quote.
 *
 * A separate table rather than four more columns on `core_business`: the floor belongs to
 * every module, and a business that has never owned Quoting should not carry Quoting's
 * settings. `business_id` is the primary key, so there is exactly one row per tenant and no
 * way to end up with two disagreeing defaults.
 */
export const quotingSetting = pgTable(
	'quoting_setting',
	{
		businessId: businessId()
			.primaryKey()
			.references(() => business.businessId, { onDelete: 'restrict' }),

		/** "Your usual 14 days". Days added to today when a quote is created. */
		validityDays: integer().notNull().default(14),

		/** "50% to start", as parts per million. Null means this business asks for none. */
		depositRatePpm: ppm(),

		/**
		 * The document footer, in the business's own words. The design's quote carries
		 * "50% deposit to begin · balance on completion / Banking details on acceptance";
		 * the default lives in `$lib/core/quoting` so the renderer and this column agree.
		 */
		footerTerms: text(),

		...timestamps()
	},
	(t) => [
		check('quoting_setting_validity_sane', sql`${t.validityDays} between 1 and 365`),
		exactRange('quoting_setting_deposit_rate_exact', t.depositRatePpm),
		check(
			'quoting_setting_deposit_rate_fraction',
			sql`${t.depositRatePpm} is null or (${t.depositRatePpm} >= 0 and ${t.depositRatePpm} <= 1000000)`
		)
	]
);

/**
 * The quote header — `QT-1043`.
 *
 * WHY THE NUMBER IS NULLABLE
 * --------------------------
 * A draft has no number. `numbering.ts` is explicit that a number is spent the moment it is
 * allocated and is never handed out twice, so reserving one when somebody clicks New would
 * burn `QT-1043` every time they changed their mind. The editor shows the PROVISIONAL number
 * from `peekDocumentNumber`, and the real one is allocated in the same transaction that marks
 * the quote sent.
 *
 * WHY `(id, currency)` IS UNIQUE
 * ------------------------------
 * So lines can carry a composite foreign key to it. `core/money/types.ts` names this as the
 * thing that makes a mixed-currency document a database error rather than a silently wrong
 * total, and it costs one redundant-looking unique index to have. The constraint itself is
 * hand-written in `drizzle/0005_quoting.sql` — drizzle-kit has no builder for a composite
 * foreign key.
 */
export const quote = pgTable(
	'quoting_quote',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		/**
		 * The address book entry this document was drawn from.
		 *
		 * Nullable, because a fresh draft has no client yet — the design's editor opens with an
		 * empty Client select. A quote that has left draft must have one, which is what
		 * `customer_required_once_sent` says.
		 */
		customerId: uuid().references(() => customer.id, { onDelete: 'restrict' }),

		/**
		 * THE WORK THIS QUOTE IS ABOUT — `core_job`.
		 *
		 * Deliberately no `.references()`. The foreign key is COMPOSITE —
		 * `(business_id, job_id) -> core_job (business_id, id)` — and drizzle-kit has no builder
		 * for one, so it is hand-written in `drizzle/0010_jobs_platform.sql`, exactly as
		 * `inventory_movement.itemId` and this table's own `(id, currency)` are.
		 *
		 * WHY COMPOSITE. Postgres performs referential integrity with row security BYPASSED, so a
		 * single-column key would happily accept business A's quote pointing at business B's job.
		 * The composite form makes a cross-tenant link a database error rather than a policy
		 * nobody enforces. (`customer_id` above predates this idiom and is NOT composite;
		 * retrofitting it is a separate decision, so the inconsistency is acknowledged here
		 * rather than implied safe.)
		 *
		 * NULLABLE, PERMANENTLY. A quote can be sent the moment somebody rings up, and a job is
		 * created only when the client says yes — so a live quote has no job, and a declined or
		 * expired one sits unlinked forever. `MATCH SIMPLE` (the default) skips the check
		 * entirely when any column of the key is NULL, so the constraint costs that nothing.
		 *
		 * This is a REAL constraint where `source_item_id` on the lines below is deliberately
		 * FK-less, and the difference is what each one must survive: a line's source item must
		 * outlive a business removing Inventory, whereas `core_job` is floor and is never
		 * removed.
		 */
		jobId: uuid(),

		/**
		 * WHAT THIS DOCUMENT SAYS ABOUT THE CLIENT — snapshot 1.
		 *
		 * Copied from `core_customer` when the client is chosen, and owned by the quote from
		 * then on. `promoteCustomerFields` in `modules/quoting/effects.ts` is the only way one
		 * of these ever travels back the other way, and it only runs when a person says yes.
		 */
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

		/**
		 * WHO IT IS SENT TO, which is not the same as who it is for.
		 *
		 * The design's example is `renske@fynbosinteriors.co.za` — a person at the client, on
		 * this quote, distinct from whatever address the customer record carries. Sending is
		 * addressed from here and nowhere else.
		 */
		sendToName: text(),
		sendToEmail: text(),

		/** `QT`, 1043, `QT-1043`. All three null until the quote is sent. */
		numberPrefix: text(),
		numberValue: integer(),
		numberFormatted: text(),

		status: text().notNull().default('draft'),

		/**
		 * The last calendar day this quote can be accepted. A DATE, not a timestamp: "valid
		 * until 22 August" is a promise about a day in the client's life, and storing an
		 * instant would make it expire at a different moment for a client in another timezone
		 * than the one printed on their copy.
		 */
		validUntil: date(),

		/** Deposit terms. At most one of the two is set — see `deposit_single_form`. */
		depositRatePpm: ppm(),
		depositAmountCents: cents(),

		/**
		 * THE PRICING CONTRACT, SNAPSHOTTED.
		 *
		 * Every one of these is an input to `priceDocument`, and every one is stored on the
		 * row rather than read from configuration at render time. A VAT rate change, a policy
		 * bump, a business that deregisters for VAT — none of them may alter a document that
		 * has already been issued. `price.ts` says the same thing about `policy`; this is the
		 * rest of the same idea.
		 */
		pricingMode: text().notNull().default('exclusive'),
		taxEngine: text().notNull().default('za_vat'),
		vatRatePpm: ppm().notNull().default(150_000),
		vatPolicy: text().notNull(),

		currency: text().notNull().default('ZAR'),

		/**
		 * WHAT `priceDocument` PRODUCED WHEN THIS WAS SENT — snapshot 3.
		 *
		 * All four move together: `snapshot_complete` refuses three-quarters of an answer.
		 * `snapshot_reconciles` refuses a subtotal and a VAT figure that do not sum to the
		 * total, which is the one arithmetic claim a client can check with a calculator.
		 */
		snapshotSubtotalCents: cents(),
		snapshotTaxCents: cents(),
		snapshotTotalCents: cents(),
		snapshotAt: timestamp({ withTimezone: true }),

		/**
		 * THE SHARE TOKEN — how a person who is not a user reaches this one document.
		 *
		 * The HASH, never the token. A leaked database backup, a stray log line or an errant
		 * `SELECT *` then hands somebody a value that opens nothing: SHA-256 is one-way, so the
		 * only copy of the token that can be used is the one in the client's email.
		 *
		 * No salt and no work factor, deliberately, and for once that is the right call: the
		 * token is 256 bits of `randomBytes`, not a password. There is no dictionary to attack
		 * and nothing to slow down — and a slow hash here would put a work factor on the
		 * critical path of every page load a client makes.
		 *
		 * Unique across the business, so a token means exactly one document. The RLS policy
		 * `document_share` keys off this column; see `0006_quote_sharing.sql`.
		 */
		shareTokenHash: text(),
		shareTokenIssuedAt: timestamp({ withTimezone: true }),

		/**
		 * The tracking the design's copy depends on.
		 *
		 * "Opened it twice" is a different sentence from "sent 4 days ago, no word yet", and
		 * neither can be said without counting. Denormalised alongside `quoting_quote_event`
		 * rather than derived from it: the list screen asks for these on every row, and a
		 * correlated count per quote is the N+1 the review checklist names.
		 */
		sentAt: timestamp({ withTimezone: true }),
		firstViewedAt: timestamp({ withTimezone: true }),
		lastViewedAt: timestamp({ withTimezone: true }),
		viewCount: integer().notNull().default(0),
		acceptedAt: timestamp({ withTimezone: true }),
		/** Who clicked accept, as they typed it. A client is not a user and has no account. */
		acceptedByName: text(),
		declinedAt: timestamp({ withTimezone: true }),
		declineReason: text(),

		/** A discarded draft. There is no delete path — see the note at the top of this file. */
		archivedAt: timestamp({ withTimezone: true }),

		...timestamps()
	},
	(t) => [
		unique('quoting_quote_id_currency').on(t.id, t.currency),

		// The jobs derivation asks "what has this job been quoted?" and nothing else.
		index('quoting_quote_job_idx').on(t.businessId, t.jobId),

		oneOf('quoting_quote_status_known', t.status, QUOTE_STATUSES),
		oneOf('quoting_quote_pricing_mode_known', t.pricingMode, PRICING_MODES),
		oneOf('quoting_quote_tax_engine_known', t.taxEngine, TAX_ENGINES),
		oneOf('quoting_quote_currency_supported', t.currency, ['ZAR']),

		check(
			'quoting_quote_customer_required_once_sent',
			sql`${t.status} = 'draft' or ${t.customerId} is not null`
		),

		// A number is allocated as a unit or not at all. A row with a prefix and no value is a
		// half-allocated document, and there is no reading of it that is safe to print.
		check(
			'quoting_quote_number_complete',
			sql`(${t.numberPrefix} is null and ${t.numberValue} is null and ${t.numberFormatted} is null)
			 or (${t.numberPrefix} is not null and ${t.numberValue} is not null and ${t.numberFormatted} is not null)`
		),
		check(
			'quoting_quote_number_required_once_sent',
			sql`${t.status} = 'draft' or ${t.numberFormatted} is not null`
		),
		// `QT-1043` means exactly one document, forever. The allocator makes duplicates
		// impossible; this makes them unstorable.
		unique('quoting_quote_number_unique').on(t.businessId, t.numberFormatted),

		// One token, one document. The policy that reads it would otherwise be able to match
		// two, and "this link opens exactly one thing" is the whole security model.
		unique('quoting_quote_share_token_unique').on(t.shareTokenHash),
		check(
			'quoting_quote_share_token_complete',
			sql`(${t.shareTokenHash} is null and ${t.shareTokenIssuedAt} is null)
			 or (${t.shareTokenHash} is not null and ${t.shareTokenIssuedAt} is not null)`
		),
		check('quoting_quote_view_count_not_negative', sql`${t.viewCount} >= 0`),

		check(
			'quoting_quote_deposit_single_form',
			sql`${t.depositRatePpm} is null or ${t.depositAmountCents} is null`
		),
		check(
			'quoting_quote_deposit_rate_fraction',
			sql`${t.depositRatePpm} is null or (${t.depositRatePpm} >= 0 and ${t.depositRatePpm} <= 1000000)`
		),
		check(
			'quoting_quote_deposit_amount_not_negative',
			sql`${t.depositAmountCents} is null or ${t.depositAmountCents} >= 0`
		),
		exactRange('quoting_quote_deposit_rate_exact', t.depositRatePpm),
		exactRange('quoting_quote_deposit_amount_exact', t.depositAmountCents),
		exactRange('quoting_quote_vat_rate_exact', t.vatRatePpm),
		exactRange('quoting_quote_snapshot_subtotal_exact', t.snapshotSubtotalCents),
		exactRange('quoting_quote_snapshot_tax_exact', t.snapshotTaxCents),
		exactRange('quoting_quote_snapshot_total_exact', t.snapshotTotalCents),

		check(
			'quoting_quote_snapshot_complete',
			sql`(${t.snapshotSubtotalCents} is null and ${t.snapshotTaxCents} is null
			     and ${t.snapshotTotalCents} is null and ${t.snapshotAt} is null)
			 or (${t.snapshotSubtotalCents} is not null and ${t.snapshotTaxCents} is not null
			     and ${t.snapshotTotalCents} is not null and ${t.snapshotAt} is not null)`
		),
		check(
			'quoting_quote_snapshot_reconciles',
			sql`${t.snapshotTotalCents} is null
			 or ${t.snapshotSubtotalCents} + ${t.snapshotTaxCents} = ${t.snapshotTotalCents}`
		),

		notBlank('quoting_quote_vat_policy_present', t.vatPolicy),

		// The quotes list, and Home's "waiting on clients" count: both ask for one business's
		// quotes in a given status, most recently touched first.
		index('quoting_quote_business_status_idx').on(t.businessId, t.status, t.updatedAt),
		index('quoting_quote_customer_idx').on(t.businessId, t.customerId)
	]
);

/**
 * One line of what is being quoted.
 *
 * The design's editor row is a description, a 12px line of provenance beneath it, a quantity
 * and a unit price. The DOCUMENT shows a fuller description than the editor does — the editor
 * says "Solid oak kitchen island top, 2400 × 900" where the document says "…, 40mm European
 * oak, oiled finish" — so both are columns. `document_description` falling back to
 * `description` is a render-time decision (see `$lib/core/quoting`), not a stored duplicate.
 *
 * `quote_id` has no `references()` here on purpose: the real constraint is composite,
 * `(quote_id, currency) -> quoting_quote (id, currency)`, and drizzle-kit cannot express one.
 * It is written by hand in `drizzle/0005_quoting.sql`.
 */
export const quoteLine = pgTable(
	'quoting_quote_line',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		quoteId: uuid().notNull(),

		/** Display order. Sparse on purpose, so a reorder is an UPDATE and never a shuffle. */
		position: integer().notNull().default(0),

		/** What the editor's table shows. */
		description: text().notNull(),
		/** The 12px second line: "From Inventory · European oak, 40mm". */
		provenance: text(),
		/** What the document shows, when it says more than the editor does. */
		documentDescription: text(),

		qtyE6: qtyE6('qty_e6').notNull(),
		unitPriceMicros: micros().notNull(),
		currency: text().notNull().default('ZAR'),

		taxTreatment: text().notNull().default('standard'),
		/** In force for THIS line, snapshotted. `priceDocument` ignores it unless 'standard'. */
		vatRatePpm: ppm().notNull().default(150_000),

		/**
		 * WHERE THIS LINE CAME FROM — snapshot 2.
		 *
		 * Deliberately not a foreign key: `inventory_item` does not exist until T23, and a
		 * quote must survive a business removing Inventory entirely. The columns above are
		 * the snapshot; this is provenance, and the two are allowed to disagree the moment
		 * somebody edits the stock item. That divergence is the feature.
		 */
		sourceItemId: uuid(),
		sourceCapturedAt: timestamp({ withTimezone: true }),

		/** A removed line. See the note at the top of this file — nothing is deleted. */
		archivedAt: timestamp({ withTimezone: true }),

		...timestamps()
	},
	(t) => [
		notBlank('quoting_quote_line_description_present', t.description),
		oneOf('quoting_quote_line_tax_treatment_known', t.taxTreatment, TAX_TREATMENTS),
		oneOf('quoting_quote_line_currency_supported', t.currency, ['ZAR']),
		exactRange('quoting_quote_line_qty_exact', t.qtyE6),
		exactRange('quoting_quote_line_unit_price_exact', t.unitPriceMicros),
		exactRange('quoting_quote_line_vat_rate_exact', t.vatRatePpm),
		check('quoting_quote_line_qty_not_negative', sql`${t.qtyE6} >= 0`),
		index('quoting_quote_line_quote_idx').on(t.quoteId, t.position)
	]
);

/**
 * WHAT HAPPENED TO A QUOTE, AND WHEN.
 *
 * T18: "Each transition is an event with a timestamp." Append-only in practice and in intent —
 * there is no update path in `modules/quoting` and no delete anywhere in this database, so the
 * table is a record rather than a cache of one.
 *
 * It feeds three things: the activity timeline in T21, the design's "Opened it twice" copy, and
 * the answer to "when exactly did they accept this" — which, on a document somebody may have to
 * defend, is a question with a right answer rather than an approximate one.
 *
 * `actor` is deliberately loose. Half of these events are caused by a person with no account:
 * a client opening an emailed link is not a user, has no `user_id`, and never will. So the
 * column says WHAT KIND of actor it was and the detail carries the rest.
 */
export const quoteEvent = pgTable(
	'quoting_quote_event',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),
		quoteId: uuid()
			.notNull()
			.references(() => quote.id, { onDelete: 'restrict' }),

		/** `sent`, `viewed`, `accepted`, `declined`, `expired`. */
		kind: text().notNull(),

		/** `business` (somebody signed in), `client` (the shared link), `system` (the sweeper). */
		actor: text().notNull(),
		/** The member who acted, when there was one. Null for a client and for the sweeper. */
		actorUserId: text(),
		/** Free text: the name a client typed on acceptance, a decline reason, an email address. */
		detail: text(),

		/**
		 * When it happened, as its own column rather than relying on `created_at`.
		 *
		 * They are the same value today. They stop being the same the first time an event is
		 * backfilled or imported, and the difference between "when this happened" and "when we
		 * recorded it" is exactly the distinction an audit trail exists to keep.
		 */
		occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),

		...timestamps()
	},
	(t) => [
		oneOf('quoting_quote_event_kind_known', t.kind, [
			'sent',
			'viewed',
			'accepted',
			'declined',
			'expired'
		]),
		oneOf('quoting_quote_event_actor_known', t.actor, ['business', 'client', 'system']),
		index('quoting_quote_event_quote_idx').on(t.quoteId, t.occurredAt)
	]
);
