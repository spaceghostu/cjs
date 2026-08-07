/**
 * A LIMIT ON HOW OFTEN SOMEBODY CAN TRY.
 *
 * The public quote page is the one surface in this product an unauthenticated stranger can
 * reach, and the thing they would try is guessing tokens. A 256-bit token is not guessable in
 * any number of attempts, so this is not what makes the token safe — `send.ts` explains that.
 * This is what stops somebody making the ATTEMPT cheap: an unlimited endpoint that hits the
 * database once per request is a way to spend a business's connection pool from a laptop.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is IN-PROCESS. Two instances behind a load balancer have two counters, so the effective
 * limit is per instance and this is a speed bump rather than a wall. That is stated here rather
 * than discovered later, because the fix — a shared counter in Postgres or Redis — is a real
 * piece of work and should be done deliberately when there is a second instance, not
 * approximated now.
 *
 * A TOKEN BUCKET, not a fixed window. A fixed window lets somebody spend the whole allowance in
 * the last second of one window and the whole of the next in the first second of the next, at
 * double the intended rate, and then wait. A bucket refills continuously and has no edge.
 */

export type RateLimitResult = {
	readonly allowed: boolean;
	/** Whole seconds until the next attempt would be allowed. Zero when one is allowed now. */
	readonly retryAfterSeconds: number;
};

type Bucket = { tokens: number; lastRefillMs: number };

export type RateLimitOptions = {
	/** How many attempts a caller may make in a burst. */
	readonly burst: number;
	/** How many attempts per minute it refills at. */
	readonly perMinute: number;
};

/**
 * One limiter per thing being limited, so the counters cannot collide.
 *
 * A quote's page and its accept action have different budgets: reading a document a client was
 * emailed is something they may legitimately do twenty times, and accepting it is something
 * that happens once.
 */
export class RateLimiter {
	#buckets = new Map<string, Bucket>();
	#burst: number;
	#perMs: number;
	/** Above this, the oldest idle buckets are dropped. A map that only grows is a leak. */
	#capacity = 10_000;

	constructor({ burst, perMinute }: RateLimitOptions) {
		this.#burst = burst;
		this.#perMs = perMinute / 60_000;
	}

	/**
	 * Take one attempt for `key`, if there is one to take.
	 *
	 * `nowMs` is a parameter rather than a call to `Date.now()` for the reason every clock in
	 * this codebase is: a rate limit is entirely about the passage of time, which makes the
	 * clock the thing most worth being able to control in a test.
	 */
	take(key: string, nowMs: number = Date.now()): RateLimitResult {
		const bucket = this.#buckets.get(key) ?? { tokens: this.#burst, lastRefillMs: nowMs };

		const refilled = Math.min(
			this.#burst,
			bucket.tokens + (nowMs - bucket.lastRefillMs) * this.#perMs
		);

		if (refilled >= 1) {
			this.#buckets.set(key, { tokens: refilled - 1, lastRefillMs: nowMs });
			this.#evictIfCrowded();
			return { allowed: true, retryAfterSeconds: 0 };
		}

		this.#buckets.set(key, { tokens: refilled, lastRefillMs: nowMs });

		// Seconds to wait, rounded UP: telling somebody to retry a moment before they may is
		// how a client-side retry loop turns one refusal into a permanent one.
		const msToNext = (1 - refilled) / this.#perMs;
		// Seconds, not money — there is no rounding policy to respect here.
		// eslint-disable-next-line no-restricted-syntax -- not money, see above
		return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(msToNext / 1000)) };
	}

	/** Test seam, and the way a deployment would reset after a mistake. */
	reset(): void {
		this.#buckets.clear();
	}

	#evictIfCrowded(): void {
		if (this.#buckets.size <= this.#capacity) return;

		// Drop the least recently touched half. Evicting a bucket is a caller getting their
		// allowance back, which is the safe direction to be wrong in for a speed bump.
		const byAge = [...this.#buckets.entries()].sort(
			(a, b) => a[1].lastRefillMs - b[1].lastRefillMs
		);
		for (const [key] of byAge.slice(0, this.#buckets.size - this.#capacity / 2)) {
			this.#buckets.delete(key);
		}
	}
}

/**
 * WHO IS ASKING, as well as this process can tell.
 *
 * `X-Forwarded-For` is a header, which is to say a claim, which is to say forgeable — so this
 * is a key for a speed bump and never an identity. The LEFTMOST entry is the client as the
 * first proxy saw it, which is the most useful of several imperfect answers.
 */
export function callerKey(request: Request, fallback = 'unknown'): string {
	const forwarded = request.headers.get('x-forwarded-for');
	if (forwarded) return forwarded.split(',')[0].trim() || fallback;
	return request.headers.get('x-real-ip')?.trim() || fallback;
}
