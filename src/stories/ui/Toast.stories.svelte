<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { toast } from 'svelte-sonner';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Toast',
		component: Toaster,
		parameters: { layout: 'fullscreen' }
	});
</script>

<!--
	Toasts land on --surface-overlay, the same layer as a dialog.

	The undo toast is the one that matters to this product: the design's rule is that a
	reversible action is confirmed AFTER the fact with a way back, not before it with a
	dialog asking "are you sure". T13 builds the real one.
-->
<Story name="Toast" asChild>
	<Specimen title="Toast" note="Triggered, not forced open — sonner owns its own mount.">
		<div class="flex flex-wrap gap-3">
			<Button variant="secondary" onclick={() => toast('Quote saved.')}>Plain</Button>
			<Button variant="secondary" onclick={() => toast.success('Payment recorded.')}>
				Settled
			</Button>
			<Button
				variant="secondary"
				onclick={() => toast.error('That invoice could not be sent. Nothing was charged.')}
			>
				Wrong
			</Button>
			<Button
				onclick={() =>
					toast('Invoicing added to your plan.', {
						action: { label: 'Undo', onClick: () => toast('Reverted.') }
					})}
			>
				With undo
			</Button>
		</div>
		<Toaster />
	</Specimen>
</Story>
