<script lang="ts">
	/**
	 * THE LOCKED STATE — calm, and it offers the module.
	 *
	 * The design's locked panel is not a wall. Someone arrived here on purpose, from a row
	 * that said "Add", so the screen's job is to say what the module does and what it costs,
	 * and then get out of the way. No lock icon, no "upgrade", no countdown — ESLint zone 10
	 * forbids a timer anywhere near billing, and the spirit of that rule applies to the words
	 * as much as the code.
	 *
	 * Three states, from `entitlement`:
	 *
	 *   none   never owned  — the offer below
	 *   read   removed      — "your data stays yours", read-only, and the way back
	 *   write  owned        — the module itself, which does not exist yet
	 *
	 * T13 refines the affordances (undo, contextual add). This is the honest floor: every
	 * catalogue key is reachable, nothing 404s, and nothing pretends to be built.
	 */
	import {
		Amount,
		Button,
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/ui';
	import { accentText, accentTint, navIcon } from '$lib/components/shell';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const Icon = $derived(navIcon(data.module.key));
</script>

<svelte:head><title>{data.module.label} · CJs</title></svelte:head>

<div class="mx-auto w-full max-w-2xl px-4 py-10 lg:py-16">
	<Card>
		<CardHeader>
			<span
				class="mb-3 flex size-10 items-center justify-center rounded-lg {accentTint(
					data.module.accent
				)}"
			>
				<Icon size={20} aria-hidden="true" class={accentText(data.module.accent)} />
			</span>
			<CardTitle>{data.module.label}</CardTitle>
			<CardDescription>{data.module.description}</CardDescription>
		</CardHeader>

		<CardContent class="space-y-5">
			{#if data.access === 'write'}
				<p class="text-ui text-ink-secondary">
					{data.module.label} is part of your business. The screens for it are still being built — nothing
					you have is affected, and nothing is lost in the meantime.
				</p>
			{:else if data.access === 'read'}
				<!--
					The middle state, and the reason entitlement is not a boolean. The design's
					promise is that removing a module does not take the data with it.
				-->
				<p class="text-ui text-ink-secondary">
					You removed {data.module.label}, so it can't be changed. Everything already in it stays
					yours — you can read it and export it whenever you like, and adding the module back picks
					up exactly where you left off.
				</p>
				<div class="flex flex-wrap gap-3">
					<Button href="/settings/modules">Add {data.module.label} back</Button>
					<Button href="/settings/export" variant="secondary" data-sveltekit-reload>
						Export your data
					</Button>
				</div>
			{:else}
				<p class="text-ui text-ink-secondary">
					Your business hasn't added {data.module.label} yet. You can add it any time, and you only pay
					for the days you have it.
				</p>
				{#if data.price}
					<p class="flex items-baseline gap-1 text-ink">
						<Amount value={data.price} size="lg" decimals={0} />
						<span class="text-helper text-ink-muted">per month</span>
					</p>
				{/if}
				<div class="flex flex-wrap gap-3">
					<Button href="/settings/modules">Add {data.module.label}</Button>
					<Button href="/" variant="secondary">Not now</Button>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>
