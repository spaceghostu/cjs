<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Badge',
		component: Badge,
		parameters: { layout: 'fullscreen' }
	});

	const BADGES: { variant: BadgeVariant; label: string; note: string }[] = [
		{ variant: 'settled', label: 'Paid', note: '--state-settled at 15%' },
		{ variant: 'sent', label: 'Sent', note: '--surface-raised / --text-secondary' },
		{ variant: 'attention', label: 'Due in 3 days', note: '--state-attention at 15%' },
		{ variant: 'wrong', label: 'Overdue', note: '--state-wrong at 15%' },
		{ variant: 'draft', label: 'Draft', note: '--surface-quiet / --text-muted' },
		{
			variant: 'assisted',
			label: 'Drafted for you · check it',
			note: 'quoting accent at 15%'
		}
	];
</script>

<!--
	Six badges, named by meaning rather than by the words they carry — "Due in 3 days" and
	"Due in 12 days" are the same badge. Sent and Draft stay colourless on purpose: neither
	is a state worth spending colour on, and if everything is coloured nothing is.
-->
<Story name="Statuses" asChild>
	<Specimen
		title="Status badges"
		note="All six at 12px, 5px radius, 4px/9px padding. Shown on a card, which is where they actually appear."
		surface="card"
	>
		<div class="flex flex-col gap-3">
			{#each BADGES as { variant, label, note } (variant)}
				<div class="flex items-center gap-4">
					<span class="w-56"><Badge {variant}>{label}</Badge></span>
					<span class="text-helper text-ink-muted">{note}</span>
				</div>
			{/each}
		</div>
	</Specimen>
</Story>

<Story name="In a row" asChild>
	<Specimen
		title="Badges in a list"
		note="What the invoice list actually looks like — the badge is the only colour in the row."
		surface="card"
	>
		<div class="max-w-lg divide-y divide-line-row">
			{#each [{ ref: 'INV-2041', who: 'Thornhill Joinery', variant: 'settled' as const, label: 'Paid' }, { ref: 'INV-2042', who: 'Bracken & Co', variant: 'attention' as const, label: 'Due in 3 days' }, { ref: 'INV-2043', who: 'Marsh Interiors', variant: 'wrong' as const, label: 'Overdue' }, { ref: 'INV-2044', who: 'Held Studio', variant: 'draft' as const, label: 'Draft' }] as row (row.ref)}
				<div class="flex items-center gap-4 py-3">
					<span class="w-24 numeric text-ui text-ink-muted">{row.ref}</span>
					<span class="flex-1 text-ui text-ink">{row.who}</span>
					<Badge variant={row.variant}>{row.label}</Badge>
				</div>
			{/each}
		</div>
	</Specimen>
</Story>
