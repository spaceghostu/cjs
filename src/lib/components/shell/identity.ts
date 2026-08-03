/**
 * The two strings the shell puts next to a person and a business.
 *
 * Small enough to look like it does not need a file, and it does: the tenant square appears
 * in the sidebar and again in the mobile header, the avatar appears in the top bar and again
 * in the mobile header, and four hand-rolled `.split(' ')[0][0]` expressions would disagree
 * about a one-word name or a name with an accent on the first letter.
 */

/**
 * Up to two letters, from the first and last word.
 *
 * "Thornhill Joinery" -> TJ. "Thornhill" -> TH, not T: one letter in a 30px square reads as
 * a mistake. Empty input gives an empty string rather than a placeholder glyph — the caller
 * hides the square, because a business with no name cannot exist (`core_business` has a
 * NOT NULL check on it) and inventing a "?" for a case the database forbids is noise.
 */
export function initialsOf(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return '';

	if (words.length === 1) {
		return [...words[0]].slice(0, 2).join('').toUpperCase();
	}

	const first = [...words[0]][0] ?? '';
	const last = [...words[words.length - 1]][0] ?? '';
	return (first + last).toUpperCase();
}

const ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
	owner: 'Owner',
	staff: 'Staff'
});

/**
 * "Owner · Cape Town", the design's sidebar subtitle.
 *
 * The city is optional — it is a nullable column, and a business that has not filled in its
 * address must not get a dangling separator. So the parts are joined, not concatenated.
 */
export function tenantSubtitle(role: string, city: string | null): string {
	return [ROLE_LABELS[role] ?? role, city].filter(Boolean).join(' · ');
}
