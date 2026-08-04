<script lang="ts">
	/**
	 * ONE MODULE, IN THE SWITCHER.
	 *
	 * The design's framing: "add and remove in the same place… Owned modules show Remove with
	 * equal weight to Add." That sentence is the whole component, and it is easy to get wrong
	 * in a way that looks fine: hide Remove behind a menu, or paint it red, and the product's
	 * central promise quietly becomes a paywall with an exit interview.
	 *
	 * So Remove is a real, equally reachable button, in `secondary` — bordered, not
	 * destructive. Removing a module is reversible and takes nothing away; styling it as
	 * dangerous would be a lie told in CSS.
	 *
	 * The two rows are visually distinct — owned sits on `--surface-raised` with its accent
	 * lit, available sits on nothing with a muted icon — and identical in affordance. One tap
	 * either way.
	 */
	import { Amount, Button } from '$lib/ui';
	import { accentText } from '$lib/components/shell';
	import { navIcon } from '$lib/components/shell/icons';
	import type { ModuleKey } from '$lib/core/modules/catalogue';
	import type { Money } from '$lib/core/money';

	let {
		moduleKey,
		label,
		description,
		accent,
		price,
		owned,
		/** False for staff. The button stays visible and says why — see the switcher footer. */
		canChange,
		onadd,
		onremove
	}: {
		moduleKey: ModuleKey;
		label: string;
		description: string;
		accent: string;
		price: Money;
		owned: boolean;
		canChange: boolean;
		onadd: (key: ModuleKey) => void;
		onremove: (key: ModuleKey) => void;
	} = $props();

	const Icon = $derived(navIcon(moduleKey));
</script>

<div
	data-slot="module-row"
	data-owned={owned ? '' : undefined}
	class="flex items-center gap-3.5 rounded-[10px] px-3.5 py-3"
	class:bg-surface-raised={owned}
>
	<Icon
		size={18}
		strokeWidth={1.75}
		aria-hidden="true"
		class={owned ? accentText(accent) : 'text-ink-muted'}
	/>

	<div class="min-w-0 flex-1">
		<p
			class="truncate text-ui"
			class:font-medium={owned}
			class:text-ink={owned}
			class:text-ink-strong-secondary={!owned}
		>
			{label}
		</p>
		<p class="truncate text-helper text-ink-muted">{description}</p>
	</div>

	<span class="flex shrink-0 items-baseline text-ink-muted">
		<Amount value={price} size="sm" tone="muted" decimals={0} />
		<span class="text-helper">/mo</span>
	</span>

	<!--
		`aria-disabled` rather than `disabled`, so a staff member's screen reader still reaches
		the control and hears that it exists and why it is unavailable. The design's point is
		that staff "see the catalogue and see that they cannot change it" — a control that has
		vanished communicates neither.
	-->
	{#if owned}
		<Button
			variant="secondary"
			size="sm"
			class="shrink-0"
			aria-disabled={!canChange}
			onclick={() => canChange && onremove(moduleKey)}
		>
			Remove
		</Button>
	{:else}
		<Button
			variant="primary"
			size="sm"
			class="shrink-0"
			aria-disabled={!canChange}
			onclick={() => canChange && onadd(moduleKey)}
		>
			Add
		</Button>
	{/if}
</div>
