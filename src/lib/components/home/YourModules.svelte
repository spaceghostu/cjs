<script lang="ts">
	/**
	 * YOUR MODULES — what this business has, and what it costs, on the screen it opens first.
	 *
	 * The design puts the bill on the dashboard rather than behind a settings page, and that is
	 * the product's argument made structural: if modules can be removed as easily as added, the
	 * price has nothing to hide from. Hence the total in full ("R450/month", the unit muted)
	 * and "Add or remove" with equal weight to nothing at all — it is a link, not a call to
	 * action.
	 *
	 * The link goes to `/settings/modules`, which is the switcher's home and the page it
	 * degrades to without JavaScript. Home does not mount the dialog itself: the switcher needs
	 * the full priced catalogue and a proration quote per module, and loading all of that on
	 * the dashboard to serve a link somebody may not press would put the bill's arithmetic on
	 * the hot path of every page load in the product.
	 */
	import { resolve } from '$app/paths';
	import { Amount } from '$lib/ui';
	import { accentText } from '$lib/components/shell';
	import { moduleRow } from '$lib/core/modules/catalogue';
	import type { ModulesPanel } from '$lib/core/home';

	let { panel }: { panel: ModulesPanel } = $props();
</script>

<section
	data-slot="your-modules"
	class="flex flex-col gap-2.5"
	aria-labelledby="your-modules-eyebrow"
>
	<h2 id="your-modules-eyebrow" class="eyebrow">Your modules</h2>

	<div class="rounded-[10px] bg-surface-card px-4 py-1.5">
		{#if panel.lines.length > 0}
			<ul>
				{#each panel.lines as line (line.module)}
					{@const row = moduleRow(line.module)}
					<li class="flex items-center gap-3 border-b border-line-subtle py-3">
						<!-- 6px accent dot. Wayfinding, never a field of colour. -->
						<span
							aria-hidden="true"
							class="size-1.5 shrink-0 rounded-full bg-current {accentText(row.accent)}"
						></span>
						<span class="min-w-0 flex-1 truncate text-[13px] text-ink">{row.label}</span>
						<Amount value={line.price} size="sm" tone="muted" decimals={0} />
					</li>
				{/each}
			</ul>
		{/if}

		<div class="flex items-center gap-3 py-3">
			<span class="flex flex-1 items-baseline">
				<Amount value={panel.total} size="sm" decimals={0} />
				<span class="text-helper text-ink-muted">/month</span>
			</span>

			<a
				href={resolve('/settings/modules')}
				class="shrink-0 text-[13px] font-medium text-brand-ink underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
			>
				Add or remove
			</a>
		</div>
	</div>
</section>
