import { describe, it, expect } from 'vitest';
import {
	about,
	at,
	invalid,
	messagesByField,
	problem,
	sentence,
	sentences,
	suggestion,
	valid,
	type Problem
} from './types';
import type { ParseResult } from '$lib/core/money';
import { checkAmount } from './input';

describe('the standard, rendered', () => {
	it('joins the problem and the offer exactly as the design draws it', () => {
		const p = problem("There's no 13th month", {
			suggestion: suggestion('did you mean 2 Dec 2026?', '2026-12-02')
		});
		expect(sentence(p)).toBe("There's no 13th month — did you mean 2 Dec 2026?");
	});

	it('ends a message with a full stop when there is nothing to offer', () => {
		expect(sentence(problem('Enter a date'))).toBe('Enter a date.');
	});

	it('normalises punctuation so copy from anywhere reads the same', () => {
		// The money core's messages already end in a stop; a zod schema's do not. Both have to
		// come out the far side punctuated once.
		expect(sentence(problem('Enter an amount.'))).toBe('Enter an amount.');
		expect(sentence(problem('  Enter an amount  '))).toBe('Enter an amount.');
		expect(sentence(problem('that needs a name'))).toBe('That needs a name.');
	});

	it('leaves an ellipsis alone', () => {
		expect(sentence(problem('Still saving...'))).toBe('Still saving...');
	});

	it('keeps the stop off the front half when there is an offer', () => {
		const p = problem('That amount has too many decimals.', {
			suggestion: suggestion('did you mean R10,00?', 'R10,00')
		});
		expect(sentence(p)).toBe('That amount has too many decimals — did you mean R10,00?');
	});
});

describe('a refusal', () => {
	const first = problem('A description is needed', { field: 'lines.0.description' });
	const second = problem('The due date is needed', { field: 'dueDate' });

	it('speaks with one voice: the first problem, not a list of faults', () => {
		const result = invalid([first, second]);
		expect(result.ok).toBe(false);
		expect(result.message).toBe('A description is needed.');
		expect(result.problems).toHaveLength(2);
	});

	it('accepts a single problem without ceremony', () => {
		expect(invalid(first).problems).toEqual([first]);
	});

	it('says something true rather than nothing when a caller passes no problems', () => {
		const empty = invalid([]);
		expect(empty.message.length).toBeGreaterThan(0);
		expect(empty.problems).toEqual([]);
	});

	it('maps to the { field: message } shape a form action already returns', () => {
		const result = invalid([first, second, problem('Something else', { field: null })]);
		expect(messagesByField(result)).toEqual({
			'lines.0.description': 'A description is needed.',
			dueDate: 'The due date is needed.'
		});
	});

	it('keeps the first message per field, so one input never carries two', () => {
		const result = invalid([first, problem('Something later', { field: 'lines.0.description' })]);
		expect(messagesByField(result)['lines.0.description']).toBe('A description is needed.');
	});

	it('can list every sentence, for a summary at the top of a form', () => {
		expect(sentences(invalid([first, second]))).toEqual([
			'A description is needed.',
			'The due date is needed.'
		]);
	});
});

describe('re-anchoring a problem', () => {
	it('returns a new problem and never mutates the original', () => {
		const original: Problem = problem("There's no 13th month", {
			field: null,
			suggestion: suggestion('did you mean 2 Dec 2026?', '2026-12-02')
		});
		const moved = at(original, 'validUntil');

		expect(moved.field).toBe('validUntil');
		expect(original.field).toBeNull();
		expect(moved.says).toBe(original.says);
		expect(moved.suggestion).toBe(original.suggestion);
	});
});

describe('saying a problem about a place', () => {
	it('reads as one sentence, with the place as the subject', () => {
		const p = problem('A description is needed', { field: 'lines.3.description' });
		expect(sentence(about(p, 'Line 4'))).toBe('Line 4: a description is needed.');
	});

	it('keeps the offer, and keeps the anchor', () => {
		const p = problem("There's no 13th month", {
			field: 'lines.0.date',
			suggestion: suggestion('did you mean 2 Dec 2026?', '2026-12-02')
		});
		const placed = about(p, 'Line 1');
		expect(sentence(placed)).toBe("Line 1: there's no 13th month — did you mean 2 Dec 2026?");
		expect(placed.field).toBe('lines.0.date');
	});

	it('leaves an acronym alone rather than lower-casing half of it', () => {
		const p = problem('VAT numbers are 10 digits starting with 4');
		expect(sentence(about(p, 'Line 2'))).toBe('Line 2: VAT numbers are 10 digits starting with 4.');
	});
});

describe('the money core and this module speak the same shape', () => {
	it('is a ParseResult to anybody who wants one', () => {
		// A compile-time assertion as much as a runtime one: if `Checked<T>` ever stops being
		// assignable to `ParseResult<T>`, this line stops compiling and `bun run check` says so.
		const result: ParseResult<unknown> = checkAmount('not an amount');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(typeof result.message).toBe('string');

		const good: ParseResult<unknown> = valid(42);
		expect(good).toEqual({ ok: true, value: 42 });
	});
});
