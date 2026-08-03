/**
 * Validated server environment.
 *
 * Every secret the app needs is declared here and checked ONCE at boot. A missing or
 * malformed secret must fail loudly at start-up, never as a confusing 500 in the middle
 * of an owner's quote.
 *
 * Import this module (not `$env/dynamic/private`) everywhere on the server.
 */
import { building } from '$app/environment';
import { env as runtime } from '$env/dynamic/private';
import { z } from 'zod';

/** Present-and-non-empty, or undefined. Blank strings in .env files are not values. */
const optional = z
	.string()
	.trim()
	.min(1)
	.optional()
	.or(z.literal('').transform(() => undefined));

const schema = z.object({
	// ── Database ──────────────────────────────────────────────────────────────────
	/**
	 * The APPLICATION connection. This role must NOT own the tables and must have
	 * neither SUPERUSER nor BYPASSRLS — `FORCE ROW LEVEL SECURITY` does not apply to
	 * either, so one wrong connection string silently disables the entire tenancy floor.
	 * `assertDatabaseRoleIsSafe()` in db/client.ts verifies this at first connection.
	 */
	DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL is required'),
	/**
	 * The DDL connection, used only by drizzle-kit. Separate role, because the app role
	 * must not be able to alter the policies that constrain it.
	 */
	DATABASE_MIGRATION_URL: optional,
	/** Pool ceiling. See the dashboard fan-out formula in db/client.ts. */
	DATABASE_POOL_MAX: z.coerce.number().int().min(2).max(200).default(10),

	// ── App ───────────────────────────────────────────────────────────────────────
	/**
	 * REQUIRED in production. adapter-node rejects every form POST without it
	 * ("Cross-site POST form submissions are forbidden"), which breaks every commit
	 * path in the product.
	 */
	ORIGIN: z.url('ORIGIN must be an absolute URL, e.g. https://app.example.co.za'),
	BETTER_AUTH_SECRET: z
		.string()
		.trim()
		.min(32, 'BETTER_AUTH_SECRET must be at least 32 characters of high-entropy random'),

	// ── Optional sign-in providers (validated as a group if either half is present) ──
	GOOGLE_CLIENT_ID: optional,
	GOOGLE_CLIENT_SECRET: optional,
	MICROSOFT_CLIENT_ID: optional,
	MICROSOFT_CLIENT_SECRET: optional,

	// ── Optional outbound mail (magic links and document delivery) ────────────────
	SMTP_URL: optional,
	MAIL_FROM: optional
});

function pairRequired(issues: string[], label: string, a: [string, unknown], b: [string, unknown]) {
	const [aName, aVal] = a;
	const [bName, bVal] = b;
	if (Boolean(aVal) !== Boolean(bVal)) {
		issues.push(`${label}: set both ${aName} and ${bName}, or neither.`);
	}
}

function load() {
	// `building` is true during `vite build`, when secrets are legitimately absent.
	// A build must never require production credentials.
	if (building) return schema.partial().parse({}) as z.infer<typeof schema>;

	const parsed = schema.safeParse(runtime);
	if (!parsed.success) {
		const lines = parsed.error.issues.map(
			(i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`
		);
		throw new Error(`Invalid server environment:\n${lines.join('\n')}`);
	}
	const e = parsed.data;

	const issues: string[] = [];
	pairRequired(
		issues,
		'Google sign-in',
		['GOOGLE_CLIENT_ID', e.GOOGLE_CLIENT_ID],
		['GOOGLE_CLIENT_SECRET', e.GOOGLE_CLIENT_SECRET]
	);
	pairRequired(
		issues,
		'Microsoft sign-in',
		['MICROSOFT_CLIENT_ID', e.MICROSOFT_CLIENT_ID],
		['MICROSOFT_CLIENT_SECRET', e.MICROSOFT_CLIENT_SECRET]
	);
	pairRequired(issues, 'Outbound mail', ['SMTP_URL', e.SMTP_URL], ['MAIL_FROM', e.MAIL_FROM]);
	if (issues.length)
		throw new Error(`Invalid server environment:\n${issues.map((i) => `  - ${i}`).join('\n')}`);

	return e;
}

export const env = load();

export const features = {
	google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
	microsoft: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
	/** Magic link and document delivery both need outbound mail. */
	mail: Boolean(env.SMTP_URL && env.MAIL_FROM)
} as const;
