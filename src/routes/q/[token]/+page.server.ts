/**
 * THE PUBLIC QUOTE PAGE.
 *
 * The one surface in this product a person without an account ever reaches. Outside `(app)`
 * entirely: no shell, no sidebar, no session, no tenant cookie. A client opens a link from an
 * email and sees one document.
 *
 * **AWAITING A DESIGN PASS.** The design shows the OUTCOME of acceptance — "Quote QT-1041 was
 * accepted by Waterkant Property Group" — and never the client's screen. So this is built from
 * the foundations, kept to the document plus two actions, and says so on the page. Same
 * treatment as the T06 stubs.
 *
 * THE SECURITY IS THE WORK HERE
 * -----------------------------
 *   TOKEN     256 bits of `randomBytes`, stored only as a SHA-256 hash. See `send.ts`.
 *   REACH     `readShared` sets `cjs.share_token` and nothing else, and the four
 *             `document_share` policies admit one quote, its lines, its customer and its
 *             business. Everything else returns zero rows — a property of the schema rather
 *             than of this file. See `0006_quote_sharing.sql`.
 *   RATE      A token bucket per caller, per action. Reading is generous; answering is not.
 *   EXPIRY    Derived from the quote's own valid-until, checked on the page AND in the action.
 *   ENUMERATION  A bad token and an archived quote produce the same 404 as a well-formed one
 *             that does not exist, with no timing branch worth measuring.
 */
import { error, fail } from '@sveltejs/kit';
import { RateLimiter, callerKey } from '$lib/server/core/ratelimit';
import { answerSharedQuote, openSharedQuote } from '$lib/server/modules/quoting/accept';
import type { Actions, PageServerLoad } from './$types';

/**
 * Two budgets, because the two things are not alike.
 *
 * A client may legitimately open their quote a dozen times — from the email, from their phone,
 * to show a colleague. Accepting one is something that happens once, so a caller trying it
 * repeatedly is either confused or probing, and neither needs to be fast.
 */
const READS = new RateLimiter({ burst: 30, perMinute: 30 });
const ANSWERS = new RateLimiter({ burst: 5, perMinute: 5 });

/** The same refusal for every reason a token does not open a document. */
function noSuchQuote(): never {
	error(404, {
		code: 'no_such_quote',
		message:
			"This link doesn't open a quote. It may have been withdrawn, or the address may have " +
			'been copied incompletely — the person who sent it can send you a new one.'
	});
}

export const load: PageServerLoad = async (event) => {
	const limit = READS.take(callerKey(event.request));
	if (!limit.allowed) {
		error(429, {
			code: 'too_many_requests',
			message: `That's a lot of requests at once. Try again in ${limit.retryAfterSeconds} seconds.`
		});
	}

	const shared = await openSharedQuote(event.params.token);
	if (!shared) noSuchQuote();

	// Everything below is already on the PDF in this person's inbox, which is the test for
	// whether a page with no sign-in may show it.
	return {
		document: shared.document,
		status: shared.status,
		canAnswer: shared.canAnswer,
		acceptedByName: shared.acceptedByName,
		tradingName: shared.tradingName
	};
};

export const actions: Actions = {
	accept: async (event) => answer(event, 'accepted'),
	decline: async (event) => answer(event, 'declined')
};

async function answer(event: Parameters<Actions['accept']>[0], outcome: 'accepted' | 'declined') {
	const limit = ANSWERS.take(callerKey(event.request));
	if (!limit.allowed) {
		return fail(429, {
			message: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.`
		});
	}

	const form = await event.request.formData();
	const name = String(form.get('name') ?? '')
		.trim()
		.slice(0, 200);
	const reason = String(form.get('reason') ?? '')
		.trim()
		.slice(0, 500);

	if (outcome === 'accepted' && name === '') {
		return fail(422, { message: 'Please add your name, so they know who accepted it.' });
	}

	const result = await answerSharedQuote(event.params.token, outcome, {
		name: name || null,
		reason: reason || null
	});

	if (!result.ok) return fail(409, { message: result.message });
	return { answered: outcome };
}
