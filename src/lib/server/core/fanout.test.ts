/**
 * The bound is the whole point, so the tests measure ACTUAL concurrency rather than trusting
 * the arithmetic. Each task records how many are in flight when it starts; the high-water
 * mark is what must never exceed the bound.
 */
import { describe, expect, it, vi } from 'vitest';
import { fanout, fanoutBound, fanoutSettled } from './fanout';

/** A task that holds a slot until released, recording the peak concurrency it observed. */
function tracker() {
	let inFlight = 0;
	let peak = 0;
	return {
		get peak() {
			return peak;
		},
		task: async <T>(value: T, delayMs = 5): Promise<T> => {
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			inFlight -= 1;
			return value;
		}
	};
}

describe('fanoutBound', () => {
	it('is a function of the pool size, never a constant', () => {
		expect(fanoutBound(30)).toBe(10);
		expect(fanoutBound(10)).toBe(3);
	});

	it('leaves room for other requests', () => {
		// A third of the pool: three dashboards can be mid-flight before it is fully
		// committed, and the sign-in page still gets a connection.
		expect(fanoutBound(12)).toBeLessThan(12);
	});

	it('never returns zero, however small the pool', () => {
		// A bound of 0 would deadlock — no worker would ever start.
		expect(fanoutBound(2)).toBe(1);
		expect(fanoutBound(1)).toBe(1);
	});
});

describe('fanout', () => {
	it('never runs more tasks at once than the bound', async () => {
		const t = tracker();
		const items = Array.from({ length: 20 }, (_, i) => i);

		await fanout(items, (item) => t.task(item), { bound: 3 });

		expect(t.peak).toBeLessThanOrEqual(3);
	});

	it('queues the excess instead of exhausting the pool', async () => {
		// Seven modules against a bound of two: everything completes, nothing runs early.
		const t = tracker();
		const results = await fanout([1, 2, 3, 4, 5, 6, 7], (n) => t.task(n * 10), { bound: 2 });

		expect(results).toEqual([10, 20, 30, 40, 50, 60, 70]);
		expect(t.peak).toBeLessThanOrEqual(2);
	});

	it('preserves input order regardless of completion order', async () => {
		// The dashboard renders module cards in a fixed order. A fan-out that returned them
		// in finishing order would shuffle the page differently on every load.
		const results = await fanout(
			[30, 10, 20],
			(ms) => new Promise<number>((resolve) => setTimeout(() => resolve(ms), ms)),
			{ bound: 3 }
		);
		expect(results).toEqual([30, 10, 20]);
	});

	it('keeps a worker busy rather than waiting for its batch', async () => {
		// A chunking implementation would stall on the slowest member of each chunk. With a
		// shared cursor, the two fast tasks are done long before the slow one.
		const started: number[] = [];
		await fanout(
			[50, 1, 1],
			async (ms, index) => {
				started.push(index);
				await new Promise((resolve) => setTimeout(resolve, ms));
			},
			{ bound: 2 }
		);
		expect(started).toEqual([0, 1, 2]);
	});

	it('rejects with the first failure once everything has settled', async () => {
		const t = tracker();
		let finished = 0;

		await expect(
			fanout(
				[1, 2, 3, 4],
				async (n) => {
					if (n === 2) throw new Error('inventory is unhappy');
					await t.task(n);
					finished += 1;
				},
				{ bound: 2 }
			)
		).rejects.toThrow('inventory is unhappy');

		// The other three ran to completion. Abandoning them would return their connections
		// to the pool at an unpredictable moment — the exact failure this module prevents.
		expect(finished).toBe(3);
		expect(t.peak).toBeLessThanOrEqual(2);
	});

	it('handles an empty list without starting a worker', async () => {
		const task = vi.fn();
		await expect(fanout([], task)).resolves.toEqual([]);
		expect(task).not.toHaveBeenCalled();
	});

	it('does not start more workers than there are items', async () => {
		const t = tracker();
		await fanout([1], (n) => t.task(n), { bound: 8 });
		expect(t.peak).toBe(1);
	});
});

describe('fanoutSettled', () => {
	it('lets one module fail without blanking the dashboard', async () => {
		// The design's premise is that modules are independent. A dashboard that dies
		// because Inventory is unhappy contradicts it.
		const results = await fanoutSettled(
			['quoting', 'inventory', 'invoicing'],
			async (key) => {
				if (key === 'inventory') throw new Error('unreachable');
				return `${key}-summary`;
			},
			{ bound: 2 }
		);

		expect(results).toEqual([
			{ status: 'ok', value: 'quoting-summary' },
			{ status: 'failed', error: expect.any(Error) },
			{ status: 'ok', value: 'invoicing-summary' }
		]);
	});

	it('respects the bound just as fanout does', async () => {
		const t = tracker();
		await fanoutSettled(
			Array.from({ length: 12 }, (_, i) => i),
			(n) => t.task(n),
			{ bound: 4 }
		);
		expect(t.peak).toBeLessThanOrEqual(4);
	});

	it('treats a bound below one as one', async () => {
		const t = tracker();
		await fanoutSettled([1, 2, 3], (n) => t.task(n), { bound: 0 });
		expect(t.peak).toBe(1);
	});
});
