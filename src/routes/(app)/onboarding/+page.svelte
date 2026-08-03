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
		Input,
		Label
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
				<div class="space-y-2">
					<Label for="tradingName">Business name</Label>
					<Input
						id="tradingName"
						name="tradingName"
						required
						value={value('tradingName')}
						aria-invalid={error('tradingName') ? 'true' : undefined}
						aria-describedby={error('tradingName') ? 'tradingName-error' : undefined}
					/>
					{#if error('tradingName')}
						<p id="tradingName-error" class="text-xs text-wrong">{error('tradingName')}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="vatNumber">VAT number</Label>
					<Input
						id="vatNumber"
						name="vatNumber"
						inputmode="numeric"
						value={value('vatNumber')}
						aria-invalid={error('vatNumber') ? 'true' : undefined}
						aria-describedby="vatNumber-help"
					/>
					<p id="vatNumber-help" class="text-xs text-ink-muted">
						Optional. Leave it blank if you are not VAT registered.
					</p>
					{#if error('vatNumber')}
						<p class="text-xs text-wrong">{error('vatNumber')}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="addressLine1">Street address</Label>
					<Input id="addressLine1" name="addressLine1" value={value('addressLine1')} />
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-2">
						<Label for="city">City</Label>
						<Input id="city" name="city" value={value('city')} />
					</div>
					<div class="space-y-2">
						<Label for="postalCode">Postal code</Label>
						<Input
							id="postalCode"
							name="postalCode"
							inputmode="numeric"
							value={value('postalCode')}
						/>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="phone">Phone</Label>
					<Input id="phone" name="phone" type="tel" value={value('phone')} />
				</div>

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
					{#if error('brandColor')}
						<p class="text-xs text-wrong">{error('brandColor')}</p>
					{/if}
				</fieldset>

				<Button type="submit" class="w-full">Create my business</Button>
			</form>
		</CardContent>
	</Card>
</div>
