/**
 * REFUSALS. The vocabulary of every "no" this product says, and the one sentence it says when
 * something is not there.
 *
 * `App.Error` (src/app.d.ts) has always carried a `code` beside its `message`, and nineteen
 * `error()` throws across the routes and the server core fill it in. Until now that code was a
 * bare `string`, which meant the set of things the product can refuse was discoverable only by
 * grep, and nothing could dispatch on it without guessing. This file closes the set, so the
 * error page can decide how a refusal LOOKS from what the refusal IS, and so a code invented in
 * a route without a rendering decision behind it fails `bun run check` rather than rendering as
 * whatever the default happened to be.
 *
 * Pure, with no dependency beyond the ambient `App` namespace, for the same reason
 * `$lib/components/shell/nav.ts` and `$lib/core/inventory/filter.ts` are pure: the whole tone
 * dispatch is then testable in the `unit` project without mounting a component or opening a
 * database.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE TWO CONSUMERS, WHICH ARE NOT THE SAME CONSUMER
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The union serves two audiences and it is worth knowing which code belongs to which, because
 * a reader who assumes "every code renders on an error page" will be wrong about eight of them.
 *
 * Eight are thrown from `+server.ts` ENDPOINTS — `invalid_quote`, `quote_sent`,
 * `invalid_invoice`, `invoice_issued`, `invalid_count`, `count_applied`, `count_not_counting`
 * and `invalid_promotion`. SvelteKit returns those as JSON; the autosave engines and the invoice
 * editor read `body.message` out of the response and render it as a `Refusal` banner beside the
 * work it failed to save. They never reach a `+error.svelte` at all.
 *
 * The rest are page-load and action refusals, and those are the ones the two `+error.svelte`
 * files render — which is why `toneOf` below has to answer for both halves.
 */

/**
 * Every code the product throws. Closed on purpose: `+error.svelte` dispatches tone on it, and
 * an open `string` would let the dispatch and the throw sites drift with nobody finding out.
 *
 * `not_found` and `unexpected` are minted here. `not_found` replaces the four hand-written
 * not-found blocks the detail routes carried (one of which, the document PDF route, had its own
 * bespoke `no_such_document` — folded in here, because nothing consumed it and a private code
 * for the one route with the highest-consequence success path is exactly the drift this file
 * exists to end). `unexpected` is what `handleError` returns for a throw nobody anticipated; it
 * is deliberately NOT `no_request_context`, which names one specific `ctx.ts` invariant and
 * would make the logs unreadable if it also meant "anything at all".
 */
export type RefusalCode =
	// Entitlement and permission — a calm no, from `refuse()` and `requireBillingAdmin`.
	| 'module_locked'
	| 'module_removed'
	| 'not_billing_admin'
	| 'module_already_added'
	| 'module_not_added'
	| 'module_not_for_sale'
	// Nothing there, or nothing you can be shown.
	| 'not_found'
	| 'no_such_quote'
	| 'no_such_invoice'
	| 'too_many_requests'
	// The page and the payload disagree — read by `fetch`, rendered as a banner.
	| 'invalid_quote'
	| 'invalid_invoice'
	| 'invalid_count'
	| 'invalid_promotion'
	| 'quote_sent'
	| 'invoice_issued'
	| 'count_applied'
	| 'count_not_counting'
	// Ours, and ours alone.
	| 'no_request_context'
	| 'unexpected';

/**
 * The not-found sentence, as a plain string.
 *
 * It exists separately from `notFound()` because one call site cannot use an `App.Error` at
 * all: the `makeInvoice` action in `src/routes/(app)/quoting/[id]/+page.server.ts` throws a
 * `CannotSendQuote` rather than calling `error(404)`, for the reason its own comment gives —
 * a thrown redirect or error inside that try would be swallowed by the catch below it and
 * re-reported as a 500. It surfaces the sentence through `fail(422, { message })` instead. So
 * that site consumes the string, this file owns the string, and the two cannot drift.
 */
export function notFoundMessage(thing: string): string {
	return `We couldn't find that ${thing}.`;
}

/**
 * THE TENANCY BOUNDARY, WRITTEN ONCE.
 *
 * Row Level Security has already made "another business's quote" and "no such quote" the same
 * answer, and that is exactly what they should be to somebody guessing at URLs. It is not a
 * copy preference and it is not politeness. `loadQuote` in
 * `src/lib/server/modules/quoting/queries.ts` carries NO `business_id` predicate — it is
 * `where(eq(quote.id, quoteId))` and nothing else — and returns null in both cases, because the
 * `tenant_isolation` policy filtered the row out before the query ever saw it. There is no
 * second query that could tell the two apart without deliberately reaching around RLS, and
 * nothing in this product should ever want to.
 *
 * This function is the one place the sentence is written, so that no route can accidentally
 * write a second one that differs by a word and, in differing, confirms that the record exists.
 * The sentence names no id, no owner, and no reason. `src/routes/(app)/not-found.test.ts` proves
 * the property the only way it can be proved: a rival tenant's REAL committed record and a
 * random UUID must produce a byte-identical refusal, across every tenant-scoped id route.
 *
 * DELIBERATELY NOT FOLDED IN HERE: the token routes. `/q/[token]` and `/i/[token]` keep their
 * own, longer sentences — "This link doesn't open a quote. It may have been withdrawn, or the
 * address may have been copied incompletely — the person who sent it can send you a new one."
 * Those are addressed to a CLIENT WITH NO ACCOUNT reading a link out of an email, not to an
 * account holder guessing at a URL. Different audience, different actionable next step,
 * deliberately different copy. An implementer who unifies them has made the copy worse.
 */
export function notFound(thing: string): App.Error {
	return {
		code: 'not_found',
		message: notFoundMessage(thing),
		nextHref: '/',
		nextLabel: 'Back to your dashboard'
	};
}

/**
 * How a refusal should LOOK, decided from what it IS.
 *
 * `'calm'` is the answer for everything that is a boundary rather than a breakage: you have not
 * added this module, you removed it, you are not the owner, it is not there, you have asked too
 * often. None of those is a failure of the product and none of them should be drawn in the
 * colour reserved for one. NOT ENTITLED IS NOT AN ERROR — the panel that renders it is named
 * `ErrorState` for where it mounts, never for what it says.
 *
 * `'wrong'` is for the ones where something genuinely did not work: every 5xx, and the 4xx codes
 * that mean the screen and the server disagree about what is on it — a payload that would not
 * validate, a quote that was sent while it was being edited, a count that has already been
 * applied. Those are worth a tint, because the person's next move depends on noticing them.
 *
 * The decision lives here rather than at the call site so that "a locked module renders calm"
 * is an assertion in `refusals.test.ts` and not a habit that the next screen can forget.
 */
export function toneOf(status: number, code?: RefusalCode): 'calm' | 'wrong' {
	switch (code) {
		case 'module_locked':
		case 'module_removed':
		case 'not_billing_admin':
		case 'not_found':
		case 'no_such_quote':
		case 'no_such_invoice':
		case 'too_many_requests':
			return 'calm';

		case 'module_already_added':
		case 'module_not_added':
		case 'module_not_for_sale':
		case 'invalid_quote':
		case 'invalid_invoice':
		case 'invalid_count':
		case 'invalid_promotion':
		case 'quote_sent':
		case 'invoice_issued':
		case 'count_applied':
		case 'count_not_counting':
		case 'no_request_context':
		case 'unexpected':
			return 'wrong';

		// No code at all: six `error(4xx, { message })` calls predate the vocabulary, and a
		// 404 from the router itself never had one. Status is the only evidence left, and a
		// 4xx without a code has always been one of the calm ones in practice.
		default:
			return status >= 500 ? 'wrong' : 'calm';
	}
}
