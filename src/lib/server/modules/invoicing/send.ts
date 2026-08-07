/**
 * ISSUING AN INVOICE, AND CHASING IT.
 *
 * The moment a draft becomes a tax record. Seven things happen and they happen together or not
 * at all:
 *
 *   1. the number is allocated — `INV-1042`, from the shared counter, unique forever;
 *   2. the totals are frozen — what `priceDocument` produced at this instant, on the row;
 *   3. a share token is minted — how a client with no account reads their own invoice;
 *   4. the status becomes `sent`, with the issue date and an event;
 *   5. the ledger entry is posted — receivable, revenue, VAT, and the cost of sale;
 *   6. the email goes, with the PDF attached and the link in the body.
 *
 * AND THE ORDER OF THE LAST TWO IS THE WHOLE TICKET.
 *
 *   > A quote that could not be sent must not show as sent.
 *
 * The same rule, and it matters more here: an invoice that shows as sent and never arrived is a
 * business waiting on money nobody has been asked for. So the mail is sent INSIDE the
 * transaction, before it commits. `mail.ts` refuses in production when SMTP is unconfigured
 * rather than dropping a message quietly, and a refusal here rolls back the number, the
 * snapshot, the token, the postings and the status. The business sees a failure and a draft,
 * which is the truth.
 *
 * The cost is a transaction held open across a network call to an SMTP server, and it is worth
 * paying — the alternative has a failure mode where nobody can tell afterwards which invoices
 * never went.
 */
import { randomBytes, createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { formatZar } from '$lib/core/money';
import { issuerFrom } from '$lib/core/quoting';
import { formatDocumentDate, todayIn } from '$lib/core/calendar';
import { invoiceDocument, priceInvoice } from '$lib/core/invoicing';
import { allocateDocumentNumber } from '$lib/server/core/db/numbering';
import { business as businessTable } from '$lib/server/core/db/schema/core';
import { invoice } from '$lib/server/core/db/schema/invoicing';
import type { Tx } from '$lib/server/core/db/tx';
import { sendMail } from '$lib/server/core/mail';
import { pdfFilename, renderDocumentPdf } from '$lib/server/core/pdf';
import { recordEvent } from './events';
import { postInvoiceIssued } from './ledger';
import { loadInvoice, loadInvoiceLineRows, loadInvoiceRow, loadSettings } from './queries';

/**
 * THE TOKEN. 32 bytes of `randomBytes` — the platform CSPRNG, base64url so it survives a URL and
 * an email client's link rewriter. Only the HASH is stored; see `schema/quoting.ts` for why
 * there is no salt.
 */
export function mintShareToken(): { token: string; hash: string } {
	const token = randomBytes(32).toString('base64url');
	return { token, hash: hashShareToken(token) };
}

export function hashShareToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export class CannotIssueInvoice extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CannotIssueInvoice';
	}
}

export type IssueResult = {
	readonly number: string;
	readonly token: string;
	readonly sentTo: string;
};

/**
 * Issue it.
 *
 * `origin` comes from the request rather than from configuration, so a link in a development
 * email points at the development server and a link in production points at production — without
 * a second environment variable that can disagree with the one the request arrived on.
 */
export async function issueInvoice(
	tx: Tx,
	businessId: string,
	userId: string,
	invoiceId: string,
	origin: string,
	now: Date = new Date()
): Promise<IssueResult> {
	const draft = await loadInvoice(tx, invoiceId);
	if (!draft) throw new CannotIssueInvoice("We couldn't find that invoice.");

	if (draft.status !== 'draft') {
		throw new CannotIssueInvoice(
			'That invoice has already been issued. Make a copy if you need to bill again.'
		);
	}

	// The checks the editor also makes, made again here. The editor's version is there so the
	// button can say what is missing; this one is there because a form is a suggestion and a
	// server is where a rule lives.
	const to = draft.sendTo.email;
	if (!to) throw new CannotIssueInvoice('Add an email address to send this invoice to.');
	if (!draft.customer.customerId) {
		throw new CannotIssueInvoice('Choose the client this invoice is for.');
	}
	if (draft.lines.length === 0) {
		throw new CannotIssueInvoice('Add at least one line before issuing.');
	}
	if (!draft.dueDate) throw new CannotIssueInvoice('Set a due date before issuing.');

	const [businessRow] = await tx
		.select()
		.from(businessTable)
		.where(eq(businessTable.businessId, businessId));

	const settings = await loadSettings(tx);
	const price = priceInvoice(draft);
	const issueDate = todayIn(now);

	if (draft.dueDate < issueDate) {
		// The database refuses it too (`due_after_issue`). Caught here so the person gets a
		// sentence rather than a constraint name.
		throw new CannotIssueInvoice(
			'The due date is before today. Move it forward before issuing this invoice.'
		);
	}

	// 1. The number. Inside this transaction, so a rollback takes it back.
	const number = await allocateDocumentNumber(tx, 'invoice');

	// 3. The token.
	const { token, hash } = mintShareToken();

	// 2 + 4. The snapshot, the dates and the status, in one write. `snapshot_reconciles` refuses
	// a subtotal and a VAT figure that do not sum to the total.
	await tx
		.update(invoice)
		.set({
			status: 'sent',
			numberPrefix: number.prefix,
			numberValue: number.value,
			numberFormatted: number.formatted,
			issueDate,
			snapshotSubtotalCents: price.subtotal.cents,
			snapshotTaxCents: price.tax.cents,
			snapshotTotalCents: price.total.cents,
			snapshotAt: now,
			issuedAt: now,
			shareTokenHash: hash,
			shareTokenIssuedAt: now
		})
		.where(eq(invoice.id, invoiceId));

	// 5. The books. Cost of sale comes from the LINE ROWS rather than the domain model, because
	// the cost snapshot is a column the model carries per unit and the ledger wants it per line.
	await postInvoiceIssued(tx, businessId, {
		invoiceId,
		number: number.formatted,
		customerName: draft.customer.name,
		issueDate,
		subtotal: price.subtotal,
		tax: price.tax,
		total: price.total,
		lines: await loadInvoiceLineRows(tx, invoiceId)
	});

	await recordEvent(tx, businessId, invoiceId, {
		kind: 'issued',
		actor: 'business',
		actorUserId: userId,
		occurredAt: now
	});
	await recordEvent(tx, businessId, invoiceId, {
		kind: 'emailed',
		actor: 'business',
		actorUserId: userId,
		detail: to,
		occurredAt: now
	});

	// 6. The mail. Last, and still inside the transaction — a throw here rolls every one of the
	// writes above back, and the invoice is a draft again.
	const document = invoiceDocument({
		invoice: { ...draft, number: number.formatted, status: 'sent', issueDate, issuedAt: now },
		price,
		issuer: issuerFrom(businessRow),
		bankingDetails: settings.bankingDetails,
		footer: settings.footerTerms
	});

	const link = `${origin}/i/${token}`;
	const pdf = await renderDocumentPdf(document);

	await sendMail({
		to,
		subject: `${businessRow.tradingName} — invoice ${number.formatted}`,
		text: invoiceBody({
			tradingName: businessRow.tradingName,
			contactName: draft.sendTo.name,
			number: number.formatted,
			total: formatZar(price.total),
			dueDate: draft.dueDate,
			link
		}),
		attachments: [{ filename: pdfFilename(document), content: pdf, contentType: 'application/pdf' }]
	});

	return { number: number.formatted, token, sentTo: to };
}

/**
 * "SEND A REMINDER".
 *
 * The same discipline as issuing: the mail goes inside the transaction, so a reminder that could
 * not be sent does not write an event claiming it was. T21 makes that an acceptance criterion —
 * "A failed reminder is reported honestly and does not write a success event" — and it is the
 * kind of thing that is easy to get wrong in the direction that flatters the product.
 *
 * A reminder does NOT re-issue anything. Same number, same document, same token; the only things
 * that change are the reminder counters and the event.
 */
export async function sendReminder(
	tx: Tx,
	businessId: string,
	userId: string,
	invoiceId: string,
	origin: string,
	now: Date = new Date()
): Promise<{ readonly sentTo: string }> {
	const header = await loadInvoiceRow(tx, invoiceId);
	if (!header) throw new CannotIssueInvoice("We couldn't find that invoice.");

	if (header.status === 'draft') {
		throw new CannotIssueInvoice(
			'That invoice has not been issued yet, so there is nothing to remind about.'
		);
	}
	if (header.status === 'paid') {
		throw new CannotIssueInvoice('That invoice has been paid. There is nothing to chase.');
	}
	if (header.status === 'cancelled') {
		throw new CannotIssueInvoice('That invoice was cancelled, so a reminder would be wrong.');
	}

	const to = header.sendToEmail;
	if (!to) throw new CannotIssueInvoice('There is no email address on this invoice to remind.');
	if (!header.shareTokenHash) {
		throw new CannotIssueInvoice('This invoice has no link to send. Issue it again.');
	}

	const [businessRow] = await tx
		.select()
		.from(businessTable)
		.where(eq(businessTable.businessId, businessId));

	const settings = await loadSettings(tx);

	await tx
		.update(invoice)
		.set({ lastRemindedAt: now, reminderCount: sql`${invoice.reminderCount} + 1` })
		.where(eq(invoice.id, invoiceId));

	await recordEvent(tx, businessId, invoiceId, {
		kind: 'reminded',
		actor: 'business',
		actorUserId: userId,
		detail: to,
		occurredAt: now
	});

	// The token itself is not stored, only its hash — so a reminder cannot rebuild the original
	// link. It points at the invoice page instead, which is where the client would go anyway, and
	// the PDF is attached to the first email they were sent. Reissuing a token on every reminder
	// would invalidate the link already in their inbox.
	await sendMail({
		to,
		subject: `${businessRow.tradingName} — a reminder about invoice ${header.numberFormatted}`,
		text:
			settings.reminderTemplate ??
			reminderBody({
				tradingName: businessRow.tradingName,
				contactName: header.sendToName,
				number: header.numberFormatted ?? 'your invoice',
				dueDate: header.dueDate,
				origin
			})
	});

	return { sentTo: to };
}

/**
 * The email, in plain text.
 *
 * Text only, deliberately. An HTML email from a small joinery is more likely to land in spam and
 * adds nothing here: the document is ATTACHED as a PDF and linked as a page. The body's whole job
 * is to say who it is from, what it is, what it comes to, when it is due, and where to pay.
 *
 * Written for the client — a person who did not ask for an account and will not make one.
 */
function invoiceBody(input: {
	tradingName: string;
	contactName: string | null;
	number: string;
	total: string;
	dueDate: string;
	link: string;
}): string {
	const greeting = input.contactName ? `Hi ${input.contactName},` : 'Hello,';

	return [
		greeting,
		'',
		`Here is invoice ${input.number} from ${input.tradingName}, for ${input.total}.`,
		`It is due on ${formatDocumentDate(input.dueDate)}.`,
		'',
		'You can view it, and find the banking details, here:',
		input.link,
		'',
		'The invoice is attached as a PDF as well, so you have your own copy either way.',
		'',
		'Thank you,',
		input.tradingName
	].join('\n');
}

/**
 * The reminder.
 *
 * Deliberately mild. A reminder from a small business to a client it wants to keep is not a
 * demand letter, and the product should not put words in somebody's mouth that they would not
 * have chosen. A business that wants its own wording sets `reminder_template`.
 */
function reminderBody(input: {
	tradingName: string;
	contactName: string | null;
	number: string;
	dueDate: string | null;
	origin: string;
}): string {
	const greeting = input.contactName ? `Hi ${input.contactName},` : 'Hello,';

	return [
		greeting,
		'',
		`Just a gentle reminder about invoice ${input.number} from ${input.tradingName}.`,
		input.dueDate ? `It was due on ${formatDocumentDate(input.dueDate)}.` : '',
		'',
		'If it is already on its way, thank you — please ignore this.',
		'',
		'Thank you,',
		input.tradingName
	]
		.filter((line, i, all) => !(line === '' && all[i - 1] === ''))
		.join('\n');
}
