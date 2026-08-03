<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Dialog',
		component: Dialog.Root,
		parameters: { layout: 'fullscreen' }
	});
</script>

<!--
	--surface-overlay behind a --border-strong edge at a 14px radius — the dialog is the
	topmost layer in the system, so it gets the strongest edge.

	Rendered open, because a closed dialog is not a specimen of anything.
-->
<Story name="Dialog" asChild>
	<Specimen title="Dialog" note="Open, with the design's confirm/cancel pairing.">
		<Dialog.Root open>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Add Invoicing to your plan?</Dialog.Title>
					<Dialog.Description>
						R450 becomes R570 a month. The change applies from today and is prorated for the rest of
						this billing month.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer showCloseButton={false}>
					<Button variant="quiet">Not now</Button>
					<Button>Add Invoicing</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	</Specimen>
</Story>
