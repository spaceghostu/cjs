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
		Input,
		Label,
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
				<div class="space-y-2">
					<Label for="tradingName">Business name</Label>
					<Input
						id="tradingName"
						name="tradingName"
						required
						value={value('tradingName', data.business.tradingName)}
						aria-invalid={error('tradingName') ? 'true' : undefined}
					/>
					{#if error('tradingName')}
						<p class="text-xs text-wrong">{error('tradingName')}</p>
					{/if}
				</div>

				<div class="grid gap-3 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="legalName">Registered name</Label>
						<Input
							id="legalName"
							name="legalName"
							value={value('legalName', data.business.legalName)}
						/>
					</div>
					<div class="space-y-2">
						<Label for="registrationNumber">Registration number</Label>
						<Input
							id="registrationNumber"
							name="registrationNumber"
							value={value('registrationNumber', data.business.registrationNumber)}
						/>
					</div>
				</div>

				<div class="grid gap-3 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="vatNumber">VAT number</Label>
						<Input
							id="vatNumber"
							name="vatNumber"
							inputmode="numeric"
							value={value('vatNumber', data.business.vatNumber)}
							aria-invalid={error('vatNumber') ? 'true' : undefined}
						/>
						{#if error('vatNumber')}
							<p class="text-xs text-wrong">{error('vatNumber')}</p>
						{:else}
							<p class="text-xs text-ink-muted">Leave blank if you are not VAT registered.</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="phone">Phone</Label>
						<Input id="phone" name="phone" type="tel" value={value('phone', data.business.phone)} />
					</div>
				</div>

				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input
						id="email"
						name="email"
						type="email"
						value={value('email', data.business.email)}
						aria-invalid={error('email') ? 'true' : undefined}
					/>
					{#if error('email')}
						<p class="text-xs text-wrong">{error('email')}</p>
					{/if}
				</div>

				<Separator />

				<div class="space-y-2">
					<Label for="addressLine1">Street address</Label>
					<Input
						id="addressLine1"
						name="addressLine1"
						value={value('addressLine1', data.business.address.line1)}
					/>
					<Input
						id="addressLine2"
						name="addressLine2"
						aria-label="Address line 2"
						value={value('addressLine2', data.business.address.line2)}
					/>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-2">
						<Label for="city">City</Label>
						<Input id="city" name="city" value={value('city', data.business.address.city)} />
					</div>
					<div class="space-y-2">
						<Label for="postalCode">Postal code</Label>
						<Input
							id="postalCode"
							name="postalCode"
							inputmode="numeric"
							value={value('postalCode', data.business.address.postalCode)}
						/>
					</div>
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
