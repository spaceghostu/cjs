/**
 * A RIVAL'S REAL RECORD AND A RECORD THAT NEVER EXISTED, ANSWERED IDENTICALLY.
 *
 * Row Level Security has already made "another business's quote" and "no such quote" the same
 * answer inside the database — `loadQuote` and its siblings carry no `business_id` predicate at
 * all, and the `tenant_isolation` policy is the filter. This file proves the answer stays the
 * same all the way OUT: that every tenant-scoped id route turns both causes into one refusal
 * that is identical in status and identical byte for byte in its body.
 *
 * WHY THAT IS A SECURITY PROPERTY AND NOT A COPY PREFERENCE. A refusal that differs — by a word,
 * by a status, by a `code`, by whether it offers a next step — is an oracle. Somebody walking
 * ids through this product would learn which ones name a real document, and "this id exists but
 * is not yours" is exactly the fact tenancy exists to withhold. `notFound()` in
 * `$lib/core/refusals` is the one place the sentence is written, and `refusals.test.ts` pins
 * what that sentence may not contain. This file proves the WIRING: that every route reaches for
 * that helper and none of them says anything else on the way past.
 *
 * WHY THIS FILE IS NOT COLOCATED, unlike `inventory/counts/[id]/guards.test.ts`, which
 * introduced the route-test shape to this codebase. That file guards ONE route and sits beside
 * it. The property here belongs to no single route: it is that FIVE of them answer the same,
 * and a copy of these assertions in five directories would drift apart the first time one of
 * them was edited alone. So it sits at the root of `(app)`, which is the smallest directory
 * that contains every route it makes a claim about.
 *
 * WHY THE RIVAL'S ID MUST BE A REAL, COMMITTED RECORD. Two random UUIDs would produce identical
 * answers while proving nothing whatsoever about RLS — the interesting case is a row that
 * GENUINELY EXISTS being indistinguishable from one that does not. To stop the file passing for
 * that wrong reason, every rival record is first asserted VISIBLE to the rival's own locals. If
 * that assertion fails the fixture is broken and nothing below it means anything, so it fails
 * loudly and first.
 *
 * AND WHY `isHttpError` IS ASSERTED BEFORE ANY BODY IS COMPARED. A redirect to sign-in, or a
 * genuine 500 from a broken fixture, would otherwise satisfy "both calls threw the same shape"
 * and the file would go green while testing nothing. The refusal has to be an HTTP error before
 * its body is worth reading.
 *
 * THE ACCESS MAP IS A TRAP WORTH NAMING. The PDF route skips any module whose access is `none`,
 * so a fixture with narrower entitlement would make its resolver loop short-circuit and return
 * the same 404 for a reason that has nothing to do with tenancy. Thornhill therefore holds
 * `write` on quoting, invoicing AND inventory throughout.
 *
 * Requires a live database. There is no mock anywhere here: the app role genuinely cannot
 * bypass a policy, which is the only reason any of these assertions mean something.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isActionFailure, isHttpError } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { assertDatabaseRoleIsSafe, closePool, runScoped } from '$lib/server/core/db/client';
import {
	cleanupFixtures,
	createBusiness,
	createCustomer,
	createUser,
	eventFor,
	localsFor,
	type TestBusiness,
	type TestUser
} from '$lib/server/core/db/fixtures';
import { NO_ACCESS, type AccessMap } from '$lib/server/core/ctx';
import { notFoundMessage } from '$lib/core/refusals';
import { business as businessTable } from '$lib/server/core/db/schema/core';
import { toBusiness } from '$lib/server/core/db/map';
import { createDraft as createQuoteDraft } from '$lib/server/modules/quoting/effects';
import { createDraft as createInvoiceDraft } from '$lib/server/modules/invoicing/effects';
import { createItem } from '$lib/server/modules/inventory/effects';
import { stockCount } from '$lib/server/core/db/schema/inventory';
import { load as loadQuotePage, actions as quoteActions } from './quoting/[id]/+page.server';
import { load as loadInvoicePage } from './invoicing/[id]/+page.server';
import { load as loadItemPage } from './inventory/[id]/+page.server';
import { load as loadCountPage } from './inventory/counts/[id]/+page.server';
import { load as loadWorkingsPage } from './invoicing/[id]/workings/+page.server';
import { GET as getDocumentPdf } from './documents/[id]/pdf/+server';
import { POST as saveCountSheet } from './inventory/counts/[id]/save/+server';

/**
 * Generous, because teardown is a delete across two dozen tables per business against a remote
 * Postgres, and a teardown that times out leaves rows behind for the next run to trip over.
 */
afterAll(async () => {
	await cleanupFixtures();
	await closePool();
}, 120_000);

/**
 * Everything owned and writable. Narrower than this and the PDF route stops asking the module
 * that holds the document, which would make the 404 mean "not owned" rather than "not yours".
 */
const OWNED: AccessMap = { ...NO_ACCESS, quoting: 'write', invoicing: 'write', inventory: 'write' };

/** One of everything a tenant-scoped id route can be pointed at, all really committed. */
type Tenant = {
	user: TestUser;
	business: TestBusiness;
	locals: Partial<App.Locals>;
	quoteId: string;
	invoiceId: string;
	itemId: string;
	countId: string;
};

async function tenant(personName: string, tradingName: string): Promise<Tenant> {
	const user = await createUser(personName);
	const business = await createBusiness(user.id, tradingName);
	const customerId = await createCustomer(business, `${tradingName} client`);

	const { quoteId, invoiceId } = await runScoped(business.id, user.id, async (tx) => {
		const [row] = await tx
			.select()
			.from(businessTable)
			.where(eq(businessTable.businessId, business.id));
		const mapped = toBusiness(row);
		return {
			quoteId: await createQuoteDraft(tx, mapped, { customerId }),
			invoiceId: await createInvoiceDraft(tx, mapped, { customerId })
		};
	});

	const itemId = await runScoped(business.id, user.id, (tx) =>
		createItem(
			tx,
			business.id,
			user.id,
			{
				name: 'Danish oil, 5L',
				sku: null,
				description: null,
				unit: 'each',
				costMicros: 420_000_000,
				sellMicros: null,
				reorderPointE6: 2_000_000,
				// NO LOCATION AND NO OPENING QUANTITY, deliberately. This file asks each route
				// what it says about an id that is not this tenant's, and it needs a committed row
				// per route and nothing more. A location and an opening movement would drag in
				// `resolveLocation` and the levels view, which is machinery this file makes no
				// claim about and would only give it ways to fail for reasons of its own.
				defaultLocationId: null,
				newLocationName: null
			},
			null
		)
	);

	/**
	 * The count header written directly, for the same reason: `prepareCount` builds a whole sheet
	 * from the levels view, and none of that is under test here. This is the shape `createCustomer`
	 * uses in the shared fixtures — a real row, inserted as the tenant, satisfying the same
	 * `tenant_isolation` policy every other write does. There is no privileged path.
	 */
	const countId = randomUUID();
	await runScoped(business.id, user.id, (tx) =>
		tx.insert(stockCount).values({
			id: countId,
			businessId: business.id,
			numberPrefix: 'SC-',
			numberValue: 1,
			numberFormatted: 'SC-0001',
			periodStart: '2026-07-01',
			periodEnd: '2026-07-31',
			status: 'counting',
			startedByUserId: user.id
		})
	);

	return {
		user,
		business,
		locals: await localsFor(user, business, OWNED),
		quoteId,
		invoiceId,
		itemId,
		countId
	};
}

/**
 * The request a route reads, with the two fields the shared fixture does not carry — the route
 * parameter, and a body for the one action under test. Generic in the event type so each route's
 * own `$types` is what checks the call, rather than one intersection that would grow a member
 * per route.
 */
function requestFor<E>(locals: Partial<App.Locals>, pathname: string, id: string): E {
	return {
		...eventFor(locals, pathname),
		params: { id },
		request: new Request(`http://localhost:5173${pathname}`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams()
		})
	} as unknown as E;
}

/**
 * The same, for the one endpoint under test that reads a JSON body rather than a form. The body
 * is a valid, EMPTY patch on purpose: `parseCountPatch` refuses a malformed one with a 422
 * before the route ever looks the count up, and a 422 is not the refusal this file is about.
 */
function jsonRequestFor<E>(locals: Partial<App.Locals>, pathname: string, id: string): E {
	return {
		...eventFor(locals, pathname),
		params: { id },
		request: new Request(`http://localhost:5173${pathname}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ lines: [] })
		})
	} as unknown as E;
}

/**
 * Runs something that must be refused, and hands back what it threw. Takes `unknown` rather
 * than a promise because a SvelteKit `load` is declared `MaybePromise`, and `await` settles the
 * difference for both shapes.
 */
async function refusalFrom(run: () => unknown): Promise<unknown> {
	try {
		await run();
	} catch (caught) {
		return caught;
	}
	throw new Error('expected the route to refuse, but it answered');
}

/**
 * The whole property, in one assertion pair. Both calls must be HTTP errors before either body
 * is looked at, and then they must agree completely — status and body, not merely tone.
 *
 * IT ALSO PINS WHAT THEY AGREED ON, and that half is not decoration. "The two answers match" is
 * satisfied by ANY shared refusal: a route that had lost its entitlement, or one that started
 * refusing everybody, would go on satisfying it forever while proving nothing about tenancy. So
 * the pair has to be the right answer as well as the same answer — a 404, carrying the sentence
 * `notFoundMessage()` owns for the thing that route was asked for.
 */
function assertIndistinguishable(forReal: unknown, forNothing: unknown, thing: string): void {
	expect(isHttpError(forReal)).toBe(true);
	expect(isHttpError(forNothing)).toBe(true);
	if (!isHttpError(forReal) || !isHttpError(forNothing)) return;

	expect(forReal.status).toBe(404);
	expect(forReal.status).toBe(forNothing.status);
	expect(forReal.body.message).toBe(notFoundMessage(thing));
	expect(forReal.body).toEqual(forNothing.body);
	expect(forReal.body.message).not.toMatch(LEAKS);
}

/** The words that would confirm the record exists. Same list `refusals.test.ts` pins. */
const LEAKS = /another|other business|belongs to|not yours|permission|access/i;

let thornhill: Tenant;
let rival: Tenant;

beforeAll(async () => {
	/**
	 * FIRST OF ALL, BEFORE A SINGLE ROW EXISTS: prove the connection cannot bypass the floor.
	 *
	 * Everything in this file is an assertion about Row Level Security. RLS does not apply to a
	 * SUPERUSER, to a role with BYPASSRLS, or to the table owner — so if `DATABASE_URL` points at
	 * one of those, every policy in the system is decorative, `loadQuote` returns the rival's row,
	 * and the file below fails in a way that reads like a product bug when it is a connection
	 * string. Worse, a differently written version of this file would PASS in that state, having
	 * proved nothing.
	 *
	 * `assertDatabaseRoleIsSafe` is the check the server already runs at boot, and it names the
	 * fault and the fix in its message. Running it here is what makes the rest of this file mean
	 * something. It is deliberately a failure and not a skip: a tenancy test that quietly opts out
	 * when it cannot be proved is exactly the guard a later tidy-up deletes with a green suite.
	 */
	await assertDatabaseRoleIsSafe();

	thornhill = await tenant('Alice Thornhill', 'Thornhill Joinery');
	rival = await tenant('Bongani Ndlovu', 'Meridian Fitouts');
}, 120_000);

describe('the fixture itself', () => {
	/**
	 * FIRST, AND FOR A REASON. Everything below asserts that a route cannot see the rival's
	 * records. If the rival's records did not exist, or were unreadable even to their owner,
	 * every one of those assertions would pass while proving nothing at all.
	 */
	it('shows the rival its own quote, invoice, item and count', async () => {
		expect(
			await loadQuotePage(requestFor(rival.locals, `/quoting/${rival.quoteId}`, rival.quoteId))
		).toBeTruthy();

		expect(
			await loadInvoicePage(
				requestFor(rival.locals, `/invoicing/${rival.invoiceId}`, rival.invoiceId)
			)
		).toBeTruthy();

		expect(
			await loadItemPage(requestFor(rival.locals, `/inventory/${rival.itemId}`, rival.itemId))
		).toBeTruthy();

		expect(
			await loadCountPage(
				requestFor(rival.locals, `/inventory/counts/${rival.countId}`, rival.countId)
			)
		).toBeTruthy();
	}, 30_000);

	/**
	 * THE PDF ROUTE NEEDS ITS OWN CONTROL, and it needs it more than the four loads above do.
	 *
	 * Its refusal is reached through a loop that SKIPS any module whose access is `none`, so a
	 * route that had stopped answering ANYBODY — a narrowed `OWNED`, an edited resolver list, a
	 * renderer that threw — would go on satisfying "both answers match" forever, on the one route
	 * in this file whose success path returns another business's priced document on their own
	 * letterhead. Two identical 404s prove tenancy only once somebody has shown that a 200 was
	 * ever possible.
	 *
	 * Both ids, because a quote and an invoice take different paths through that resolver loop.
	 */
	it('renders the rival its own quote and invoice as PDF bytes', async () => {
		for (const id of [rival.quoteId, rival.invoiceId]) {
			const response = await getDocumentPdf(requestFor(rival.locals, `/documents/${id}/pdf`, id));
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toBe('application/pdf');
		}
	}, 120_000);

	/**
	 * And the same for the two routes whose refusals are asserted furthest down. The count
	 * sheet's autosave endpoint answers with JSON rather than a page, and the workings page
	 * folds a SECOND cause — an archived invoice — into the same 404, so "it refused" is not on
	 * its own evidence that the tenancy branch is the one that fired.
	 */
	it('saves the rival its own count sheet, and shows it its own workings', async () => {
		const saved = await saveCountSheet(
			jsonRequestFor(rival.locals, `/inventory/counts/${rival.countId}/save`, rival.countId)
		);
		expect(saved.status).toBe(200);

		expect(
			await loadWorkingsPage(
				requestFor(rival.locals, `/invoicing/${rival.invoiceId}/workings`, rival.invoiceId)
			)
		).toBeTruthy();
	}, 60_000);
});

describe('a tenant-scoped id that is not this tenant’s', () => {
	it('answers a quote id identically whether it is a rival’s or nobody’s', async () => {
		const nothing = randomUUID();
		assertIndistinguishable(
			await refusalFrom(() =>
				loadQuotePage(requestFor(thornhill.locals, `/quoting/${rival.quoteId}`, rival.quoteId))
			),
			await refusalFrom(() =>
				loadQuotePage(requestFor(thornhill.locals, `/quoting/${nothing}`, nothing))
			),
			'quote'
		);
	}, 30_000);

	it('answers an invoice id identically whether it is a rival’s or nobody’s', async () => {
		const nothing = randomUUID();
		assertIndistinguishable(
			await refusalFrom(() =>
				loadInvoicePage(
					requestFor(thornhill.locals, `/invoicing/${rival.invoiceId}`, rival.invoiceId)
				)
			),
			await refusalFrom(() =>
				loadInvoicePage(requestFor(thornhill.locals, `/invoicing/${nothing}`, nothing))
			),
			'invoice'
		);
	}, 30_000);

	it('answers an item id identically whether it is a rival’s or nobody’s', async () => {
		const nothing = randomUUID();
		assertIndistinguishable(
			await refusalFrom(() =>
				loadItemPage(requestFor(thornhill.locals, `/inventory/${rival.itemId}`, rival.itemId))
			),
			await refusalFrom(() =>
				loadItemPage(requestFor(thornhill.locals, `/inventory/${nothing}`, nothing))
			),
			'item'
		);
	}, 30_000);

	it('answers a stock count id identically whether it is a rival’s or nobody’s', async () => {
		const nothing = randomUUID();
		assertIndistinguishable(
			await refusalFrom(() =>
				loadCountPage(
					requestFor(thornhill.locals, `/inventory/counts/${rival.countId}`, rival.countId)
				)
			),
			await refusalFrom(() =>
				loadCountPage(requestFor(thornhill.locals, `/inventory/counts/${nothing}`, nothing))
			),
			'stock count'
		);
	}, 30_000);
});

/**
 * THE ROUTE WHERE IT MATTERS MOST, and the one with no test of any kind before this file. Its
 * success path returns rendered document bytes — somebody else's quote, priced, on somebody
 * else's letterhead — and its isolation is PURE RLS: both resolvers load by id alone, and the
 * `businessId` they are handed is used only to fetch the ISSUER's own row.
 *
 * Twice, because it resolves two modules in order and a quote id and an invoice id take
 * different paths through that loop.
 */
describe('the shared document PDF route', () => {
	it('answers a rival’s real quote id exactly as it answers nobody’s', async () => {
		const nothing = randomUUID();
		assertIndistinguishable(
			await refusalFrom(() =>
				getDocumentPdf(
					requestFor(thornhill.locals, `/documents/${rival.quoteId}/pdf`, rival.quoteId)
				)
			),
			await refusalFrom(() =>
				getDocumentPdf(requestFor(thornhill.locals, `/documents/${nothing}/pdf`, nothing))
			),
			'document'
		);
	}, 30_000);

	it('answers a rival’s real invoice id exactly as it answers nobody’s', async () => {
		const nothing = randomUUID();
		assertIndistinguishable(
			await refusalFrom(() =>
				getDocumentPdf(
					requestFor(thornhill.locals, `/documents/${rival.invoiceId}/pdf`, rival.invoiceId)
				)
			),
			await refusalFrom(() =>
				getDocumentPdf(requestFor(thornhill.locals, `/documents/${nothing}/pdf`, nothing))
			),
			'document'
		);
	}, 30_000);
});

/**
 * THE TWO ROUTES THAT ARE NOT PAGE LOADS AND NOT THE PDF.
 *
 * They inherit the property by construction — the same helper, after the same RLS-filtered load
 * — but "by construction" is what every one of the seven refusals in this file was before it was
 * asserted, and these two are the ones a later edit is most likely to reach for. The count
 * sheet's autosave endpoint is the only tenant-scoped refusal in the product that is READ BY A
 * MACHINE rather than rendered: the sheet parses its JSON body, so a route that started saying
 * something else there would drift without a screen to show it.
 *
 * The workings page is the more interesting of the two, because it folds a SECOND cause into the
 * same refusal: `!header || header.archivedAt !== null`. A tenant's own archived invoice and
 * another tenant's live one have to be one answer as well, and that is only true while both go
 * through `notFound('invoice')`.
 */
describe('the count sheet endpoint and the workings page', () => {
	it('refuses a save to a count sheet that is not this tenant’s, identically', async () => {
		const nothing = randomUUID();
		assertIndistinguishable(
			await refusalFrom(() =>
				saveCountSheet(
					jsonRequestFor(thornhill.locals, `/inventory/counts/${rival.countId}/save`, rival.countId)
				)
			),
			await refusalFrom(() =>
				saveCountSheet(
					jsonRequestFor(thornhill.locals, `/inventory/counts/${nothing}/save`, nothing)
				)
			),
			'stock count'
		);
	}, 30_000);

	it('refuses the workings of an invoice that is not this tenant’s, identically', async () => {
		const nothing = randomUUID();
		assertIndistinguishable(
			await refusalFrom(() =>
				loadWorkingsPage(
					requestFor(thornhill.locals, `/invoicing/${rival.invoiceId}/workings`, rival.invoiceId)
				)
			),
			await refusalFrom(() =>
				loadWorkingsPage(requestFor(thornhill.locals, `/invoicing/${nothing}/workings`, nothing))
			),
			'invoice'
		);
	}, 30_000);
});

/**
 * The POST case. `makeInvoice` cannot use `error(404)` — a thrown error inside its try would be
 * swallowed by its own catch and re-reported as a 500 — so it says the same sentence through
 * `notFoundMessage()` and `fail(422)` instead. Two forms of one sentence is exactly the shape
 * that drifts, which is why it gets its own assertion.
 */
describe('raising an invoice from a quote that is not this tenant’s', () => {
	it('fails identically for a rival’s real quote and for nobody’s', async () => {
		const nothing = randomUUID();

		const forReal = await quoteActions.makeInvoice(
			requestFor(thornhill.locals, `/quoting/${rival.quoteId}`, rival.quoteId)
		);
		const forNothing = await quoteActions.makeInvoice(
			requestFor(thornhill.locals, `/quoting/${nothing}`, nothing)
		);

		// Asserted before anything is compared, for the same reason `isHttpError` is above: a
		// redirect out of this action returns nothing at all, and two nothings are equal.
		expect(isActionFailure(forReal)).toBe(true);
		expect(isActionFailure(forNothing)).toBe(true);
		if (!isActionFailure(forReal) || !isActionFailure(forNothing)) return;

		expect(forReal.status).toBe(422);
		expect(forReal.status).toBe(forNothing.status);
		expect(forReal.data).toEqual(forNothing.data);

		// Pinned to the exact sentence for the same reason `assertIndistinguishable` is: two
		// failures that merely AGREE could agree on anything, and the whole point of this call
		// site is that a `fail(422)` and an `error(404)` say the one sentence between them.
		const said = (forReal.data as unknown as { message: string }).message;
		expect(said).toBe(notFoundMessage('quote'));
		expect(said).not.toMatch(LEAKS);
	}, 30_000);
});
