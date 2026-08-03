/**
 * STUB AWAITING DESIGN (T06).
 *
 * A shell for later. The design links Settings from the sidebar footer but never draws it,
 * so this covers the four things that must exist for the product to function — business
 * details, the brand colour, who is in the business, and a placeholder where T12 puts
 * billing — and invents nothing else.
 */
import { fail, redirect, type Actions } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { withBusiness } from '$lib/server/core/ctx';
import { business as businessTable, member as memberTable } from '$lib/server/core/db/schema/core';
import { user as userTable } from '$lib/server/core/db/schema/identity';
import { BRAND_OPTIONS, isBrandColor } from '$lib/components/theme';
import type { PageServerLoad } from './$types';

const details = z.object({
	tradingName: z.string().trim().min(1, 'Your business needs a name to put on a quote'),
	legalName: z.string().trim().optional(),
	registrationNumber: z.string().trim().optional(),
	vatNumber: z
		.string()
		.trim()
		.regex(/^4\d{9}$/, 'A South African VAT number is 10 digits starting with 4')
		.optional()
		.or(z.literal('').transform(() => undefined)),
	phone: z.string().trim().optional(),
	email: z
		.email('Enter an email address like you@yourbusiness.co.za')
		.optional()
		.or(z.literal('').transform(() => undefined)),
	addressLine1: z.string().trim().optional(),
	addressLine2: z.string().trim().optional(),
	city: z.string().trim().optional(),
	postalCode: z.string().trim().optional(),
	brandColor: z.string().refine(isBrandColor, 'Pick one of the offered colours')
});

export const load: PageServerLoad = async (event) => {
	return withBusiness(event, async (ctx) => {
		// Members join to `identity.user` for names. Identity has no tenant column, so the
		// join is filtered by the membership rows RLS has already scoped — not the other way
		// round.
		const members = await ctx.tx
			.select({
				id: memberTable.id,
				role: memberTable.role,
				userId: memberTable.userId,
				name: userTable.name,
				email: userTable.email
			})
			.from(memberTable)
			.innerJoin(userTable, eq(userTable.id, memberTable.userId))
			.orderBy(memberTable.createdAt);

		return {
			business: ctx.business,
			members,
			brandOptions: BRAND_OPTIONS,
			/** The design gates module changes on "Owners and billing admins only". */
			isOwner: ctx.member.role === 'owner'
		};
	});
};

export const actions: Actions = {
	details: async (event) => {
		const values = Object.fromEntries(await event.request.formData()) as Record<string, string>;
		const parsed = details.safeParse(values);

		if (!parsed.success) {
			const errors: Record<string, string> = {};
			for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
			return fail(400, { values, errors });
		}

		const input = parsed.data;

		await withBusiness(event, async (ctx) => {
			// No `where business_id = …`. The policy scopes the UPDATE to this tenant's single
			// row, so naming the id would add a second, weaker answer to a question the
			// database has already settled.
			await ctx.tx.update(businessTable).set({
				tradingName: input.tradingName,
				legalName: input.legalName ?? null,
				registrationNumber: input.registrationNumber ?? null,
				vatNumber: input.vatNumber ?? null,
				phone: input.phone ?? null,
				email: input.email ?? null,
				addressLine1: input.addressLine1 ?? null,
				addressLine2: input.addressLine2 ?? null,
				city: input.city ?? null,
				postalCode: input.postalCode ?? null,
				brandColor: input.brandColor
			});
		});

		// PRG: a refresh after saving must not re-submit the form.
		redirect(303, '/settings?saved=1');
	}
};
