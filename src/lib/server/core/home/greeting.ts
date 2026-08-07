/**
 * "Friday evening, Chantal."
 *
 * The design's second line, and it is doing more work than it looks like: it establishes that
 * the product knows when you are and who you are before it tells you that nothing needs you.
 * A dashboard that opened with "Good day, user" would spend the rest of the screen earning
 * back the trust that line lost.
 *
 * Computed on the SERVER, like every other date in this codebase. A `new Date()` in the
 * component renders one greeting during SSR and possibly a different one in the browser —
 * which, for this particular string, means the page visibly changes what time of day it is
 * as it hydrates.
 */
import { BILLING_OFFSET_MINUTES } from '$lib/core/money';

const MS_PER_MINUTE = 60_000;

/**
 * The one timezone this product knows.
 *
 * `BILLING_OFFSET_MINUTES` is SAST, fixed at UTC+2 with no daylight saving, and it is what
 * every billing day boundary already uses. Borrowing it here keeps the greeting, the agenda
 * and the invoice dates on one calendar; the day a business outside SAST exists, this and
 * `proration.ts` want the same fix, and they should get it together.
 */
function localParts(now: Date): { hour: number; shifted: Date } {
	const shifted = new Date(now.getTime() + BILLING_OFFSET_MINUTES * MS_PER_MINUTE);
	return { hour: shifted.getUTCHours(), shifted };
}

/**
 * Morning, afternoon, evening, night — the four a person would use out loud.
 *
 * Boundaries are deliberately generous at the ends: someone opening the product at 22:30 is
 * having a night, and being told it is the evening reads as a machine guessing.
 */
export function partOfDay(now: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
	const { hour } = localParts(now);
	if (hour < 5) return 'night';
	if (hour < 12) return 'morning';
	if (hour < 17) return 'afternoon';
	if (hour < 22) return 'evening';
	return 'night';
}

/**
 * The whole line. The name is optional, because a person who has not given one gets a
 * greeting rather than an apology for not knowing it.
 */
export function greeting(now: Date, locale: string, name: string | null): string {
	const { shifted } = localParts(now);
	const weekday = shifted.toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
	const when = `${weekday} ${partOfDay(now)}`;

	const first = (name ?? '').trim().split(/\s+/)[0];
	return first ? `${when}, ${first}.` : `${when}.`;
}
