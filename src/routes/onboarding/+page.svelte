<script lang="ts">
	// STUB AWAITING DESIGN (T06). See +page.server.ts.
	import { untrack } from 'svelte';
	import {
		Button,
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
		Field,
		FieldError,
		Input
	} from '$lib/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The form's starting value, deliberately captured once: after that the radio group owns
	// it, and re-deriving from props would discard what the person had picked.
	let brandColor = $state<string>(untrack(() => form?.values?.brandColor ?? data.defaultBrand));

	const value = (field: string) => form?.values?.[field] ?? '';
	const error = (field: string) => form?.errors?.[field];
</script>

<svelte:head><title>Set up your business · CJs</title></svelte:head>

<div class="mx-auto w-full max-w-lg px-4 py-12">
	<Card>
		<CardHeader>
			<CardTitle>Set up your business</CardTitle>
			<CardDescription>
				Welcome, {data.userName}. This is what goes on your quotes and invoices — you can change any
				of it later in Settings.
			</CardDescription>
		</CardHeader>

		<CardContent>
			<form method="POST" class="space-y-5">
				<Field label="Business name" id="tradingName" error={error('tradingName')}>
					{#snippet control(field)}
						<Input {...field} name="tradingName" required value={value('tradingName')} />
					{/snippet}
				</Field>

				<Field
					label="VAT number"
					id="vatNumber"
					error={error('vatNumber')}
					helper="Optional. Leave it blank if you are not VAT registered."
				>
					{#snippet control(field)}
						<Input {...field} name="vatNumber" inputmode="numeric" value={value('vatNumber')} />
					{/snippet}
				</Field>

				<Field label="Street address" id="addressLine1" error={error('addressLine1')}>
					{#snippet control(field)}
						<Input {...field} name="addressLine1" value={value('addressLine1')} />
					{/snippet}
				</Field>

				<div class="grid grid-cols-2 gap-3">
					<Field label="City" id="city" error={error('city')}>
						{#snippet control(field)}
							<Input {...field} name="city" value={value('city')} />
						{/snippet}
					</Field>
					<Field label="Postal code" id="postalCode" error={error('postalCode')}>
						{#snippet control(field)}
							<Input {...field} name="postalCode" inputmode="numeric" value={value('postalCode')} />
						{/snippet}
					</Field>
				</div>

				<Field label="Phone" id="phone" error={error('phone')}>
					{#snippet control(field)}
						<Input {...field} name="phone" type="tel" value={value('phone')} />
					{/snippet}
				</Field>

				<!--
					Only `--brand` is per-tenant; module accents and the neutral ramp stay fixed, so
					a client's colour can sit on a quote without fighting the interface.
				-->
				<fieldset class="space-y-2">
					<legend class="text-sm font-medium text-ink">Your colour</legend>
					<p class="text-xs text-ink-muted">Used for buttons and on the documents you send.</p>
					<div class="flex gap-3 pt-1">
						{#each data.brandOptions as option (option.value)}
							<label class="flex cursor-pointer flex-col items-center gap-1.5">
								<input
									type="radio"
									name="brandColor"
									value={option.value}
									bind:group={brandColor}
									class="peer sr-only"
									aria-describedby={error('brandColor') ? 'brandColor-message' : undefined}
								/>
								<span
									class="size-9 rounded-lg border-2 border-transparent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-focus-ring"
									class:!border-ink={brandColor === option.value}
									style="background: {option.value};"
								></span>
								<span class="text-xs text-ink-secondary">{option.label}</span>
							</label>
						{/each}
					</div>
					<!-- Captioned by a `<legend>`, so it takes the message atom rather than `Field`. -->
					<FieldError id="brandColor-message" error={error('brandColor')} />
				</fieldset>

				<Button type="submit" class="w-full">Create my business</Button>
			</form>
		</CardContent>
	</Card>
</div>
