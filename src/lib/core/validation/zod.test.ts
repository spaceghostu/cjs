import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { check, explainToOperator, fromZodError, problemsFromZodError } from './zod';
import { explainDate } from './dates';
import { messagesByField, sentence, sentences, type Invalid } from './types';

const refused = (result: { ok: boolean }): Invalid => {
	expect(result.ok).toBe(false);
	return result as Invalid;
};

/**
 * Everything a schema failure is allowed to look like on the way in, and never on the way out.
 * Half of these are zod's default copy; the rest are the shapes of a leaked path or marker.
 */
const NEVER_SHOWN = [
	'Invalid',
	'invalid_',
	'expected',
	'received',
	'Too small',
	'Too big',
	'Unrecognized',
	'ZodError',
	'validation:',
	'undefined',
	'>=',
	'lines.0',
	'lines[0]',
	'qtyE6',
	'tradingName',
	'sendToEmail'
];

const assertNothingLeaked = (result: Invalid) => {
	for (const text of sentences(result)) {
		for (const forbidden of NEVER_SHOWN) {
			expect(text, `"${text}" leaked "${forbidden}"`).not.toContain(forbidden);
		}
	}
	expect(result.message).toBe(sentences(result)[0]);
};

describe('a schema with no copy of its own', () => {
	// Deliberately bare: not one message written by a person, so every sentence the bridge
	// produces has to come from the standard.
	const bare = z.object({
		tradingName: z.string(),
		count: z.number().int().min(2).max(200),
		sendToEmail: z.email(),
		id: z.uuid(),
		method: z.enum(['card', 'eft', 'cash']),
		lines: z.array(z.object({ description: z.string().min(1), qtyE6: z.number().int() })).max(2)
	});

	const result = refused(
		check(bare, {
			count: 1.5,
			sendToEmail: 'nope',
			id: 'not-a-uuid',
			method: 'crad',
			lines: [{ qtyE6: 'twelve' }]
		})
	);

	it('never lets a single word of zod through', () => {
		assertNothingLeaked(result);
	});

	it('still knows exactly which input each message belongs to', () => {
		// The path is kept as data and kept out of the copy. Both halves matter: without it the
		// rendering layer cannot place the message; with it in the sentence, a person reads our
		// variable names.
		const fields = result.problems.map((p) => p.field);
		expect(fields).toContain('tradingName');
		expect(fields).toContain('lines.0.description');
		expect(fields).toContain('lines.0.qtyE6');
	});

	it('says something a person can act on for a field left blank', () => {
		expect(messagesByField(result).tradingName).toBe('Fill this in.');
	});

	it('says the page is stale when the payload disagrees with it', () => {
		// A uuid, an enum member and a number sent as a string are never things somebody typed.
		// Telling them to check their spelling would be a lie; telling them to reload is not.
		expect(messagesByField(result).id).toContain('Reload the page');
		expect(messagesByField(result).method).toContain('Reload the page');
		expect(messagesByField(result)['lines.0.qtyE6']).toContain('Reload the page');
	});

	it('names the thing that is wrong when it is genuinely a typing mistake', () => {
		expect(messagesByField(result).sendToEmail).toBe('That does not look like an email address.');
	});

	it('reports one problem per field, not one per failing rule', () => {
		const fields = result.problems.map((p) => p.field);
		expect(new Set(fields).size).toBe(fields.length);
	});
});

describe('the sentence for every kind of failure', () => {
	// One case per branch of the copy table, because a branch nobody exercises is a branch that
	// will one day print `${issue.message}` and nobody will notice until a customer does.
	const said = (schema: z.ZodType<unknown>, input: unknown, vocabulary = {}) =>
		refused(check(schema, input, vocabulary)).message;

	it('says how much more is needed, and how much less', () => {
		expect(said(z.object({ note: z.string().min(5) }), { note: 'hi' })).toBe(
			'That needs at least 5 characters.'
		);
		expect(
			said(z.object({ note: z.string().min(5) }), { note: 'hi' }, { fields: { note: 'A note' } })
		).toBe('A note needs at least 5 characters.');
		expect(said(z.object({ note: z.string().max(3) }), { note: 'far too long' })).toContain(
			'longer than we can save'
		);
	});

	it('talks about numbers as numbers', () => {
		expect(said(z.object({ n: z.number().min(2) }), { n: 1 })).toBe('That cannot be less than 2.');
		expect(said(z.object({ n: z.number().max(9) }), { n: 12 })).toBe('That cannot be more than 9.');
		expect(said(z.object({ n: z.number().multipleOf(5) }), { n: 7 })).toBe(
			'That has to be a multiple of 5.'
		);
	});

	it('talks about a list as a list', () => {
		expect(said(z.object({ picked: z.array(z.string()).min(1) }), { picked: [] })).toBe(
			'Add at least one before saving.'
		);
		expect(
			said(z.object({ picked: z.array(z.string()).max(1) }), { picked: ['a', 'b'] })
		).toContain('more than we can save in one go');
	});

	it('knows a web address from an email address, and both from an identifier', () => {
		expect(said(z.object({ site: z.url() }), { site: 'not a url' })).toBe(
			'That does not look like a web address.'
		);
		expect(said(z.object({ token: z.uuid() }), { token: 'nope' })).toContain('Reload the page');
		expect(said(z.object({ code: z.string().regex(/^\d+$/) }), { code: 'abc' })).toBe(
			'That is not in a form we recognise.'
		);
	});

	it('treats a key nobody declared as a page that has moved on', () => {
		const strict = z.strictObject({ known: z.string() });
		expect(said(strict, { known: 'yes', surprise: 1 })).toContain('Reload the page');
	});

	it('has something honest to say about a refine with no words of its own', () => {
		const schema = z.object({ odd: z.number().refine((n) => n % 2 === 1) });
		expect(said(schema, { odd: 2 })).toBe('That does not look right.');
		expect(said(schema, { odd: 2 }, { fields: { odd: 'That number' } })).toBe(
			'That number does not look right.'
		);
	});

	it('says nothing about a field it has no name for, rather than inventing one', () => {
		// The refusal for a whole-object refine has no path at all, and no vocabulary can help.
		const whole = z.object({ a: z.string() }).refine(() => false);
		expect(said(whole, { a: 'x' })).toBe('That does not look right.');
	});
});

describe('copy a person wrote', () => {
	const spoken = z.object({
		tradingName: z.string().trim().min(1, 'Your business needs a name to put on a quote'),
		vatNumber: z
			.string()
			.regex(/^4\d{9}$/, 'A South African VAT number is 10 digits starting with 4')
	});

	it('survives the bridge exactly as written', () => {
		const result = refused(check(spoken, { tradingName: '', vatNumber: '4123456789' }));
		expect(result.message).toBe('Your business needs a name to put on a quote.');
	});

	it('survives on a check further down the schema too', () => {
		const result = refused(check(spoken, { tradingName: 'Bevan Plumbing', vatNumber: '12345' }));
		expect(result.message).toBe('A South African VAT number is 10 digits starting with 4.');
	});

	it('is punctuated by the standard rather than by whoever wrote it', () => {
		const either = z.object({ note: z.string().min(1, 'A note is needed.') });
		expect(refused(check(either, { note: '' })).message).toBe('A note is needed.');
	});
});

describe('the words a boundary lends the bridge', () => {
	const document = z.object({
		lines: z.array(z.object({ description: z.string().min(1), qty: z.number() })).max(200),
		validUntil: z.string().refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), 'is not a real date')
	});

	const vocabulary = {
		fields: { description: 'A description', qty: 'A quantity' },
		rows: { lines: 'Line' }
	};

	it('names the row the person is looking at, counting from one', () => {
		const result = refused(
			check(
				document,
				{ lines: [{ description: 'Labour', qty: 1 }, { qty: 2 }], validUntil: '2026-08-22' },
				vocabulary
			)
		);
		expect(result.message).toBe('Line 2: a description is needed.');
	});

	it('falls back to saying nothing about the field rather than inventing a name for it', () => {
		const result = refused(
			check(
				document,
				{ lines: [{ qty: 1 }], validUntil: '2026-08-22' },
				{ rows: { lines: 'Line' } }
			)
		);
		expect(result.message).toBe('Line 1: fill this in.');
	});

	it('hands a field to a core checker that knows what the value means', () => {
		// `refine(isCalendarDate)` can only say yes or no. `explainDate` knows there is no 13th
		// month and what the person probably meant, so it owns the sentence for that field.
		const result = refused(
			check(
				document,
				{ lines: [], validUntil: '2026/13/02' },
				{ ...vocabulary, explain: { validUntil: explainDate } }
			)
		);
		expect(result.message).toBe("There's no 13th month — did you mean 2 Dec 2026?");
		expect(result.problems[0].field).toBe('validUntil');
		expect(result.problems[0].suggestion?.value).toBe('2026-12-02');
	});

	it('falls back to the author copy when the core checker has no quarrel with the value', () => {
		const strict = z.object({
			validUntil: z.string().refine((v) => v === '2026-01-01', 'That day is already spoken for')
		});
		const result = refused(
			check(strict, { validUntil: '2026-08-22' }, { explain: { validUntil: explainDate } })
		);
		expect(result.message).toBe('That day is already spoken for.');
	});
});

describe('an error that did not come through check', () => {
	const spoken = z.object({ name: z.string().min(1, 'Your business needs a name') });

	it('is translated safely, because a message it cannot vouch for is not used', () => {
		const failure = spoken.safeParse({ name: '' });
		expect(failure.success).toBe(false);
		if (failure.success) return;

		// The author's sentence is lost, and that is the correct trade: without the marker there
		// is no way to tell it from "Too small: expected string to have >=1 characters", and
		// showing that to somebody is the failure this module exists to prevent.
		const problems = problemsFromZodError(failure.error);
		expect(sentence(problems[0])).toBe('Fill this in.');
		expect(sentence(problems[0])).not.toContain('Too small');
	});

	it('can be turned straight into a refusal', () => {
		const failure = spoken.safeParse({ name: '' });
		if (failure.success) return;
		const result = fromZodError(failure.error, { fields: { name: 'A business name' } });
		expect(result.ok).toBe(false);
		expect(result.message).toBe('A business name is needed.');
	});
});

describe('the operator exemption', () => {
	it('keeps the path and the schema message, because the reader is the person deploying it', () => {
		const environment = z.object({ DATABASE_POOL_MAX: z.number().max(200) });
		const failure = environment.safeParse({ DATABASE_POOL_MAX: 5000 });
		if (failure.success) return;

		const lines = explainToOperator(failure.error);
		expect(lines).toContain('DATABASE_POOL_MAX');
		expect(lines.startsWith('  - ')).toBe(true);
	});

	it('says (root) rather than an empty name for a failure about the whole object', () => {
		const environment = z.object({}).refine(() => false, 'nothing here is right');
		const failure = environment.safeParse({});
		if (failure.success) return;
		expect(explainToOperator(failure.error)).toContain('(root)');
	});
});

describe('what happens when everything is fine', () => {
	it('returns the parsed value, transforms and defaults included', () => {
		const schema = z.object({
			name: z
				.string()
				.transform((v) => v.trim())
				.transform((v) => (v === '' ? null : v)),
			position: z.number().int().default(0)
		});

		const result = check(schema, { name: '  Bevan Plumbing  ' });
		expect(result).toEqual({ ok: true, value: { name: 'Bevan Plumbing', position: 0 } });
	});
});
