<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Card',
		component: Card.Root,
		parameters: { layout: 'fullscreen' }
	});
</script>

<!--
	--surface-card with a --border-default outline at a 12px radius. No shadow: depth in
	this system comes from the layer a thing sits on, not from a glow underneath it.
-->
<Story name="Card" asChild>
	<Specimen
		title="Card"
		note="On --surface-base, which is the only place a card ever sits."
		surface="base"
	>
		<div class="grid max-w-3xl gap-4 sm:grid-cols-2">
			<Card.Root>
				<Card.Header>
					<Card.Title>Outstanding</Card.Title>
					<Card.Description>Across 6 unpaid invoices.</Card.Description>
					<Card.Action><Badge variant="attention">2 due soon</Badge></Card.Action>
				</Card.Header>
				<Card.Content>
					<p class="numeric text-hero text-ink">R84 200</p>
				</Card.Content>
				<Card.Footer>
					<Button variant="quiet" size="sm">See invoices</Button>
				</Card.Footer>
			</Card.Root>

			<Card.Root size="sm">
				<Card.Header>
					<Card.Title>Quote Q-2041</Card.Title>
					<Card.Description>Thornhill Joinery · 3 of 5 items priced</Card.Description>
				</Card.Header>
				<Card.Content>
					<p class="text-ui text-ink-secondary">
						Picked up where you left off. Nothing has been sent yet.
					</p>
				</Card.Content>
				<Card.Footer>
					<Button size="sm">Resume</Button>
				</Card.Footer>
			</Card.Root>
		</div>
	</Specimen>
</Story>
