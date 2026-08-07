/**
 * THE SPEED BUMP, MEASURED.
 *
 * A rate limit is entirely about the passage of time, which makes the clock the thing most
 * worth being able to control — so `take()` takes `nowMs` and these tests never wait.
 */
import { describe, expect, it } from 'vitest';
import { RateLimiter, callerKey } from './ratelimit';

describe('the bucket', () => {
	it('allows a burst and then refuses', () => {
		const limiter = new RateLimiter({ burst: 3, perMinute: 3 });

		expect(limiter.take('a', 0).allowed).toBe(true);
		expect(limiter.take('a', 0).allowed).toBe(true);
		expect(limiter.take('a', 0).allowed).toBe(true);

		const refused = limiter.take('a', 0);
		expect(refused.allowed).toBe(false);
		// Rounded UP: telling somebody to retry a moment before they may is how a retry loop
		// turns one refusal into a permanent one.
		expect(refused.retryAfterSeconds).toBe(20);
	});

	it('refills continuously rather than in windows', () => {
		// A fixed window lets somebody spend a whole allowance at the end of one and the whole
		// of the next at the start of the next, at double the intended rate. A bucket has no
		// edge to exploit.
		const limiter = new RateLimiter({ burst: 2, perMinute: 60 });

		expect(limiter.take('a', 0).allowed).toBe(true);
		expect(limiter.take('a', 0).allowed).toBe(true);
		expect(limiter.take('a', 0).allowed).toBe(false);

		// One token per second at 60/minute.
		expect(limiter.take('a', 1_000).allowed).toBe(true);
		expect(limiter.take('a', 1_000).allowed).toBe(false);
	});

	it('never refills past the burst', () => {
		const limiter = new RateLimiter({ burst: 2, perMinute: 60 });
		expect(limiter.take('a', 0).allowed).toBe(true);

		// An hour later there is still a burst of two waiting, not sixty.
		expect(limiter.take('a', 3_600_000).allowed).toBe(true);
		expect(limiter.take('a', 3_600_000).allowed).toBe(true);
		expect(limiter.take('a', 3_600_000).allowed).toBe(false);
	});

	it('counts each caller separately', () => {
		const limiter = new RateLimiter({ burst: 1, perMinute: 1 });

		expect(limiter.take('a', 0).allowed).toBe(true);
		expect(limiter.take('a', 0).allowed).toBe(false);
		// One caller exhausting their allowance must not lock out everybody else.
		expect(limiter.take('b', 0).allowed).toBe(true);
	});

	it('can be reset', () => {
		const limiter = new RateLimiter({ burst: 1, perMinute: 1 });
		expect(limiter.take('a', 0).allowed).toBe(true);
		limiter.take('a', 0);

		limiter.reset();
		expect(limiter.take('a', 0).allowed).toBe(true);
	});
});

describe('who is asking', () => {
	it('takes the leftmost forwarded address', () => {
		const request = new Request('https://cjs.test/q/abc', {
			headers: { 'x-forwarded-for': '41.13.2.9, 10.0.0.1, 10.0.0.2' }
		});
		// The client as the FIRST proxy saw it. Forgeable, like every header — which is why this
		// is a key for a speed bump and never an identity.
		expect(callerKey(request)).toBe('41.13.2.9');
	});

	it('falls back through x-real-ip to a shared bucket', () => {
		expect(
			callerKey(new Request('https://cjs.test/', { headers: { 'x-real-ip': '41.13.2.9' } }))
		).toBe('41.13.2.9');
		// No headers at all: everybody shares one bucket, which is the safe direction to be
		// wrong in — the limit still applies, it is simply blunter.
		expect(callerKey(new Request('https://cjs.test/'))).toBe('unknown');
	});
});
