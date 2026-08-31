<script lang="ts">
	/**
	 * THE HEADER BAND OF THE COUNT — and the promise the whole flow is built to keep.
	 *
	 *   "Nothing changes in your stock until you've reviewed it at step 3."
	 *
	 * That sentence is not decoration and it is not marketing. It is a claim about the
	 * TRANSACTION, kept by `counts.ts` never writing a movement before `applyCount`, by
	 * `app.freeze_count_snapshot()` refusing to let an expected quantity drift mid-count, and by
	 * `app.freeze_applied_count()` refusing to let an applied count run twice. It is printed at
	 * the top of the screen because a person is about to spend an hour walking racks, and the
	 * thing they most need to know before they start is that nothing they type is final.
	 *
	 * SO IT IS `--text-primary`, NOT SUPPORTING PROSE. The eyebrow, the title and the date line
	 * are all quieter than it. This is the one sentence on the screen that changes what somebody
	 * is willing to do.
	 *
	 * THE RIGHT-HAND LINE IS THE SECOND HALF OF THE SAME REASSURANCE — "Started Tuesday · saved
	 * automatically" — and it is where the save indicator lives, because that is where somebody
	 * already looks to find out whether they can walk away. A failure is said out loud, in the
	 * `--state-wrong` colour and in an `aria-live` region: a save indicator that quietly stops
	 * updating is worse than no indicator at all.
	 */
	import Package from '@lucide/svelte/icons/package';
	import { Refusal, Stepper } from '$lib/ui';
	import { COUNT_STEPS, countStartedLine, type CountStep } from '$lib/core/inventory';
	import type { CountSaveStatus } from './count.svelte.js';

	let {
		title,
		number,
		step,
		startedAtMs,
		nowMs,
		locale = 'en-ZA',
		status = 'saved',
		error = null,
		onretry
	}: {
		/** "Stock count · July", from `countTitle`. */
		title: string;
		/** `SC-0001`. Internal, and shown quietly — nobody outside the business ever sees it. */
		number: string;
		step: CountStep;
		startedAtMs: number;
		/** One clock reading, taken by the page and passed down, so nothing here drifts. */
		nowMs: number;
		locale?: string;
		status?: CountSaveStatus;
		error?: string | null;
		/**
		 * A flush of the same batch that did not land. `CountAutosave` holds the in-flight
		 * payload precisely so a failed save loses nothing, so this needs no new machinery.
		 */
		onretry?: () => void;
	} = $props();

	const started = $derived(countStartedLine(startedAtMs, nowMs, locale));

	/**
	 * Is this count still going?
	 *
	 * At step 4 it is not, and two lines have to stop being said. "Nothing changes in your stock
	 * until you've reviewed it at step 3" is a promise about what has NOT happened yet, and
	 * leaving it above a screen that has just changed every quantity in the business reads as the
	 * interface not knowing what it did. "Saved automatically" goes for the same reason: an
	 * applied count is frozen at the database, so there is nothing left to save.
	 */
	const live = $derived(step < 4);

	/**
	 * What the second half of the date line says.
	 *
	 * "saved automatically" is the resting state and the promise; the other three are what is
	 * happening right now. `pending` deliberately does NOT say "unsaved" — a person who has just
	 * typed has not done anything wrong, and the sentence they need is that it is coming.
	 */
	const SAVED: Record<CountSaveStatus, string> = {
		saved: 'saved automatically',
		saving: 'saving…',
		pending: 'saving in a moment',
		error: 'not saved'
	};
</script>

<header class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
	<div class="min-w-0">
		<!-- The module eyebrow: the icon and the word, both in the inventory accent. -->
		<p class="flex items-center gap-1.5 text-helper font-medium text-inventory-ink">
			<Package class="size-3.5 text-inventory" aria-hidden="true" />
			Inventory
		</p>

		<h1 class="mt-1 text-title text-ink">{title}</h1>

		{#if live}
			<p class="mt-2 max-w-[52ch] text-ui text-ink">
				Nothing changes in your stock until you've reviewed it at step 3.
			</p>
		{/if}
	</div>

	<div class="text-left lg:text-right">
		<p class="text-helper text-ink-muted">
			{started}{#if live}
				· <span class={status === 'error' ? 'text-wrong' : ''}>{SAVED[status]}</span>
			{/if}
		</p>
		<p class="mt-0.5 numeric text-helper text-ink-muted">{number}</p>
	</div>
</header>

<!--
	The failure, in full, where the person is looking — and the reassurance beside it, because
	`CountAutosave` holds the in-flight batch precisely so that nothing typed is lost when a save
	does not land. The retry is a flush of that same batch. The argument for why this announces
	while a field message does not now lives in `Refusal`'s own header, with the component.
-->
{#if error}
	<Refusal message={`${error} Your work is still on this screen.`} {onretry} class="mt-3" />
{/if}

<Stepper
	class="mt-6 overflow-x-auto"
	steps={COUNT_STEPS}
	current={step}
	label="Stock count progress"
/>
