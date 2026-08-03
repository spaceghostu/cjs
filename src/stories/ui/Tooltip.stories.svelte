<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Tooltip',
		component: Tooltip.Root,
		parameters: { layout: 'fullscreen' }
	});
</script>

<!--
	shadcn inverts the tooltip out of the palette (foreground on background). Here it joins
	the overlay family instead — same surface and edge as a dialog or a menu — because an
	inverted chip is the one thing on screen that belongs to no layer.
-->
<Story name="Tooltip" asChild>
	<Specimen title="Tooltip" note="Open, on --surface-overlay behind a --border-strong edge.">
		<div class="flex h-40 items-center justify-center">
			<Tooltip.Provider>
				<Tooltip.Root open delayDuration={0}>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button variant="secondary" {...props}>Why is this locked?</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="bottom">Invoicing is not on your plan yet.</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>
		</div>
	</Specimen>
</Story>
