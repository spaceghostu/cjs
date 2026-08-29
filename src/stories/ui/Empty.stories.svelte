<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Package from '@lucide/svelte/icons/package';
	import Plus from '@lucide/svelte/icons/plus';
	import Receipt from '@lucide/svelte/icons/receipt';
	import { Button, EmptyState, NoMatches } from '$lib/ui';
	import { emptyCopy as inventoryEmptyCopy } from '$lib/core/inventory';
	import { emptyCopy as invoicingEmptyCopy } from '$lib/core/invoicing';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Empty',
		component: EmptyState,
		parameters: { layout: 'fullscreen' }
	});
</script>

{#snippet addAnItem()}
	<Button>
		<Plus class="size-4" aria-hidden="true" />
		Add an item
	</Button>
{/snippet}

<!--
	THE TWO EMPTY STATES, SIDE BY SIDE, IN ONE FILE — because the whole point of them is that
	they are DIFFERENT, and two story files would let that difference drift apart unwatched. A
	module with nothing in it gets a panel with a way out of itself; a filter that matched
	nothing gets one sentence and nothing offered.

	Every sentence here comes from the real `emptyCopy()` — inventory's and invoicing's — rather
	than from a plausible-looking invention, the same discipline `Field.stories.svelte` keeps by
	passing its fixtures to the real `checkAmount`. What is drawn is what a person sees.
-->
<Story name="Empty module" asChild>
	<Specimen
		title="An empty module"
		note="A panel, not a sentence, because the way out of it is a button. Calm by construction: no tint, no state colour, nothing announced — an empty module is not an error."
		surface="base"
	>
		<div class="max-w-2xl">
			<EmptyState
				icon={Package}
				accentClass="text-inventory"
				heading="Nothing in your stock yet"
				body={inventoryEmptyCopy('all')}
				action={addAnItem}
			/>
		</div>
	</Specimen>
</Story>

<Story name="Empty module, read only" asChild>
	<Specimen
		title="An empty module a person may only read"
		note="The same panel with no action, which is what a removed module's list shows. The heading and the sentence still explain the state; there is simply nothing this person can do about it here."
		surface="base"
	>
		<div class="max-w-2xl">
			<EmptyState
				icon={Receipt}
				accentClass="text-invoicing"
				heading="Nothing invoiced yet"
				body={invoicingEmptyCopy('all')}
			/>
		</div>
	</Specimen>
</Story>

<Story name="Filter matched nothing" asChild>
	<Specimen
		title="A filter that matched nothing"
		note="One line, no panel, and deliberately no call to action. Offering 'New invoice' beneath an empty Overdue tab would be the interface misreading good news as a lack."
		surface="base"
	>
		<div class="max-w-2xl">
			<NoMatches message={invoicingEmptyCopy('overdue')} />
		</div>
	</Specimen>
</Story>
