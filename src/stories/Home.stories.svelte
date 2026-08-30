<script module lang="ts">
	/**
	 * THE DASHBOARD'S PANELS — SPA-16's coverage half.
	 *
	 * The a11y gate in `.storybook/preview.ts` fails a run on any axe violation, in both
	 * themes — but it can only sweep what has a story, and until this file Home had none.
	 * Every story below exists to put a bound surface inside that gate: each panel alone in
	 * the states that change its markup, and the whole page in the frame `(app)/+page.svelte`
	 * arranges — because a landmark or heading problem is a property of the composition, not
	 * of any one panel.
	 *
	 * `Home/…` is a new top-level category, deliberately: Home is a surface like Shell, not a
	 * module — `Modules/Switcher` is the module-MANAGEMENT UI — and preview.ts's own sweep
	 * notes name shell, Home, quoting and invoicing as distinct surfaces.
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import {
		ComingUp,
		MonthPanel,
		PanelSkeleton,
		ResumePanel,
		StandingPanel,
		YourModules
	} from '$lib/components/home';
	import Specimen from './ui/Specimen.svelte';
	import {
		AGENDA_ROWS,
		MODULES_PANEL,
		MONTH_CARDS,
		RESUME_CARDS,
		STANDING_ATTENTION,
		STANDING_CLEAR,
		STANDING_UNAVAILABLE
	} from './home/fixtures';

	const { Story } = defineMeta({
		title: 'Home/Panels',
		component: StandingPanel,
		parameters: { layout: 'fullscreen' }
	});
</script>

<!-- The default state, and the design's thesis: nothing needs you, and the interface says so. -->
<Story name="Standing · all clear" asChild>
	<Specimen title="Standing panel" note="The roll-up when every module reports clear.">
		<StandingPanel panel={STANDING_CLEAR} />
	</Specimen>
</Story>

<!-- Concerns first, then reassurances — `orderPoints`' contract, visible. -->
<Story name="Standing · attention" asChild>
	<Specimen title="Standing panel" note="Two concerns lead; the reassurance follows.">
		<StandingPanel panel={STANDING_ATTENTION} />
	</Specimen>
</Story>

<!-- "All clear" while a module was unreachable is the one lie this panel cannot afford. -->
<Story name="Standing · module unavailable" asChild>
	<Specimen title="Standing panel" note="A module that did not answer is named, not hidden.">
		<StandingPanel panel={STANDING_UNAVAILABLE} />
	</Specimen>
</Story>

<Story name="Resume" asChild>
	<Specimen title="Pick up where you left off" note="Each card names concrete progress.">
		<ResumePanel cards={RESUME_CARDS} />
	</Specimen>
</Story>

<!-- The empty slot renders a footnote, never R0 — a gap is not a claim. -->
<Story name="This month" asChild>
	<Specimen title="Month cards" note="Owed is the one emphasised card. No Payroll, no figure.">
		<MonthPanel cards={MONTH_CARDS} />
	</Specimen>
</Story>

<Story name="Coming up" asChild>
	<Specimen title="Agenda" note="Server-formatted dates; detail line only when it adds.">
		<ComingUp rows={AGENDA_ROWS} />
	</Specimen>
</Story>

<Story name="Coming up · empty" asChild>
	<Specimen title="Agenda" note="Nothing scheduled, said plainly.">
		<ComingUp rows={[]} />
	</Specimen>
</Story>

<Story name="Your modules" asChild>
	<Specimen title="Your modules" note="Price per row, and the total the sidebar also shows.">
		<YourModules panel={MODULES_PANEL} />
	</Specimen>
</Story>

<Story name="Skeletons" asChild>
	<Specimen title="Panel skeletons" note="One per shape, holding each panel's footprint.">
		<div class="flex flex-col gap-7">
			<PanelSkeleton shape="standing" />
			<PanelSkeleton shape="resume" />
			<PanelSkeleton shape="figures" />
			<PanelSkeleton shape="agenda" />
		</div>
	</Specimen>
</Story>

<!--
	The whole page, in the frame `(app)/+page.svelte` draws — h1, two columns, the 336px
	reference column — because heading order and landmark structure are facts about the
	composition that no single-panel story can hold.
-->
<Story name="Home · composed" asChild>
	<div class="min-h-svh bg-surface-base">
		<div class="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8 lg:py-10">
			<header class="mb-7">
				<h1 class="text-title text-ink">Home</h1>
				<p class="mt-1 text-ui text-ink-secondary">Good morning, Thandi.</p>
			</header>

			<div class="flex flex-col gap-7 lg:flex-row lg:items-start lg:gap-8">
				<div class="flex min-w-0 flex-1 flex-col gap-7">
					<StandingPanel panel={STANDING_ATTENTION} />
					<ResumePanel cards={RESUME_CARDS} />
					<section class="flex flex-col gap-2.5" aria-labelledby="month-eyebrow">
						<h2 id="month-eyebrow" class="eyebrow">This month</h2>
						<MonthPanel cards={MONTH_CARDS} />
					</section>
				</div>

				<aside class="flex w-full flex-col gap-7 lg:w-[336px] lg:shrink-0">
					<ComingUp rows={AGENDA_ROWS} />
					<YourModules panel={MODULES_PANEL} />
				</aside>
			</div>
		</div>
	</div>
</Story>
