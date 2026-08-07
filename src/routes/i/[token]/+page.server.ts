/**
 * THE PUBLIC INVOICE PAGE.
 *
 * The second of the two surfaces in this product a person without an account ever reaches, and
 * the reason T21's timeline can say "Opened by Baraka Café · Twice · last 26 Jul, 08:41" — a PDF
 * attachment cannot report that it was read, so the invoice is emailed as a link as well.
 *
 * Outside `(app)` entirely: no shell, no sidebar, no session, no tenant cookie. A client opens a
 * link from an email and sees one document and how to pay it.
 *
 * **AWAITING A DESIGN PASS.** The design draws the business's screens and never the client's, so
 * this is built from the foundations, kept to the document plus what is owed, and says so on the
 * page. The same treatment `/q/[token]` and the T06 stubs get.
 *
 * WHAT IS DIFFERENT FROM THE QUOTE PAGE
 * -------------------------------------
 * There is nothing to answer. An invoice is not an offer — the client cannot accept or decline
 * it, so the page has no actions at all, which also means no write path and nothing to rate-limit
 * beyond reading. What it adds instead is the one fact a person following this link actually
 * wants: what is still owed, and where to pay it.
 *
 * THE SECURITY IS THE SAME WORK
 * -----------------------------
 *   TOKEN     256 bits of `randomBytes`, stored only as a SHA-256 hash. See `send.ts`.
 *   REACH     `readShared` sets `cjs.share_token` and nothing else; the policies in
 *             `0007_invoicing.sql` admit one invoice, its lines, its customer, its business and
 *             that business's banking details. `invoicing_payment` and `core_posting` have NO
 *             share policy, so what the business was paid by other clients and what the job cost
 *             them are unreachable from here.
 *   ENUMERATION  A bad token, an archived invoice and a well-formed token that opens nothing all
 *             produce the same 404.
 */
import { error } from '@sveltejs/kit';
import { RateLimiter, callerKey } from '$lib/server/core/ratelimit';
import { openSharedInvoice } from '$lib/server/modules/invoicing/shared';
import type { PageServerLoad } from './$types';

/**
 * Generous, because a client may legitimately open their invoice a dozen times — from the email,
 * from their phone, to give the reference to their bookkeeper. The limit exists to stop somebody
 * making token-guessing CHEAP, not because guessing could otherwise succeed.
 */
const READS = new RateLimiter({ burst: 30, perMinute: 30 });

export const load: PageServerLoad = async (event) => {
	const limit = READS.take(callerKey(event.request));
	if (!limit.allowed) {
		error(429, {
			code: 'too_many_requests',
			message: `That's a lot of requests at once. Try again in ${limit.retryAfterSeconds} seconds.`
		});
	}

	const shared = await openSharedInvoice(event.params.token);

	if (!shared) {
		error(404, {
			code: 'no_such_invoice',
			message:
				"This link doesn't open an invoice. It may have been withdrawn, or the address may " +
				'have been copied incompletely — the person who sent it can send you a new one.'
		});
	}

	// Everything below is already on the PDF in this person's inbox, which is the test for whether
	// a page with no sign-in may show it.
	return {
		document: shared.document,
		status: shared.status,
		outstanding: shared.outstanding,
		tradingName: shared.tradingName
	};
};
