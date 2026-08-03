<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Input',
		component: Input,
		parameters: { layout: 'fullscreen' }
	});
</script>

<!--
	Rest, focus and invalid, exactly as the design states them. The invalid field carries
	its message below in --state-wrong and points at it with aria-describedby, because a
	red border alone says "something is wrong" without saying what.
-->
<Story name="States" asChild>
	<Specimen
		title="Input states"
		note="38px tall, 8px radius. Rest is --border-control on --surface-card; focus turns the border --brand and adds a 2px soft brand ring at 1px offset; invalid turns the border --state-wrong-border."
		surface="card"
	>
		<div class="flex max-w-sm flex-col gap-5">
			<div class="flex flex-col gap-1.5">
				<Label for="rest">Customer</Label>
				<Input id="rest" placeholder="Search or add a customer" />
			</div>

			<div class="flex flex-col gap-1.5">
				<Label for="focused">Reference</Label>
				<!-- Focus cannot be forced from markup in a static story, so the ring is drawn. -->
				<Input
					id="focused"
					value="Kitchen fit-out"
					class="border-brand outline-2 outline-offset-1 outline-brand-ring-soft"
				/>
				<p class="text-helper text-ink-muted">focus</p>
			</div>

			<div class="flex flex-col gap-1.5">
				<Label for="invalid">Email</Label>
				<Input id="invalid" value="thornhill@" aria-invalid="true" aria-describedby="invalid-msg" />
				<p id="invalid-msg" class="text-helper text-wrong">
					That address is missing everything after the @.
				</p>
			</div>

			<div class="flex flex-col gap-1.5">
				<Label for="disabled">Invoice number</Label>
				<Input id="disabled" value="INV-2041" numeric disabled />
				<p class="text-helper text-ink-muted">disabled — numbering is not editable</p>
			</div>
		</div>
	</Specimen>
</Story>

<Story name="Numeric" asChild>
	<Specimen
		title="Numeric fields"
		note="Anything holding an amount, quantity or price is mono and tabular — including while it is being typed, so the digits do not shift under the cursor."
		surface="card"
	>
		<div class="flex max-w-xs flex-col gap-4">
			<div class="flex flex-col gap-1.5">
				<Label for="qty">Quantity</Label>
				<Input id="qty" numeric inputmode="decimal" value="2" class="text-right" />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="price">Unit price</Label>
				<Input id="price" numeric inputmode="decimal" value="2 300,00" class="text-right" />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="notes">Note to the customer</Label>
				<Textarea id="notes" placeholder="Anything they should know before they accept." />
			</div>
		</div>
	</Specimen>
</Story>
