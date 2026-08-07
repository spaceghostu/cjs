<script lang="ts">
	/**
	 * "YOU'RE ALL CLEAR." — and the version of the same panel that says otherwise.
	 *
	 * The design's thesis lives in this box: the default state is that nothing needs you, and
	 * the interface says so confidently instead of manufacturing something to worry about. The
	 * hard part is not the all-clear — it is that the panel must be able to say the opposite in
	 * the SAME register. So there is one component and one layout, and what changes between
	 * them is the glyph, the colour and the words. No red, no badge, no count in a circle.
	 *
	 * The reassurances underneath are contributed by the modules (see
	 * `$lib/server/core/home/registry.ts`), which is why nothing in here names one. A business
	 * with a single module gets one reassurance and a panel that still reads as complete; a
	 * business with none gets the headline alone, which is also true.
	 */
	import Check from '@lucide/svelte/icons/check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import type { StandingPanel } from '$lib/core/home';

	let { panel }: { panel: StandingPanel } = $props();

	const clear = $derived(panel.standing === 'clear');
</script>

<!--
	A concern's href is contributed by the module that raised it, so it is data rather than a
	literal route id and has nothing for `resolve()` to check. Same reasoning as `AppSidebar`.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<!-- 32px padding, 28px gap, 12px radius — the design's largest and quietest panel. -->
<section
	data-slot="standing"
	data-standing={panel.standing}
	class="flex flex-col gap-7 rounded-lg border border-line-default bg-surface-card p-8"
	aria-labelledby="standing-headline"
>
	<div class="flex flex-col gap-3">
		{#if clear}
			<Check size={30} strokeWidth={2} aria-hidden="true" class="text-settled" />
		{:else}
			<!--
				A different glyph and a different colour, and that is the whole escalation. The
				attention tone is the design's amber, not its red: something needs you is not the
				same statement as something has gone wrong.
			-->
			<CircleAlert size={30} strokeWidth={1.75} aria-hidden="true" class="text-attention" />
		{/if}

		<h2 id="standing-headline" class="text-section text-ink">{panel.headline}</h2>

		<!-- 14px at 1.55, capped at 520px: two lines, and the second one lands where the eye is. -->
		<p class="max-w-[520px] text-ui leading-[1.55] text-ink-secondary">{panel.explanation}</p>
	</div>

	{#if panel.points.length > 0}
		<div class="border-t border-line-subtle pt-7">
			<!--
				Three across on a wide screen, one on a phone. Never a scroller: the point of the
				grid is that the whole of it is visible at once.
			-->
			<ul class="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
				{#each panel.points as point (point.module + point.statement)}
					<li class="flex flex-col gap-1">
						{#if point.href}
							<a
								href={point.href}
								class="text-ui underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
								class:text-attention-ink={point.standing === 'attention'}
								class:text-ink={point.standing === 'clear'}
							>
								{point.statement}
							</a>
						{:else}
							<span
								class="text-ui"
								class:text-attention-ink={point.standing === 'attention'}
								class:text-ink={point.standing === 'clear'}
							>
								{point.statement}
							</span>
						{/if}
						<span class="text-helper text-ink-muted">{point.explanation}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if panel.unavailable.length > 0}
		<!--
			The one thing this panel is not allowed to leave out. "All clear" is a claim about
			EVERYTHING, so a module that did not answer has to appear — quietly, without alarm,
			and without implying anything is wrong with the module's data.
		-->
		<p class="text-helper text-ink-muted">
			{panel.unavailable.join(' and ')} didn't answer just now, so this doesn't include
			{panel.unavailable.length === 1 ? 'it' : 'them'} yet.
		</p>
	{/if}
</section>
