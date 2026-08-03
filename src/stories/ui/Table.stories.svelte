<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Table',
		component: Table.Root,
		parameters: { layout: 'fullscreen' }
	});

	const ROWS = [
		{ ref: 'INV-2041', who: 'Thornhill Joinery', due: '2026-08-01', amount: '24 150,00' },
		{ ref: 'INV-2042', who: 'Bracken & Co', due: '2026-08-14', amount: '4 600,00' },
		{ ref: 'INV-2043', who: 'Marsh Interiors', due: '2026-07-18', amount: '138 900,00' },
		{ ref: 'INV-2044', who: 'Held Studio', due: '2026-08-22', amount: '920,00' }
	] as const;
</script>

<!--
	Row separators are --border-row, the faintest line in the system — a table of twenty
	invoices should read as a list, not as a grid. Every numeral column is mono and
	tabular and right-aligned, so magnitudes line up on the decimal and a reader can see
	R138 900 is the big one without reading a digit.
-->
<Story name="Table" asChild>
	<Specimen
		title="Table"
		note="14px cells, quiet 12px headers, --border-row separators."
		surface="card"
	>
		<div class="max-w-3xl">
			<Table.Root>
				<Table.Caption>Unpaid invoices, oldest due date first.</Table.Caption>
				<Table.Header>
					<Table.Row>
						<Table.Head>Invoice</Table.Head>
						<Table.Head>Customer</Table.Head>
						<Table.Head>Due</Table.Head>
						<Table.Head class="text-right">Amount</Table.Head>
						<Table.Head class="text-right">Status</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each ROWS as row (row.ref)}
						<Table.Row>
							<Table.Cell class="numeric text-ink-secondary">{row.ref}</Table.Cell>
							<Table.Cell class="text-ink">{row.who}</Table.Cell>
							<Table.Cell class="numeric text-ink-muted">{row.due}</Table.Cell>
							<Table.Cell class="text-right numeric text-ink">{row.amount}</Table.Cell>
							<Table.Cell class="text-right">
								<Badge variant={row.ref === 'INV-2043' ? 'wrong' : 'sent'}>
									{row.ref === 'INV-2043' ? 'Overdue' : 'Sent'}
								</Badge>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</Specimen>
</Story>
