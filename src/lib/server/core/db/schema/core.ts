/**
 * CORE — the platform floor.
 *
 * The tables every module shares: who the tenant is, who may act for it, who it sells to,
 * and how its documents are numbered. Modules own their own tables; none of them own these.
 *
 * WHY `core_business.business_id` IS THE PRIMARY KEY
 * --------------------------------------------------
 * Every table in this database outside `identity`/`app`/`audit`/`drizzle` carries
 * `business_id uuid not null`, and `scripts/invariants.sql` refuses one that does not. The
 * tenant table has to satisfy that too — so rather than an `id` column plus a special-case
 * exemption, the business's own identifier IS `business_id`. The consequence is worth the
 * mild awkwardness of the name: the Row Level Security policy on every table in the
 * database is the *same expression*, `business_id = app.current_business_id()`, with
 * nothing to remember and no table that is nearly-but-not-quite like the others.
 *
 * NOTHING IS EVER DELETED
 * -----------------------
 * The application role holds no `DELETE` outside `identity` (see `drizzle/0003_platform.sql`),
 * so "business records are never destroyed" is structural rather than a policy someone can
 * forget. Where a row needs to go away from the user's point of view it is archived — hence
 * `core_customer.archived_at` and no delete path anywhere.
 *
 * Correspondingly `core_member.user_id` is `ON DELETE RESTRICT`, not `CASCADE`. Postgres
 * runs referential actions as the referencing table's owner, so a `CASCADE` here would
 * reach around the revoked `DELETE` grant and quietly destroy membership history the
 * instant an identity row went away.
 */
import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique
} from 'drizzle-orm/pg-core';
import { BRAND_OPTIONS, DEFAULT_BRAND } from '$lib/components/theme/brand';
import { businessId, id, notBlank, oneOf, timestamps } from '../base';
import { user } from './identity';

/**
 * Owner or staff. The single source of truth for the role that gates billing.
 *
 * better-auth's `organization` plugin is deliberately not installed: it would bring a
 * second membership table and a second role system, and any drift between the two lands on
 * the question "may this person add a paid module?". See `$lib/server/auth`.
 */
export const memberRole = pgEnum('core_member_role', ['owner', 'staff']);

export type MemberRole = (typeof memberRole.enumValues)[number];

/**
 * Document sequences the floor knows about.
 *
 * Listed here rather than in each module because the counter table is shared, and because
 * a module that invented its own numbering would break the one guarantee a client cares
 * about: that `INV-1042` means exactly one document, forever.
 *
 * `job` is INTERNAL, the way `stock_count` is: `JOB-0001` is a handle the business uses on
 * the phone to each other, where `INV-1042` is a handle a client and their accountant use.
 * It is listed here anyway, and for the same reason as everything else on this line — the
 * counter table is shared, and a module minting its own numbers is how a business ends up
 * with two `JOB-0007`s and no way to tell which one the van was sent to.
 */
export const DOCUMENT_TYPES = ['quote', 'invoice', 'credit_note', 'stock_count', 'job'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const business = pgTable(
	'core_business',
	{
		businessId: businessId().primaryKey(),

		/** What the business calls itself. Appears on every document header. */
		tradingName: text().notNull(),
		/** The registered name, when it differs. A tax invoice needs the legal entity. */
		legalName: text(),
		registrationNumber: text(),
		/**
		 * Nullable on purpose. VAT registration is compulsory only above the R1m turnover
		 * threshold, so a great many small businesses have no VAT number and must still be
		 * able to invoice — they simply issue a document that is not a tax invoice.
		 */
		vatNumber: text(),

		phone: text(),
		email: text(),

		// The document header in the design needs name, street address, VAT number, phone.
		addressLine1: text(),
		addressLine2: text(),
		city: text(),
		postalCode: text(),
		country: text().notNull().default('ZA'),

		/**
		 * The per-tenant brand colour from T01. Constrained to the four options the design
		 * offers, because this value reaches the DOM as an inline custom property and an
		 * arbitrary string there is a style injection. `toBrandColor()` narrows on the way
		 * in; this refuses on the way down.
		 */
		brandColor: text().notNull().default(DEFAULT_BRAND),

		/**
		 * Stored per business even though the union is one value wide. Every money row in
		 * the database carries its currency explicitly, so widening `CurrencyCode` later is
		 * a feature rather than a migration.
		 */
		currency: text().notNull().default('ZAR'),
		locale: text().notNull().default('en-ZA'),
		aiEnabled: boolean().notNull().default(false),

		...timestamps()
	},
	(t) => [
		notBlank('core_business_trading_name_present', t.tradingName),
		oneOf(
			'core_business_brand_color_known',
			t.brandColor,
			BRAND_OPTIONS.map((o) => o.value)
		),
		oneOf('core_business_currency_supported', t.currency, ['ZAR'])
	]
);

export const member = pgTable(
	'core_member',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),
		/** `text`, not `uuid` — better-auth mints its own string ids. */
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		role: memberRole().notNull().default('staff'),
		...timestamps()
	},
	(t) => [
		unique('core_member_one_per_user_per_business').on(t.businessId, t.userId),
		// Sign-in asks "which businesses is this person in?" before any tenant context
		// exists, so this index sits on the hot path of every single request.
		index('core_member_user_idx').on(t.userId)
	]
);

export const customer = pgTable(
	'core_customer',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		/** The client. A company name, or a person's name when they are the client. */
		name: text().notNull(),
		contactPerson: text(),
		email: text(),
		phone: text(),
		vatNumber: text(),

		addressLine1: text(),
		addressLine2: text(),
		city: text(),
		postalCode: text(),
		country: text().notNull().default('ZA'),

		/** Archive, never delete. A customer on an old invoice must stay resolvable forever. */
		archivedAt: timestamp({ withTimezone: true }),

		...timestamps()
	},
	(t) => [
		notBlank('core_customer_name_present', t.name),
		index('core_customer_business_name_idx').on(t.businessId, t.name)
	]
);

/**
 * `QT-1043`, `INV-1042`. One counter per business per document type.
 *
 * Allocation is a single `INSERT … ON CONFLICT DO UPDATE … RETURNING`, which takes a row
 * lock for the duration of the caller's transaction — so two concurrent quotes cannot be
 * handed the same number, and a rolled-back quote leaves a gap rather than reusing a number
 * a client may already have seen. See `allocateDocumentNumber` in `numbering.ts`.
 *
 * This table is the reason node-postgres was chosen over neon-http: without real
 * transactions, "atomic" here would be a lie.
 */
export const documentNumber = pgTable(
	'core_document_number',
	{
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),
		docType: text().notNull(),
		/** `QT`, `INV`. Per business, so a tenant can brand its own sequence. */
		prefix: text().notNull(),
		/** Zero-padding width. `QT-1043` is 4. */
		pad: integer().notNull().default(4),
		/** The number the NEXT allocation will hand out. */
		nextValue: integer().notNull(),
		...timestamps()
	},
	(t) => [
		primaryKey({ columns: [t.businessId, t.docType] }),
		oneOf('core_document_number_type_known', t.docType, DOCUMENT_TYPES),
		notBlank('core_document_number_prefix_present', t.prefix),
		check('core_document_number_next_positive', sql`${t.nextValue} > 0`),
		check('core_document_number_pad_sane', sql`${t.pad} between 1 and 12`)
	]
);
