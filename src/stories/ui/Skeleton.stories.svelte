<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Skeleton',
		component: Skeleton,
		parameters: { layout: 'fullscreen' }
	});
</script>

<!--
	A skeleton, never a spinner over content. A spinner says "wait"; a skeleton says "here
	is the shape of what is coming", and only the second one lowers anxiety about whether
	the thing you just did worked.
-->
<Story name="Tones" asChild>
	<Specimen
		title="Skeleton"
		note="10px bars at a 5px radius, in three tones. Vary the tone and the width — never the height — so a block reads as a paragraph rather than a wall."
		surface="card"
	>
		<div class="flex max-w-md flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Skeleton class="w-40" />
				<Skeleton tone="raised" class="w-64" />
				<Skeleton tone="quiet" class="w-28" />
			</div>
			<p class="text-helper text-ink-muted">default · raised · quiet</p>
		</div>
	</Specimen>
</Story>

<Story name="Loading a list" asChild>
	<Specimen
		title="An invoice list, loading"
		note="The skeleton holds the row rhythm of the real table, so nothing jumps when the data lands."
		surface="card"
	>
		<div class="max-w-lg divide-y divide-line-row">
			{#each [{ ref: 'w-20', who: 'w-40', amount: 'w-16' }, { ref: 'w-20', who: 'w-56', amount: 'w-20' }, { ref: 'w-20', who: 'w-32', amount: 'w-14' }, { ref: 'w-20', who: 'w-48', amount: 'w-24' }] as row, i (i)}
				<div class="flex items-center gap-4 py-3.5">
					<Skeleton tone="quiet" class={row.ref} />
					<Skeleton class={row.who} />
					<Skeleton tone="raised" class="ml-auto {row.amount}" />
				</div>
			{/each}
		</div>
	</Specimen>
</Story>
