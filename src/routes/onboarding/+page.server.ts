/**
 * STUB AWAITING DESIGN (T06).
 *
 * The design has no onboarding screen, and the product cannot be reached without one: a
 * signed-in person with no business has nowhere to go. This is the ONLY path that mints a
 * `core_business`, and the only place a `core_member` with role `owner` is created.
 *
 * `withNewBusiness` is what makes it safe. It generates the id itself and adopts it as the
 * transaction's tenant context before the first statement, so both inserts satisfy the same
 * `tenant_isolation` policy every other write in the product does. There is no exemption
 * here and no privileged connection — see the note in `$lib/server/core/ctx`.
 */
import { fail, redirect, type Actions } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { check, messagesByField, type Vocabulary } from '$lib/core/validation';
import { withNewBusiness } from '$lib/server/core/ctx';
import { BRAND_OPTIONS, DEFAULT_BRAND, isBrandColor } from '$lib/components/theme';
import type { PageServerLoad } from './$types';

const BUSINESS_COOKIE = 'cjs_business';

const schema = z.object({
	tradingName: z.string().trim().min(1, 'Your business needs a name to put on a quote'),
	/**
	 * Optional, and that is a decision rather than laziness. VAT registration is compulsory
	 * only above the R1m turnover threshold, so most small businesses have no number and
	 * must still be able to invoice — they simply issue a document that is not a tax invoice.
	 */
	vatNumber: z
		.string()
		.trim()
		.regex(/^4\d{9}$/, 'A South African VAT number is 10 digits starting with 4')
		.optional()
		.or(z.literal('').transform(() => undefined)),
	addressLine1: z.string().trim().optional(),
	city: z.string().trim().optional(),
	postalCode: z.string().trim().optional(),
	phone: z.string().trim().optional(),
	brandColor: z.string().refine(isBrandColor, 'Pick one of the offered colours')
});

/** What to call each field when the standard has to write the sentence itself. */
const WORDS: Vocabulary = {
	fields: {
		tradingName: 'A business name',
		vatNumber: 'A VAT number',
		addressLine1: 'An address',
		city: 'A city',
		postalCode: 'A postal code',
		phone: 'A phone number',
		brandColor: 'A brand colour'
	}
};

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/sign-in?next=%2Fonboarding');

	// Already has one. Someone reaching this by typing the URL should land in the product,
	// not be invited to create a second business they did not ask for.
	if (locals.business) redirect(303, '/');

	return {
		userName: locals.user.name,
		brandOptions: BRAND_OPTIONS,
		defaultBrand: DEFAULT_BRAND
	};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies, url }) => {
		if (!locals.user) redirect(303, '/sign-in?next=%2Fonboarding');

		const values = Object.fromEntries(await request.formData()) as Record<string, string>;
		const parsed = check(schema, values, WORDS);

		if (!parsed.ok) {
			// What they typed goes back with the errors. Somebody creating their business has
			// entered a name, a VAT number and an address; losing that to a typo in one field
			// would be the first thing this product ever did to them.
			return fail(400, { values, errors: messagesByField(parsed) });
		}

		const input = parsed.value;
		const userId = locals.user.id;

		const businessId = await withNewBusiness(userId, async ({ tx, businessId }) => {
			await tx.execute(sql`
				insert into core_business
					(business_id, trading_name, vat_number, address_line1, city, postal_code, phone, brand_color)
				values (
					${businessId}, ${input.tradingName}, ${input.vatNumber ?? null},
					${input.addressLine1 ?? null}, ${input.city ?? null}, ${input.postalCode ?? null},
					${input.phone ?? null}, ${input.brandColor}
				)
			`);

			// Owner, not staff. The design gates adding and removing modules on "Owners and
			// billing admins only", and whoever created the business is by definition the
			// first person who has to be able to do that.
			await tx.execute(sql`
				insert into core_member (business_id, user_id, role)
				values (${businessId}, ${userId}, 'owner')
			`);

			return businessId;
		});

		// Act as the business that was just created, rather than making them pick it.
		cookies.set(BUSINESS_COOKIE, businessId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !/^(localhost|127\.0\.0\.1)$/.test(url.hostname),
			maxAge: 60 * 60 * 24 * 365
		});

		redirect(303, '/');
	}
};
