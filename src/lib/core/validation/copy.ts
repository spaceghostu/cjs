/**
 * WHAT A SCHEMA FAILURE SOUNDS LIKE WHEN A PERSON READS IT.
 *
 * zod's own messages are written for whoever wrote the schema: "Invalid input: expected string,
 * received undefined", "Too small: expected string to have >=1 characters", "Invalid option:
 * expected one of \"card\"|\"eft\"|\"cash\"". Every one of them is true, and not one of them
 * belongs on a screen in front of somebody who is trying to send a quote before lunch. This
 * file is the translation, and it is the reason `zod.ts` can promise that no schema text ever
 * reaches a user: there is no path from an issue to a sentence except through here.
 *
 * THE THREE THINGS A SENTENCE CAN KNOW
 * ------------------------------------
 *  1. WHAT went wrong — the issue's code, which is always available.
 *  2. WHICH FIELD — only if the boundary said what to call it. `fields` maps the last segment
 *     of the path to a subject noun phrase: `{ description: 'A description' }`. Absent, the
 *     sentence simply does not name the field. It NEVER falls back to the path: turning
 *     `sendToEmail` into "send to email" is a field path wearing a hat, and the point of this
 *     module is that a person never reads one.
 *  3. WHICH ROW — `rows` maps an array's key to a singular noun: `{ lines: 'Line' }`, so
 *     `lines.3.description` becomes "Line 4". One-based, because the person is looking at a
 *     table that starts at 1 and has never heard of index 3.
 *
 * A place and a body compose as "Line 4: a description is needed", the colon rather than an
 * em dash because the dash is spoken for — `sentence()` uses it for the suggestion, and a
 * sentence with two dashes in it stops parsing as English.
 *
 * WHY THERE ARE SO FEW SUGGESTIONS IN HERE
 * ----------------------------------------
 * The standard says to offer the probable intent WHERE ONE EXISTS, and the honest answer for
 * most schema failures is that it does not. Two tempting ones were deliberately dropped:
 *
 *   - THE NEAR-MISS ON A CHOICE. `invalid_value` hands us the permitted values, and offering
 *     the closest is a two-line trick. It is also a direct breach of the rule this module
 *     exists to enforce: `zero_rated` and `pro_forma` are schema tokens, and putting one in
 *     front of a person as a suggestion surfaces the schema just as surely as printing the
 *     error would. Worse, every enum in this product is behind a picker — a value that is not
 *     on the list means the page is stale or the request was hand-made, and the useful thing
 *     to say is so.
 *
 *   - THE EMAIL DOMAIN TYPO. "you@gmial.com" is the classic did-you-mean, and it is not a
 *     validation failure at all: it is a perfectly well-formed address, and no validator has
 *     any quarrel with it. Guessing at it here would mean this file second-guessing values the
 *     schema ACCEPTED, which is a different feature with a different risk profile.
 *
 * Where an intent genuinely is knowable — a month of 13, a third decimal on a price — the
 * offer is made by the module that understands the value: `dates.ts` and `input.ts`. A
 * boundary attaches one of those to a field through `Vocabulary.explain`.
 */
import type { core } from 'zod';
import type { Problem } from './types';

/**
 * The words a boundary lends the bridge.
 *
 * All three are optional and all three are keyed by the LAST string segment of the issue path,
 * so one entry covers a field wherever it appears — `description` speaks for `description` and
 * for `lines.7.description` alike.
 */
export type Vocabulary = {
	/** Subject noun phrases: `{ description: 'A description', dueDate: 'The due date' }`. */
	readonly fields?: Readonly<Record<string, string>>;
	/** Singular row nouns for arrays: `{ lines: 'Line' }` -> "Line 4". */
	readonly rows?: Readonly<Record<string, string>>;
	/**
	 * Fields whose copy a core checker owns. `{ validUntil: explainDate }` hands the whole
	 * sentence — and its suggestion — to `dates.ts`, which knows what a date is and a schema
	 * `refine` does not. Returning null means "looks fine to me", and the bridge falls back.
	 */
	readonly explain?: Readonly<Record<string, (input: unknown) => Problem | null>>;
};

/** Something in this form is not what the page thinks it is. Never the person's fault, or fixable by them. */
const STALE = 'Something here is out of date. Reload the page and try again';

/**
 * One issue, in plain language.
 *
 * Deliberately total: every branch returns a sentence, and the default says something true
 * rather than something specific. A code this file has not met yet must degrade to honest
 * vagueness, never to the schema's own words.
 */
export function plainly(issue: core.$ZodIssue, vocabulary: Vocabulary): string {
	return body(issue, thingOf(issue.path, vocabulary.fields));
}

function body(issue: core.$ZodIssue, subject: string | null): string {
	switch (issue.code) {
		case 'invalid_type':
			// Absent and present-but-wrong-shape are the same code and very different events:
			// one is a person who has not filled something in, the other is a payload that
			// disagrees with the page that sent it.
			return isMissing(issue.input) ? (subject ? `${subject} is needed` : 'Fill this in') : STALE;

		case 'too_small':
			if (issue.origin === 'string') {
				const minimum = Number(issue.minimum);
				if (minimum <= 1) return subject ? `${subject} is needed` : 'Fill this in';
				return `${subject ?? 'That'} needs at least ${minimum} characters`;
			}
			if (issue.origin === 'array') return 'Add at least one before saving';
			return `${subject ?? 'That'} cannot be less than ${issue.minimum}`;

		case 'too_big':
			if (issue.origin === 'string') {
				return `${subject ?? 'That'} is longer than we can save. Keep it to ${issue.maximum} characters`;
			}
			if (issue.origin === 'array') {
				return `That is more than we can save in one go. The most is ${issue.maximum}`;
			}
			return `${subject ?? 'That'} cannot be more than ${issue.maximum}`;

		case 'invalid_format':
			if (issue.format === 'email')
				return `${subject ?? 'That'} does not look like an email address`;
			if (issue.format === 'url') return `${subject ?? 'That'} does not look like a web address`;
			// uuid, cuid, and the rest are identifiers the page supplies, never typed by anyone.
			if (IDENTIFIER_FORMATS.has(issue.format)) return STALE;
			return `${subject ?? 'That'} is not in a form we recognise`;

		case 'not_multiple_of':
			return `${subject ?? 'That'} has to be a multiple of ${issue.divisor}`;

		// A value off a closed list, a key nobody declared, a union nothing matched, a bad key
		// or element inside a map or set: all of them mean the payload and the page disagree.
		case 'invalid_value':
		case 'invalid_union':
		case 'unrecognized_keys':
		case 'invalid_key':
		case 'invalid_element':
			return STALE;

		default:
			// `custom` with no message of its own, and anything a future zod adds.
			return `${subject ?? 'That'} does not look right`;
	}
}

const IDENTIFIER_FORMATS: ReadonlySet<string> = new Set([
	'uuid',
	'guid',
	'nanoid',
	'cuid',
	'cuid2',
	'ulid',
	'xid',
	'ksuid',
	'jwt'
]);

/** A field that was not sent at all, or was sent as nothing. */
function isMissing(input: unknown): boolean {
	return input === undefined || input === null;
}

/** `lines.3.qtyE6` — the anchor the rendering layer needs, and the string nobody reads. */
export function pathOf(path: readonly PropertyKey[]): string | null {
	return path.length === 0 ? null : path.map((part) => String(part)).join('.');
}

/** The last named part of a path, which is what a vocabulary is keyed by. */
export function keyOf(path: readonly PropertyKey[]): string | null {
	for (let i = path.length - 1; i >= 0; i--) {
		if (typeof path[i] === 'string') return path[i] as string;
	}
	return null;
}

/**
 * "Line 4", from `lines.3.description` and `{ lines: 'Line' }`.
 *
 * The LAST index in the path wins, so a nested table names the row nearest the failure. One
 * based: the array index is a fact about memory, and the number beside the row is what the
 * person can see.
 */
export function placeOf(
	path: readonly PropertyKey[],
	rows: Readonly<Record<string, string>> | undefined
): string | null {
	if (!rows) return null;
	for (let i = path.length - 1; i >= 1; i--) {
		const index = path[i];
		const container = path[i - 1];
		if (typeof index !== 'number' || typeof container !== 'string') continue;
		const noun = rows[container];
		if (noun) return `${noun} ${index + 1}`;
	}
	return null;
}

function thingOf(
	path: readonly PropertyKey[],
	fields: Readonly<Record<string, string>> | undefined
): string | null {
	const key = keyOf(path);
	if (key === null || !fields) return null;
	return fields[key] ?? null;
}
