<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Tabs',
		component: Tabs.Root,
		parameters: { layout: 'fullscreen' }
	});
</script>

<Story name="Tabs" asChild>
	<Specimen
		title="Tabs"
		note="Both variants. The focus ring is the same 2px --brand-focus-ring at 2px offset as every other control."
		surface="card"
	>
		<div class="flex max-w-lg flex-col gap-8">
			<Tabs.Root value="unpaid">
				<Tabs.List>
					<Tabs.Trigger value="unpaid">Unpaid</Tabs.Trigger>
					<Tabs.Trigger value="paid">Paid</Tabs.Trigger>
					<Tabs.Trigger value="draft">Drafts</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="unpaid" class="pt-4 text-ink-secondary">
					Six invoices, R84 200 outstanding.
				</Tabs.Content>
				<Tabs.Content value="paid" class="pt-4 text-ink-secondary">Nothing to chase.</Tabs.Content>
				<Tabs.Content value="draft" class="pt-4 text-ink-secondary">
					Two drafts waiting on you.
				</Tabs.Content>
			</Tabs.Root>

			<Tabs.Root value="details">
				<Tabs.List variant="line">
					<Tabs.Trigger value="details">Details</Tabs.Trigger>
					<Tabs.Trigger value="history">History</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="details" class="pt-4 text-ink-secondary">
					Line items, totals and terms.
				</Tabs.Content>
				<Tabs.Content value="history" class="pt-4 text-ink-secondary">
					Sent, viewed, part-paid.
				</Tabs.Content>
			</Tabs.Root>
		</div>
	</Specimen>
</Story>
