<script lang="ts" module>
	import type { ModuleKey } from '$lib/core/modules/catalogue';
	import type { Money } from '$lib/core/money';
	import type { Access } from '$lib/core/modules/catalogue';

	/** The shape the server's `catalogueGroups()` hands down, minus what a row does not draw. */
	export type ListModule = {
		readonly key: ModuleKey;
		readonly label: string;
		readonly description: string;
		readonly accent: string;
		readonly price: Money;
		readonly access: Access;
	};

	export type ListGroup = {
		readonly label: string;
		readonly modules: readonly ListModule[];
	};
</script>

<script lang="ts">
	/**
	 * THE CATEGORISED LIST — the switcher's body, and the settings page's main content.
	 *
	 * Groups come from `catalogueGroups()` on the server, in the design's stored order (Sales,
	 * Operations, People). Nothing here knows a module name, which is what makes "adding an
	 * eighth module needs no UI change" true rather than aspirational.
	 *
	 * Shared between the dialog and the page on purpose: the two surfaces show the same rows,
	 * and two implementations of "the catalogue, as a list" would be two places for a module
	 * to go missing from.
	 */
	import ModuleRow from './ModuleRow.svelte';

	let {
		groups,
		canChange,
		onadd,
		onremove
	}: {
		groups: readonly ListGroup[];
		canChange: boolean;
		onadd: (key: ModuleKey) => void;
		onremove: (key: ModuleKey) => void;
	} = $props();
</script>

<div class="flex flex-col gap-5">
	{#each groups as group (group.label)}
		<div class="flex flex-col gap-1">
			<h3 class="px-3.5 pb-1 eyebrow text-ink-muted">{group.label}</h3>
			{#each group.modules as module (module.key)}
				<ModuleRow
					moduleKey={module.key}
					label={module.label}
					description={module.description}
					accent={module.accent}
					price={module.price}
					owned={module.access === 'write'}
					{canChange}
					{onadd}
					{onremove}
				/>
			{/each}
		</div>
	{:else}
		<!--
			Two ways to arrive here, and both are real: a filter that matched nothing, and a
			catalogue with nothing purchasable in it. The sentence covers both without claiming
			to know which, because the difference is visible to the person from the field above.
		-->
		<p class="px-3.5 py-8 text-center text-ui text-ink-secondary">No modules match that.</p>
	{/each}
</div>
