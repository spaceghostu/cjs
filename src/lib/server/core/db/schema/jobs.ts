/**
 * JOBS — `core_job`. The work itself.
 *
 * A quote is a promise, an invoice is a demand, and until this table existed the thing both of
 * them were ABOUT had nowhere to live. SPA-20 puts it on the floor: one row per piece of work,
 * created the moment a client says yes, referenced by the documents on either side of it.
 *
 * ONE TABLE. THERE IS NO `job_cards`.
 * -----------------------------------
 * The ticket, and the written answer to its own Q1, describe TWO tables — `jobs` for the work
 * and `job_cards` for the fieldwork evidence, with a note that it was "worth confirming with the
 * client before the migration". It was confirmed, and the answer was that in this business a job
 * and a job card are the same thing: the card IS the job, written down. So there is one table,
 * and the next reader — who will arrive holding that written answer and looking for the second
 * one — is being told here that its absence is a decision rather than an omission.
 *
 * Nothing in this ticket creates a per-visit artefact. If a later ticket genuinely needs one —
 * photographs from a Tuesday, a signature at the door — that is a new entity with a new argument
 * to make, not a resurrection of this one.
 *
 * WHY `core_`, AND NOT A MODULE NAMESPACE
 * ---------------------------------------
 * Every table in this database is namespaced by its owner (`core_business`, `quoting_quote`,
 * `invoicing_invoice`, `inventory_item`), and `schema.ts` exists so that one `cat` answers "what
 * tables are there". A bare `jobs` would be the one row nobody can place — the same argument
 * `schema/inventory.ts` makes about renaming the ticket's bare `stock_count`, and the reason
 * this file ships `core_job` where the ticket says `jobs`.
 *
 * `core_` rather than `scheduling_` because jobs is FLOOR. A job is created by the platform, in
 * `modules/quoting/accept.ts`, inside `actAsSharedTenant` — a transaction that applies no
 * entitlement gate at all, because the person on the other end of it is a client with a link and
 * not a subscriber. Every business gets jobs, exactly as every business gets customers and
 * document numbers, whether or not it owns "Job scheduling" (`MODULE_KEYS` has `scheduling`;
 * there is no `jobs` key and there should not be). The MODULE gates the screens SPA-23 will
 * build; it does not gate the row.
 *
 * WHY `status` HOLDS NO COMMERCIAL VALUE
 * --------------------------------------
 * The legacy system this replaces had `jobs.status = 'quoted'` sitting beside
 * `quotes.status = 'sent'` — two columns owning one fact, guaranteed to disagree the first time
 * one was written and the other was not. So `JOB_STATUSES` describes the physical work and
 * nothing else, and where a job stands commercially is computed on READ, from the quotes and
 * invoices linked to it, by `$lib/core/jobs/commercial.ts`. There is no column here to
 * contradict.
 *
 * WHY CLOSURE IS HUMAN
 * --------------------
 * Nothing in this file, its migration, or the code that writes it moves a job to `done`. Paying
 * every invoice on a job leaves its status byte-identical, because only the person who did the
 * work knows whether the work is finished. There is deliberately NO transition trigger: the
 * database checks membership in `JOB_STATUSES` and nothing about ordering, so a business that
 * has to go back out and refit a hinge can move a `done` job to `in_progress` without arguing
 * with its software. The guarantee that nothing closes a job automatically is that no code does
 * it — which is a guarantee the tests can assert, where a trigger would only be one more thing
 * to argue around later.
 *
 * WHY `(business_id, id)` IS UNIQUE
 * ---------------------------------
 * So `quoting_quote` and `invoicing_invoice` can carry a COMPOSITE foreign key to it —
 * `(business_id, job_id) -> core_job (business_id, id)` — which is the same device
 * `inventory_item (id, currency)` uses. Postgres performs referential integrity with row
 * security BYPASSED, so a single-column foreign key would cheerfully accept business A's quote
 * pointing at business B's job. The composite form makes that a database error rather than a
 * policy nobody is enforcing. The constraints themselves are hand-written in
 * `drizzle/0010_jobs_platform.sql` — drizzle-kit has no builder for a composite foreign key.
 */
import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { JOB_PRIORITIES, JOB_STATUSES } from '$lib/core/jobs';
import { businessId, id, notBlank, oneOf, timestamps } from '../base';
import { business, customer } from './core';

/**
 * A piece of work. "Kitchen fit, Rondebosch" — `JOB-0001`.
 *
 * THE CUSTOMER IS REQUIRED. Work is always for somebody, and the automatic creation path can
 * satisfy it without a special case: `quoting_quote_customer_required_once_sent` guarantees that
 * a non-draft quote has a `customer_id`, and `answerSharedQuote` admits only `sent` and `viewed`
 * quotes, so a quote that can be accepted always names a client.
 *
 * THERE IS NO `request_id`. The ticket names one, pointing at an inbound request, and there is
 * no requests table and no request concept anywhere in this product. A uuid column with no
 * writer, no reader and no referent is the exact defect this codebase argues against; it is a
 * one-line additive migration the day a requests inbox exists.
 *
 * `service`, `area` and `description` are free text and all nullable, for the reason
 * `schema/inventory.ts` gives about units: a joinery's "kitchen fit" and a plumber's "geyser
 * replacement" are the same field, and any closed list would be wrong for the third trade on its
 * first day. A job created on acceptance carries only a description seeded from the quote, which
 * is an honest empty rather than an invented taxonomy.
 *
 * THE NUMBER IS ALLOCATED AT CREATION, not peeked at — the same reading as
 * `inventory_stock_count`. An invoice peeks because a burnt `INV-1043` is a gap an accountant
 * will ask about; `JOB-0001` is internal, and a job that exists has a number.
 */
export const job = pgTable(
	'core_job',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		/**
		 * THIS KEY IS SINGLE-COLUMN, AND THAT IS NOT THE GUARANTEE THE HEADER CLAIMS FOR JOBS.
		 *
		 * The argument above — that Postgres checks referential integrity with row security
		 * bypassed, so only a composite key can stop a cross-tenant link — applies to this
		 * column exactly as it applies to `quoting_quote.job_id`. It is not answered the same
		 * way, and the difference is worth naming rather than leaving for somebody to infer
		 * from the absence of a second column: the composite form needs a
		 * `(business_id, id)` unique on the REFERENCED table, `core_job` declares one below for
		 * precisely that reason, and `core_customer` has only its primary key. Adding one is a
		 * change to a table this ticket does not otherwise touch.
		 *
		 * So the database will currently accept a job in business A naming business B's
		 * customer. Nothing in the product can produce one: the only writer is `createJob`, and
		 * its one caller takes the customer straight off the accepted quote row inside the same
		 * tenant transaction. The gap is what a future writer must not assume away — a customer
		 * picker on SPA-23's screens is checked by the code that fills it and by nothing else,
		 * until `core_customer` gains the unique and this key becomes
		 * `(business_id, customer_id) -> core_customer (business_id, id)`.
		 *
		 * `quoting_quote.customer_id` is the same shape for the same reason, which is why fixing
		 * this belongs in one migration that fixes both rather than here.
		 */
		customerId: uuid()
			.notNull()
			.references(() => customer.id, { onDelete: 'restrict' }),

		/** `JOB` / 1 / `JOB-0001`. Three columns because sorting and printing are different questions. */
		numberPrefix: text().notNull(),
		numberValue: integer().notNull(),
		numberFormatted: text().notNull(),

		/** "Kitchen fit". The business's own word for the kind of work — see the header. */
		service: text(),
		/** "Rondebosch". Where it is, in whatever terms the business uses for where things are. */
		area: text(),
		description: text(),

		priority: text().notNull().default('normal'),

		/** The physical work, and only that. See the file header. */
		status: text().notNull().default('unscheduled'),

		/**
		 * Who started it, when a person did.
		 *
		 * NULLABLE, and the acceptance path is why: a client answering an emailed link has no
		 * account, `actAsSharedTenant` attaches no user, and an attribution to whoever happens to
		 * own the business would be a fabrication. `share.ts` makes the same argument about the
		 * audit row.
		 */
		startedByUserId: text(),

		/** Removal is an UPDATE. The application role holds no DELETE anywhere in `public`. */
		archivedAt: timestamp({ withTimezone: true }),

		...timestamps()
	},
	(t) => [
		// The composite foreign keys in `0010_jobs_platform.sql` point at this. See the header.
		unique('core_job_business_id_unique').on(t.businessId, t.id),

		oneOf('core_job_status_known', t.status, JOB_STATUSES),
		oneOf('core_job_priority_known', t.priority, JOB_PRIORITIES),

		notBlank('core_job_number_prefix_present', t.numberPrefix),
		// `JOB-0007` means exactly one job, forever. The allocator makes duplicates impossible;
		// this makes them unstorable.
		unique('core_job_number_unique').on(t.businessId, t.numberFormatted),

		// The two queries the pipeline screen will ask: this business's jobs by state, and one
		// client's jobs.
		index('core_job_business_status_idx').on(t.businessId, t.status, t.createdAt),
		index('core_job_customer_idx').on(t.businessId, t.customerId)
	]
);
