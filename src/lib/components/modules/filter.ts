/**
 * "Find a module" — narrowing across name AND description.
 *
 * Description matters as much as name here, and this is the one place that is true. Somebody
 * looking for the thing that chases unpaid bills types "reminders", which appears nowhere in
 * the word "Invoicing" and is the second word of its description. A name-only filter answers
 * "nothing matches that" to a person looking straight at the module they want.
 *
 * Pure, so the switcher's most fiddly behaviour is testable without a browser.
 */
export type Filterable = {
	readonly label: string;
	readonly description: string;
};

export type FilterableGroup<T extends Filterable> = {
	readonly label: string;
	readonly modules: readonly T[];
};

function matches(module: Filterable, needle: string): boolean {
	return (
		module.label.toLowerCase().includes(needle) || module.description.toLowerCase().includes(needle)
	);
}

/**
 * Groups with non-matching modules removed, and empty groups dropped.
 *
 * A blank query returns the groups untouched — including their identity, so Svelte's keyed
 * each does not tear down and rebuild every row on the way back to an empty field.
 */
export function filterGroups<T extends Filterable, G extends FilterableGroup<T>>(
	groups: readonly G[],
	query: string
): readonly G[] {
	const needle = query.trim().toLowerCase();
	if (needle.length === 0) return groups;

	return groups.flatMap((group) => {
		const modules = group.modules.filter((m) => matches(m, needle));
		return modules.length > 0 ? [{ ...group, modules }] : [];
	});
}

/** How many modules survive a filter. The switcher announces this for screen readers. */
export function countModules<T extends Filterable>(groups: readonly FilterableGroup<T>[]): number {
	return groups.reduce((total, group) => total + group.modules.length, 0);
}
