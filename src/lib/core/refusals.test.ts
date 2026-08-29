/**
 * THE REFUSAL VOCABULARY, PROVEN.
 *
 * Pure and databaseless, like the module it tests. Two properties matter here and both of them
 * are the kind that fail silently in production if nobody pins them:
 *
 *   1. The not-found sentence says NOTHING about who owns the record. A message that leaked
 *      "that belongs to another business" would confirm the record exists, which is the whole
 *      thing Row Level Security is arranging for it not to do. Pinning the prohibition at the
 *      source means `src/routes/(app)/not-found.test.ts` is proving the WIRING rather than
 *      re-litigating the copy.
 *
 *   2. Every code in the union has a tone DECIDED for it. The table below is exhaustive by
 *      construction — `Record<RefusalCode, ...>` means a code added to the union without a
 *      rendering decision behind it fails `bun run check`, before anybody has to notice that a
 *      locked module started rendering red.
 */
import { describe, expect, it } from 'vitest';
import { notFound, notFoundMessage, toneOf, type RefusalCode } from './refusals';

/**
 * Every member of the union, with the tone it is expected to carry. Typed as a full `Record`
 * on purpose: this object is the exhaustiveness check, and the `it.each` below is only what
 * reads it out loud.
 */
const TONES: Record<RefusalCode, 'calm' | 'wrong'> = {
	module_locked: 'calm',
	module_removed: 'calm',
	not_billing_admin: 'calm',
	not_found: 'calm',
	no_such_quote: 'calm',
	no_such_invoice: 'calm',
	too_many_requests: 'calm',
	module_already_added: 'wrong',
	module_not_added: 'wrong',
	module_not_for_sale: 'wrong',
	invalid_quote: 'wrong',
	invalid_invoice: 'wrong',
	invalid_count: 'wrong',
	invalid_promotion: 'wrong',
	quote_sent: 'wrong',
	invoice_issued: 'wrong',
	count_applied: 'wrong',
	count_not_counting: 'wrong',
	no_request_context: 'wrong',
	unexpected: 'wrong'
};

/** The words a not-found sentence must never contain, in any tense or casing. */
const LEAKS = /another|other business|belongs to|not yours|permission|access/i;

describe('the not-found sentence', () => {
	it('says the same thing about a quote however it is asked for', () => {
		expect(notFoundMessage('quote')).toBe("We couldn't find that quote.");
		expect(notFound('quote').message).toBe(notFoundMessage('quote'));
	});

	it('names no id — a uuid in the sentence would be a record confirmed', () => {
		const message = notFound('invoice').message;
		expect(message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
	});

	it.each(['quote', 'invoice', 'item', 'stock count', 'document'])(
		'says nothing about ownership when it cannot find a %s',
		(thing) => {
			expect(notFound(thing).message).not.toMatch(LEAKS);
			expect(notFoundMessage(thing)).not.toMatch(LEAKS);
		}
	);

	it('carries the code the error page dispatches on', () => {
		expect(notFound('quote').code).toBe('not_found');
	});

	it('offers somewhere to go — a refusal without a next step is a dead end', () => {
		const refusal = notFound('item');
		expect(refusal.nextHref).toBe('/');
		expect(refusal.nextLabel).toBe('Back to your dashboard');
	});
});

describe('tone', () => {
	it.each(Object.entries(TONES))('%s renders %s', (code, tone) => {
		expect(toneOf(403, code as RefusalCode)).toBe(tone);
	});

	it('draws an entitlement refusal calm, whatever the status says', () => {
		expect(toneOf(403, 'module_locked')).toBe('calm');
		expect(toneOf(403, 'module_removed')).toBe('calm');
		expect(toneOf(403, 'not_billing_admin')).toBe('calm');
	});

	it('draws anything the server broke as wrong', () => {
		expect(toneOf(500, 'unexpected')).toBe('wrong');
		expect(toneOf(500)).toBe('wrong');
		expect(toneOf(503)).toBe('wrong');
	});

	it('falls back on status alone when a throw carried no code', () => {
		expect(toneOf(404)).toBe('calm');
		expect(toneOf(403)).toBe('calm');
	});
});
