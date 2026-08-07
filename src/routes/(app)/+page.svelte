<script lang="ts">
	/**
	 * HOME — "everything across your business, in one place".
	 *
	 * Two columns on a desktop: the page's argument on the left, the 336px reference column on
	 * the right. One column on a phone, in the same order — what needs you, then what you were
	 * doing, then the month, then what is coming.
	 *
	 * EVERY PANEL AWAITS ITS OWN PROMISE
	 * ----------------------------------
	 * Not one `{#await}` around the page. The panels are streamed separately (see
	 * `home/load.ts`) precisely so that the money cards do not wait on Inventory, and a single
	 * wrapper would hand that back — the slowest module would set the arrival time of
	 * everything on screen.
	 *
	 * There is no `:catch` branch anywhere below, and that is not an oversight: these promises
	 * are built never to reject. A module that fails or times out resolves to a contribution
	 * the panel can render, which is how the standing panel is able to say WHICH module it did
	 * not hear from instead of showing an error where the reassurances should be.
	 */
	import {
		ComingUp,
		MonthPanel,
		PanelSkeleton,
		ResumePanel,
		StandingPanel,
		YourModules
	} from '$lib/components/home';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Home · CJs</title></svelte:head>

<div class="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8 lg:py-10">
	<header class="mb-7">
		<h1 class="text-title text-ink">Home</h1>
		<p class="mt-1 text-ui text-ink-secondary">{data.greeting}</p>
	</header>

	<div class="flex flex-col gap-7 lg:flex-row lg:items-start lg:gap-8">
		<div class="flex min-w-0 flex-1 flex-col gap-7">
			{#await data.standing}
				<PanelSkeleton shape="standing" />
			{:then panel}
				<StandingPanel {panel} />
			{/await}

			{#await data.resume}
				<PanelSkeleton shape="resume" />
			{:then cards}
				<ResumePanel {cards} />
			{/await}

			<section class="flex flex-col gap-2.5" aria-labelledby="month-eyebrow">
				<h2 id="month-eyebrow" class="eyebrow">This month</h2>
				{#await data.figures}
					<PanelSkeleton shape="figures" />
				{:then cards}
					<MonthPanel {cards} />
				{/await}
			</section>
		</div>

		<!-- 336px, fixed. The reference column: dated things, and what they cost. -->
		<aside class="flex w-full flex-col gap-7 lg:w-[336px] lg:shrink-0">
			{#await data.agenda}
				<PanelSkeleton shape="agenda" />
			{:then rows}
				<ComingUp {rows} />
			{/await}

			<YourModules panel={data.modules} />
		</aside>
	</div>
</div>
