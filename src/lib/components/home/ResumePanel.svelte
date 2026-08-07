<script lang="ts">
	/**
	 * PICK UP WHERE YOU LEFT OFF.
	 *
	 * The design's most quietly opinionated section. It is not "recent activity" — a log of
	 * what you did is a screen you read; this is a list of what you STARTED, which is a screen
	 * you act on. Hence the context line: "Draft saved 21:47 yesterday · 3 of 5 items priced"
	 * names concrete progress, so the decision to go back in is made here rather than after
	 * loading the thing to see how far it got.
	 *
	 * The section is absent, not empty, when nobody has a draft. An empty box under an eyebrow
	 * saying "pick up where you left off" is the interface inventing a chore.
	 */
	import { accentText } from '$lib/components/shell';
	import { navIcon } from '$lib/components/shell/icons';
	import { moduleRow } from '$lib/core/modules/catalogue';
	import type { ResumeCard } from '$lib/core/home';

	let { cards }: { cards: readonly ResumeCard[] } = $props();
</script>

<!--
	Every href here is CONTRIBUTED data — a module built its own deep link and Home does not
	know its shape — so there is no literal route id for `resolve()` to type-check against. If
	a `paths.base` is ever configured, the fix belongs where the module builds the href, not
	here.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

{#if cards.length > 0}
	<section data-slot="resume" class="flex flex-col gap-3.5" aria-labelledby="resume-eyebrow">
		<h2 id="resume-eyebrow" class="eyebrow">Pick up where you left off</h2>

		<!-- 14px gap between cards, 10px radius, 14/16 padding. -->
		<ul class="flex flex-col gap-3.5">
			{#each cards as card (card.id)}
				{@const row = moduleRow(card.module)}
				{@const Icon = navIcon(card.module)}
				<li>
					<a
						href={card.href}
						class="flex items-center gap-3.5 rounded-[10px] bg-surface-card px-4 py-3.5 transition-colors duration-150 ease-out-forward outline-none hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
					>
						<Icon size={17} strokeWidth={1.75} aria-hidden="true" class={accentText(row.accent)} />

						<span class="min-w-0 flex-1">
							<span class="block truncate text-ui text-ink">{card.title}</span>
							<span class="block truncate text-helper text-ink-muted">{card.context}</span>
						</span>

						<!--
							"Resume" is a label on a card that is already a link, so it is not a second
							control — `aria-hidden` keeps the row one tab stop and one announcement.
							`--brand-ink` rather than `--brand`: the fill is tuned to carry white and is
							too dark to BE text. See the token note in `layout.css`.
						-->
						<span aria-hidden="true" class="shrink-0 text-[13px] font-medium text-brand-ink">
							Resume
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}
