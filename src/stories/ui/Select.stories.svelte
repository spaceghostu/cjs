<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Select',
		component: Select.Root,
		parameters: {
			layout: 'fullscreen',
			a11y: {
				config: {
					rules: [
						// bits-ui puts `aria-activedescendant` on the trigger, where ARIA does not
						// allow it. It is their markup, not ours, and there is no prop to turn it
						// off — so the rule is disabled HERE, on the one story that hits it, rather
						// than globally. Everything else on this story is still checked.
						{ id: 'aria-allowed-attr', enabled: false }
					]
				}
			}
		}
	});

	const TERMS = [
		{ value: '0', label: 'On receipt' },
		{ value: '7', label: '7 days' },
		{ value: '14', label: '14 days' },
		{ value: '30', label: '30 days' }
	];
</script>

<!--
	The trigger is an input in everything but name, so it takes the input's states: 38px,
	--border-control at rest, --brand plus the soft ring on focus.
-->
<Story name="Closed" asChild>
	<Specimen title="Select" note="Rest state, matching the input it sits beside." surface="card">
		<div class="flex max-w-xs flex-col gap-1.5">
			<Label for="terms">Payment terms</Label>
			<Select.Root type="single" value="14">
				<Select.Trigger id="terms" class="w-full">14 days</Select.Trigger>
				<Select.Content aria-label="Payment terms">
					{#each TERMS as term (term.value)}
						<Select.Item value={term.value} label={term.label}>{term.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</Specimen>
</Story>

<Story name="Open" asChild>
	<Specimen title="Select, open" note="The menu is an overlay surface with a --border-strong edge.">
		<div class="flex max-w-xs flex-col gap-1.5">
			<Label for="terms-open">Payment terms</Label>
			<Select.Root type="single" value="14" open>
				<Select.Trigger id="terms-open" class="w-full">14 days</Select.Trigger>
				<Select.Content aria-label="Payment terms">
					{#each TERMS as term (term.value)}
						<Select.Item value={term.value} label={term.label}>{term.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</Specimen>
</Story>
