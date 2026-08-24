<script lang="ts">
	// STUB AWAITING DESIGN (T06). See +page.server.ts.
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import {
		Badge,
		Button,
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
		Field,
		FieldError,
		Input,
		Separator
	} from '$lib/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The form's starting value, deliberately captured once: after that the radio group owns
	// it, and re-deriving from props would discard what the person had picked.
	let brandColor = $state<string>(
		untrack(() => form?.values?.brandColor ?? data.business.brandColor)
	);

	const saved = $derived(page.url.searchParams.has('saved'));

	function value(field: string, fallback: string | null): string {
		return form?.values?.[field] ?? fallback ?? '';
	}
	const error = (field: string) => form?.errors?.[field];
</script>

<svelte:head><title>Settings · CJs</title></svelte:head>

<div class="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight text-ink">Settings</h1>
		<p class="mt-1 text-sm text-ink-secondary">{data.business.tradingName}</p>
	</div>

	{#if saved && !form}
		<p class="rounded-lg bg-settled-tint px-4 py-3 text-sm text-settled-ink">Saved.</p>
	{/if}

	<Card>
		<CardHeader>
			<CardTitle>Business details</CardTitle>
			<CardDescription>This is what appears on the documents you send.</CardDescription>
		</CardHeader>
		<CardContent>
			<form method="POST" action="?/details" class="space-y-5">
				<Field label="Business name" id="tradingName" error={error('tradingName')}>
					{#snippet control(field)}
						<Input
							{...field}
							name="tradingName"
							required
							value={value('tradingName', data.business.tradingName)}
						/>
					{/snippet}
				</Field>

				<div class="grid gap-3 sm:grid-cols-2">
					<Field label="Registered name" id="legalName" error={error('legalName')}>
						{#snippet control(field)}
							<Input
								{...field}
								name="legalName"
								value={value('legalName', data.business.legalName)}
							/>
						{/snippet}
					</Field>
					<Field
						label="Registration number"
						id="registrationNumber"
						error={error('registrationNumber')}
					>
						{#snippet control(field)}
							<Input
								{...field}
								name="registrationNumber"
								value={value('registrationNumber', data.business.registrationNumber)}
							/>
						{/snippet}
					</Field>
				</div>

				<div class="grid gap-3 sm:grid-cols-2">
					<Field
						label="VAT number"
						id="vatNumber"
						error={error('vatNumber')}
						helper="Leave blank if you are not VAT registered."
					>
						{#snippet control(field)}
							<Input
								{...field}
								name="vatNumber"
								inputmode="numeric"
								value={value('vatNumber', data.business.vatNumber)}
							/>
						{/snippet}
					</Field>
					<Field label="Phone" id="phone" error={error('phone')}>
						{#snippet control(field)}
							<Input
								{...field}
								name="phone"
								type="tel"
								value={value('phone', data.business.phone)}
							/>
						{/snippet}
					</Field>
				</div>

				<Field label="Email" id="email" error={error('email')}>
					{#snippet control(field)}
						<Input
							{...field}
							name="email"
							type="email"
							value={value('email', data.business.email)}
						/>
					{/snippet}
				</Field>

				<Separator />

				<!--
					Two fields, one caption. The second line's label is real but off the screen: an
					address has a second line often enough to deserve a box and rarely enough that
					captioning it twice would read as two different questions.
				-->
				<div class="flex flex-col gap-1.5">
					<Field label="Street address" id="addressLine1" error={error('addressLine1')}>
						{#snippet control(field)}
							<Input
								{...field}
								name="addressLine1"
								value={value('addressLine1', data.business.address.line1)}
							/>
						{/snippet}
					</Field>
					<Field label="Address line 2" labelHidden id="addressLine2" error={error('addressLine2')}>
						{#snippet control(field)}
							<Input
								{...field}
								name="addressLine2"
								value={value('addressLine2', data.business.address.line2)}
							/>
						{/snippet}
					</Field>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<Field label="City" id="city" error={error('city')}>
						{#snippet control(field)}
							<Input {...field} name="city" value={value('city', data.business.address.city)} />
						{/snippet}
					</Field>
					<Field label="Postal code" id="postalCode" error={error('postalCode')}>
						{#snippet control(field)}
							<Input
								{...field}
								name="postalCode"
								inputmode="numeric"
								value={value('postalCode', data.business.address.postalCode)}
							/>
						{/snippet}
					</Field>
				</div>

				<Separator />

				<fieldset class="space-y-2">
					<legend class="text-sm font-medium text-ink">Your colour</legend>
					<p class="text-xs text-ink-muted">
						Used for buttons and on the documents you send. Module colours never change.
					</p>
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
					<!--
						A `<legend>` captions this, not a `<label>`, so `Field` is the wrong shape for
						it — but the sentence underneath is the same sentence in the same colour at the
						same size, because it is the same paragraph.
					-->
					<FieldError id="brandColor-message" error={error('brandColor')} />
				</fieldset>

				<Button type="submit">Save changes</Button>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>People</CardTitle>
			<CardDescription>
				Who can act for this business. Inviting people arrives with the designed screens.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-3">
			{#each data.members as member (member.id)}
				<div
					class="flex items-center justify-between gap-4 border-b border-line-row pb-3 last:border-0 last:pb-0"
				>
					<div class="min-w-0">
						<p class="truncate text-sm text-ink">{member.name}</p>
						<p class="truncate text-xs text-ink-muted">{member.email}</p>
					</div>
					<!-- The badge set is document statuses; `sent` and `draft` are its two neutral chips. -->
					<Badge variant={member.role === 'owner' ? 'sent' : 'draft'}>
						{member.role === 'owner' ? 'Owner' : 'Staff'}
					</Badge>
				</div>
			{/each}
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Billing</CardTitle>
			<CardDescription>What you pay for, and when.</CardDescription>
		</CardHeader>
		<CardContent>
			<!--
				T12 fills this in: the module list, the running total, proration and the
				add/remove confirmation. Deliberately empty rather than mocked — a fake total
				is worse than an honest absence on the screen that handles someone's money.
			-->
			<p class="text-sm text-ink-secondary">
				{#if data.isOwner}
					Modules and billing arrive with the module catalogue. Nothing is being charged yet.
				{:else}
					Only owners can change modules and billing.
				{/if}
			</p>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Export your data</CardTitle>
			<CardDescription>Yours to take, any time.</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<p class="text-sm text-ink-secondary">
				Everything this business has, as one CSV per table in a zip. Nothing is withheld, and
				exporting changes nothing — you can do it as often as you like.
			</p>
			<Button href="/settings/export" variant="secondary" data-sveltekit-reload>
				Download everything
			</Button>
		</CardContent>
	</Card>
</div>
