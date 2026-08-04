<script lang="ts">
	/**
	 * A MODULE THIS BUSINESS HAS NEVER OWNED — calm, not a paywall.
	 *
	 * The design's heading is the specification, and what is ABSENT is most of it:
	 *
	 *   no primary CTA          the button is secondary, and it explains before it sells
	 *   no urgency              no countdown, no "limited", no badge
	 *   no interstitial         this is a page someone navigated to, not a wall thrown up
	 *   no lock icon            the module's own accent, the same as everywhere else
	 *
	 * The value is stated CONCRETELY for this business — "It would arrive with your 4 people
	 * already loaded" — because a generic feature list is what every locked screen on the
	 * internet says, and it persuades nobody who has ever seen one.
	 *
	 * A REMOVED module must NOT use this component. Its data is still there, read-only and
	 * exportable, and telling that person the module "isn't part of your workspace yet" would
	 * be both wrong and alarming. See `RemovedModule.svelte`.
	 */
	import { Amount, Button } from '$lib/ui';
	import { accentText } from '$lib/components/shell';
	import { navIcon } from '$lib/components/shell/icons';
	import type { ModuleKey } from '$lib/core/modules/catalogue';
	import type { Money } from '$lib/core/money';

	let {
		moduleKey,
		label,
		accent,
		price,
		/** "your 4 people and 12 customers" — generated, or null for a brand-new business. */
		carryover,
		href = '/settings/modules'
	}: {
		moduleKey: ModuleKey;
		label: string;
		accent: string;
		price: Money | null;
		carryover: string | null;
		href?: string;
	} = $props();

	const Icon = $derived(navIcon(moduleKey));
</script>

<div
	data-slot="locked-module"
	class="flex flex-col items-start gap-2.5 rounded-[10px] border border-line-default bg-surface-card p-7"
>
	<Icon size={22} strokeWidth={1.75} aria-hidden="true" class={accentText(accent)} />

	<h2 class="text-[16px] leading-snug text-ink">
		{label} isn't part of your workspace yet
	</h2>

	<p class="max-w-95 text-[13px] leading-relaxed text-ink-secondary">
		{#if carryover}
			It would arrive with {carryover} already loaded.
		{/if}
		{#if price}
			<Amount value={price} decimals={0} class="text-[13px]" />/mo, removable any time.
		{:else}
			It isn't something you can add yet — we'll say so here the day it is.
		{/if}
	</p>

	<!--
		Secondary, and it says "See what it does" rather than "Add". The design's order is
		explain, then decide: the switcher is one click further on and is not going anywhere.
	-->
	{#if price}
		<Button {href} variant="secondary" class="mt-1.5">See what {label} does</Button>
	{/if}
</div>
