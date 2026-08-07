/**
 * SENDING A QUOTE.
 *
 * The moment a document stops being the business's and becomes the client's. Five things
 * happen and they happen together or not at all:
 *
 *   1. the number is allocated — `QT-1043`, from the shared counter, gapless and unique;
 *   2. the totals are frozen — what `priceDocument` produced at this instant, on the row;
 *   3. a share token is minted — how a person with no account reaches this one document;
 *   4. the status becomes `sent`, with an event;
 *   5. the email goes, with the PDF attached and the link in the body.
 *
 * AND THE ORDER OF THE LAST TWO IS THE WHOLE TICKET.
 *
 *   > A quote that could not be sent must not show as sent.
 *
 * So the mail is sent INSIDE the transaction, before it commits. `mail.ts` already refuses in
 * production when SMTP is unconfigured rather than dropping a message quietly, and a refusal
 * here rolls back the number, the snapshot, the token and the status. The business sees a
 * failure and a draft, which is the truth.
 *
 * The cost is a transaction held open across a network call to an SMTP server, and it is worth
 * paying. The alternative — commit, then send — has a failure mode where a client is told
 * their quote is on its way and it is not, and there is no way to tell afterwards which quotes
 * those were.
 */
import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { formatZar } from '$lib/core/money';
import { issuerFrom, priceQuote, quoteDocument, todayIn } from '$lib/core/quoting';
import { allocateDocumentNumber } from '$lib/server/core/db/numbering';
import { business as businessTable } from '$lib/server/core/db/schema/core';
import { quote } from '$lib/server/core/db/schema/quoting';
import type { Tx } from '$lib/server/core/db/tx';
import { sendMail } from '$lib/server/core/mail';
import { pdfFilename, renderDocumentPdf } from '$lib/server/core/pdf';
import { recordEvent } from './events';
import { loadQuote, loadSettings } from './queries';

/**
 * THE TOKEN.
 *
 * 32 bytes of `randomBytes` — the platform CSPRNG, not `Math.random`, which is seeded, shared
 * and predictable from a handful of outputs. Base64url, so it survives a URL, an email client's
 * link rewriter and a copy-paste without escaping.
 *
 * 256 bits is not "long enough to be inconvenient to guess". At a billion attempts a second it
 * is longer than the age of the universe by a factor with fifty digits in front of it. The rate
 * limit on the public page exists to stop somebody making the attempt CHEAP, not because the
 * attempt could otherwise succeed.
 *
 * Only the HASH is stored. See `schema/quoting.ts` for why there is no salt.
 */
export function mintShareToken(): { token: string; hash: string } {
	const token = randomBytes(32).toString('base64url');
	return { token, hash: hashShareToken(token) };
}

export function hashShareToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export class CannotSendQuote extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CannotSendQuote';
	}
}

export type SendResult = {
	readonly number: string;
	readonly token: string;
	readonly sentTo: string;
};

/**
 * Send it.
 *
 * Everything is read, computed, written and mailed inside the caller's transaction. `origin`
 * comes from the request rather than from configuration, so a link in a development email
 * points at the development server and a link in production points at production — without a
 * second environment variable that can disagree with the one the request arrived on.
 */
export async function sendQuote(
	tx: Tx,
	businessId: string,
	userId: string,
	quoteId: string,
	origin: string,
	now: Date = new Date()
): Promise<SendResult> {
	const draft = await loadQuote(tx, quoteId);
	if (!draft) throw new CannotSendQuote("We couldn't find that quote.");

	if (draft.status !== 'draft') {
		throw new CannotSendQuote(
			'That quote has already been sent. Make a copy if you need to send a new version.'
		);
	}

	// The checks the editor also makes, made again here. The editor's version is there so the
	// button can say what is missing; this one is there because a form is a suggestion and a
	// server is where a rule lives.
	const to = draft.sendTo.email;
	if (!to) throw new CannotSendQuote('Add an email address to send this quote to.');
	if (!draft.customer.customerId) throw new CannotSendQuote('Choose the client this quote is for.');
	if (draft.lines.length === 0) throw new CannotSendQuote('Add at least one line before sending.');

	const [businessRow] = await tx
		.select()
		.from(businessTable)
		.where(eq(businessTable.businessId, businessId));

	const settings = await loadSettings(tx);
	const price = priceQuote(draft);

	// 1. The number. Inside this transaction, so a rollback takes it back — which leaves a gap
	// rather than reusing a number a client may already have seen. See `numbering.ts`.
	const number = await allocateDocumentNumber(tx, 'quote');

	// 3. The token.
	const { token, hash } = mintShareToken();

	// 2 + 4. The snapshot and the status, in one write. `snapshot_reconciles` in the database
	// refuses a subtotal and a VAT figure that do not sum to the total — the one arithmetic
	// claim a client can check with a calculator.
	await tx
		.update(quote)
		.set({
			status: 'sent',
			numberPrefix: number.prefix,
			numberValue: number.value,
			numberFormatted: number.formatted,
			snapshotSubtotalCents: price.subtotal.cents,
			snapshotTaxCents: price.tax.cents,
			snapshotTotalCents: price.total.cents,
			snapshotAt: now,
			sentAt: now,
			shareTokenHash: hash,
			shareTokenIssuedAt: now
		})
		.where(eq(quote.id, quoteId));

	await recordEvent(tx, businessId, quoteId, {
		kind: 'sent',
		actor: 'business',
		actorUserId: userId,
		detail: to,
		occurredAt: now
	});

	// 5. The mail. Last, and still inside the transaction — a throw here rolls all four of the
	// writes above back, and the quote is a draft again.
	const document = quoteDocument({
		quote: { ...draft, number: number.formatted, status: 'sent', sentAt: now },
		price,
		issuer: issuerFrom(businessRow),
		footer: settings.footerTerms ?? undefined
	});

	const link = `${origin}/q/${token}`;
	const pdf = await renderDocumentPdf(document);

	await sendMail({
		to,
		subject: `${businessRow.tradingName} — quote ${number.formatted}`,
		text: plainTextBody({
			tradingName: businessRow.tradingName,
			contactName: draft.sendTo.name,
			number: number.formatted,
			total: formatZar(price.total),
			validUntil: draft.validUntil,
			today: todayIn(now),
			link
		}),
		attachments: [{ filename: pdfFilename(document), content: pdf, contentType: 'application/pdf' }]
	});

	return { number: number.formatted, token, sentTo: to };
}

/**
 * The email, in plain text.
 *
 * Text only, deliberately. An HTML email from a small joinery is more likely to land in spam,
 * renders differently in every client, and adds nothing here: the document is ATTACHED as a
 * PDF and linked as a page. The body's whole job is to say who it is from, what it is, what it
 * comes to, and where to answer.
 *
 * Written for the client — a person who did not ask for an account and will not make one.
 */
function plainTextBody(input: {
	tradingName: string;
	contactName: string | null;
	number: string;
	total: string;
	validUntil: string | null;
	today: string;
	link: string;
}): string {
	const greeting = input.contactName ? `Hi ${input.contactName},` : 'Hello,';

	return [
		greeting,
		'',
		`Here is quote ${input.number} from ${input.tradingName}, for ${input.total}.`,
		'',
		'You can read it and accept or decline it here:',
		input.link,
		'',
		input.validUntil ? `It is valid until ${input.validUntil}.` : '',
		'The quote is attached as a PDF as well, so you have your own copy either way.',
		'',
		`Thank you,`,
		input.tradingName
	]
		.filter((line) => line !== '')
		.join('\n');
}
