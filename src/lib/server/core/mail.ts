/**
 * Outbound mail.
 *
 * One transport for the whole product. Modules never write send code — document delivery
 * goes through `deliver()` (M3), which calls this. Sign-in magic links call it directly.
 *
 * When SMTP is not configured we log to the console in development so magic-link sign-in
 * works locally, and we throw in production rather than silently dropping a message the
 * user is waiting for.
 */
import { dev } from '$app/environment';
import nodemailer, { type Transporter } from 'nodemailer';
import { env, features } from '$lib/server/env';

export type Mail = {
	to: string;
	subject: string;
	text: string;
	html?: string;
	attachments?: { filename: string; content: Uint8Array; contentType: string }[];
};

let transporter: Transporter | null = null;

function transport(): Transporter {
	transporter ??= nodemailer.createTransport(env.SMTP_URL!, { from: env.MAIL_FROM });
	return transporter;
}

export async function sendMail(mail: Mail): Promise<void> {
	if (!features.mail) {
		if (dev) {
			console.info(
				`\n──── mail (not sent — SMTP_URL and MAIL_FROM are unset) ────\n` +
					`to:      ${mail.to}\n` +
					`subject: ${mail.subject}\n\n${mail.text}\n` +
					`────────────────────────────────────────────────────────────\n`
			);
			return;
		}
		throw new Error('Cannot send mail: SMTP_URL and MAIL_FROM are not configured on this server.');
	}

	await transport().sendMail({
		from: env.MAIL_FROM,
		to: mail.to,
		subject: mail.subject,
		text: mail.text,
		html: mail.html,
		attachments: mail.attachments?.map((a) => ({
			filename: a.filename,
			content: Buffer.from(a.content),
			contentType: a.contentType
		}))
	});
}
