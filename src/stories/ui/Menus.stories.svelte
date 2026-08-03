<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Dropdown menu',
		component: DropdownMenu.Root,
		parameters: { layout: 'fullscreen' }
	});
</script>

<!--
	Same overlay treatment as the dialog and the select menu. Destructive items keep the
	--state-wrong text but never a fill: a red block in a menu reads as an error that has
	already happened rather than an action you could take.
-->
<Story name="Dropdown menu" asChild>
	<Specimen title="Dropdown menu" note="Open, with a destructive item.">
		<div class="flex h-72 items-start">
			<DropdownMenu.Root open>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button variant="secondary" {...props}>Invoice actions</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content class="w-56">
					<DropdownMenu.Group>
						<DropdownMenu.GroupHeading>INV-2041</DropdownMenu.GroupHeading>
						<DropdownMenu.Item>Record a payment</DropdownMenu.Item>
						<DropdownMenu.Item>Send a reminder</DropdownMenu.Item>
						<DropdownMenu.Item>Download PDF</DropdownMenu.Item>
					</DropdownMenu.Group>
					<DropdownMenu.Separator />
					<DropdownMenu.Item variant="destructive">Void this invoice</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</Specimen>
</Story>
