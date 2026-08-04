/**
 * BILLING — which modules a business has, and WHEN.
 *
 * The design's promise is "You're only charged for the days you have a module". A boolean
 * `owns` cannot express that sentence, and it cannot express the other one either — "your
 * payroll data stays yours" — because both are statements about time. So the record is a
 * PERIOD: a start, an optional end, and a price snapshot taken the day the period opened.
 *
 * Removing a module closes a period. Re-adding opens a new one. Nothing is ever rewritten
 * and nothing is ever deleted, which is what makes the removed state (read-only, exportable)
 * reconstructible years later rather than a flag somebody has to remember to keep.
 *
 * WHY `voided_at` EXISTS
 * ---------------------
 * The undo affordance in T13 says a just-added module can be taken back "as if it never
 * opened, and charges nothing". Closing the period instead — `ended_at = started_at` — would
 * leave a zero-length period behind, and a zero-length period reads as REMOVED, which would
 * offer someone a read-only archive of a module they had for four seconds and never used.
 *
 * Deleting the row is not available either, and deliberately: the application role holds no
 * DELETE anywhere in `public`. So the row stays, marked as never having counted. A voided
 * period grants no access, is charged nothing and appears in no total, and the history still
 * says truthfully that somebody pressed Add and then changed their mind.
 *
 * WHY THE PRICE IS SNAPSHOTTED
 * ----------------------------
 * `price_cents` is what this business agreed to pay for this period, not what the catalogue
 * says today. A catalogue price change must never silently re-price a period that has already
 * been charged — the same reason `priceDocument` snapshots its VAT policy onto every document
 * it prices.
 */
import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { MODULE_KEYS } from '$lib/core/modules/catalogue';
import { businessId, cents, exactRange, id, oneOf, timestamps } from '../base';
import { business } from './core';

export const subscription = pgTable(
	'billing_subscription',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		/**
		 * A catalogue key. `text` with a CHECK rather than a `pgEnum`, because the catalogue is
		 * data that grows: adding an eighth module should be one row in `catalogue.ts` and one
		 * regenerated CHECK, not an enum migration that has to be coordinated with a deploy.
		 */
		moduleKey: text().notNull(),

		/** When the business got the module. Drives proration — see `money/proration.ts`. */
		startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		/** Null while the module is still owned. */
		endedAt: timestamp({ withTimezone: true }),
		/** Set by undo. A voided period never happened, for access and for money alike. */
		voidedAt: timestamp({ withTimezone: true }),

		/** The monthly price agreed for THIS period, in integer cents. Never re-read. */
		priceCents: cents().notNull(),
		currency: text().notNull().default('ZAR'),

		...timestamps()
	},
	(t) => [
		oneOf('billing_subscription_module_known', t.moduleKey, MODULE_KEYS),
		oneOf('billing_subscription_currency_supported', t.currency, ['ZAR']),
		exactRange('billing_subscription_price_exact', t.priceCents),
		check('billing_subscription_price_not_negative', sql`${t.priceCents} >= 0`),
		check(
			'billing_subscription_period_ordered',
			sql`${t.endedAt} is null or ${t.endedAt} >= ${t.startedAt}`
		),

		/**
		 * At most one LIVE period per module per business.
		 *
		 * The partial unique index is the only thing that makes "add twice" impossible under
		 * concurrency. Checking for an open period in application code and then inserting is
		 * two statements with a gap between them, and two clicks on Add land in that gap — a
		 * business charged twice for one module, which is precisely the defect class this
		 * codebase treats as unacceptable.
		 */
		uniqueIndex('billing_subscription_one_open_per_module')
			.on(t.businessId, t.moduleKey)
			.where(sql`ended_at is null and voided_at is null`),

		index('billing_subscription_business_idx').on(t.businessId, t.moduleKey, t.startedAt)
	]
);

export type SubscriptionRow = typeof subscription.$inferSelect;
