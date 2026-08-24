<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import {
		Field,
		FieldError,
		Input,
		MoneyField,
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger,
		Textarea
	} from '$lib/ui';
	import { checkAmount, checkQuantity } from '$lib/core/validation';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Field',
		component: Field,
		parameters: { layout: 'fullscreen' }
	});

	/**
	 * Fixed strings, not `$state`, because a story is a specimen: the invalid field has to be
	 * invalid the moment it renders, in both themes, without anybody typing. The money stories
	 * below pass these to the real `checkAmount`/`checkQuantity`, so what is drawn is the money
	 * core's actual sentence rather than a plausible-looking one written here.
	 */
	const TOO_PRECISE = '10.005';
	const NOT_A_NUMBER = 'two hundred';
</script>

<!--
	The three states the design names, on the surface a form actually sits on.

	Invalid is the interesting one: the border is `--state-wrong-border` because `aria-invalid`
	is set, not because anything here painted it, and the message beneath is `--state-wrong` at
	12px. The field keeps `thornhill@` — an invalid value is somebody's work in progress and
	clearing it is taking that work away as a punishment for a typo.
-->
<Story name="States" asChild>
	<Specimen
		title="Field states"
		note="Label, control, and one 12px line beneath — the helper when the field is fine, the message when it is not. The message replaces the helper rather than joining it, and aria-describedby follows whichever is showing."
		surface="card"
	>
		<div class="flex max-w-sm flex-col gap-5">
			<Field label="Customer">
				{#snippet control(field)}
					<Input {...field} placeholder="Search or add a customer" />
				{/snippet}
			</Field>

			<Field label="VAT number" helper="Leave blank if you are not VAT registered.">
				{#snippet control(field)}
					<Input {...field} value="4130155289" inputmode="numeric" />
				{/snippet}
			</Field>

			<Field label="Email" error="That address is missing everything after the @.">
				{#snippet control(field)}
					<Input {...field} value="thornhill@" type="email" />
				{/snippet}
			</Field>

			<Field label="Invoice number" disabled helper="Numbering is not editable.">
				{#snippet control(field)}
					<Input {...field} value="INV-2041" numeric />
				{/snippet}
			</Field>
		</div>
	</Specimen>
</Story>

<!--
	One wrapper, every control. The point of handing the wiring to a snippet instead of
	rendering the control here: a textarea and a select get the same id, the same
	`aria-describedby` and the same red border from the same three attributes.
-->
<Story name="Every control" asChild>
	<Specimen
		title="Input, Textarea and Select"
		note="The same field around three different controls, each in its invalid state. Nothing here styles a border — the vendored controls all carry aria-invalid:border-wrong-border, and the field only sets the attribute."
		surface="card"
	>
		<div class="flex max-w-sm flex-col gap-5">
			<Field label="Business name" error="Your business needs a name.">
				{#snippet control(field)}
					<Input {...field} value="" />
				{/snippet}
			</Field>

			<Field
				label="Note to the customer"
				error="That is longer than a note — 500 characters is the most that fits."
			>
				{#snippet control(field)}
					<Textarea {...field} value="Anything they should know before they accept." rows={3} />
				{/snippet}
			</Field>

			<Field label="How" error="Choose how the money arrived.">
				{#snippet control(field)}
					<Select type="single">
						<SelectTrigger {...field} class="w-full">Choose a method</SelectTrigger>
						<SelectContent>
							<SelectItem value="eft">EFT</SelectItem>
							<SelectItem value="cash">Cash</SelectItem>
						</SelectContent>
					</Select>
				{/snippet}
			</Field>
		</div>
	</Specimen>
</Story>

<!--
	A money field renders the money core's answer as it stands — including the offer, which is
	the design's "did you mean" arriving through `checkAmount` rather than being written twice.
	Note what has NOT happened: `10.005` is still in the box. The offer is offered.
-->
<Story name="Money and quantity" asChild>
	<Specimen
		title="Money and quantity"
		note="Mono and tabular while it is being typed. The component parses nothing — the caller asks checkAmount/checkQuantity and hands the result over whole, which is what the message is rendered from."
		surface="card"
	>
		<div class="flex max-w-sm flex-col gap-5">
			<MoneyField
				label="Amount"
				value="1 250,00"
				result={checkAmount('1 250,00')}
				helper="Defaults to the full balance. Change it if they paid part of it."
			/>

			<MoneyField label="Amount" value={TOO_PRECISE} result={checkAmount(TOO_PRECISE)} />

			<MoneyField label="Quantity" value={NOT_A_NUMBER} result={checkQuantity(NOT_A_NUMBER)} />

			<MoneyField label="Unit price" value="2 300,00" disabled helper="Set by the price list." />
		</div>
	</Specimen>
</Story>

<!--
	The message on its own, for the two places a labelled wrapper is the wrong shape: a table
	row, where one message spans four columns rather than sitting inside a 68px cell, and a
	fieldset captioned by a `<legend>`.
-->
<Story name="Message alone" asChild>
	<Specimen
		title="FieldError"
		note="The same paragraph a Field renders, exported on its own so a line table and a radio fieldset say it the same way. It renders nothing at all when there is nothing to say."
		surface="card"
	>
		<div class="flex max-w-md flex-col gap-4">
			<div class="grid grid-cols-[1fr_68px_108px] items-start gap-3">
				<Input value="European oak, 40mm board" class="h-8" aria-label="Item 1 description" />
				<Input
					value="two"
					numeric
					class="h-8 px-2 text-right"
					aria-invalid="true"
					aria-label="Item 1 quantity"
				/>
				<Input
					value="1 780,00"
					numeric
					class="h-8 px-2 text-right"
					aria-label="Item 1 unit price"
				/>
				<FieldError result={checkQuantity('two')} class="col-span-3" />
			</div>

			<FieldError error="Pick a colour to carry onto your documents." />
		</div>
	</Specimen>
</Story>
