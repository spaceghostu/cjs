<script lang="ts">
	/**
	 * "All changes saved · 21:47. You can close this and come back."
	 *
	 * The design's sentence, and a promise the implementation keeps rather than a decoration.
	 * Four states, because a person needs to be able to tell them apart at a glance:
	 *
	 *   saved    a settled-green tick and the time the SERVER wrote
	 *   pending  something typed, not yet sent. Quiet — this is normal, not a warning.
	 *   saving   in flight
	 *   error    said plainly, with the reassurance that the work is still on the screen
	 *
	 * `savedAt` is the database's `updated_at`, never an optimistic guess in the browser. See
	 * `state.svelte.ts`.
	 */
	import Check from '@lucide/svelte/icons/check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { clockTime, type SaveStatus } from './state.svelte.js';

	let {
		status,
		savedAtMs,
		error,
		onretry
	}: {
		status: SaveStatus;
		savedAtMs: number;
		error: string | null;
		/**
		 * DELIBERATELY NOT A `Refusal`. This is a 13px status line with a tick and a clock, not a
		 * panel — the same relationship `FieldError` has to a form banner. So the retry is a text
		 * button inside the existing single polite region rather than a second live region beside
		 * it. `Autosave.flush()` is safe to call repeatedly and puts the failed payload back
		 * before it flips status, so pressing this can lose nothing.
		 */
		onretry?: () => void;
	} = $props();
</script>

<p class="flex items-center gap-1.5 text-[13px]" aria-live="polite">
	{#if status === 'error'}
		<TriangleAlert size={14} aria-hidden="true" class="shrink-0 text-wrong" />
		<span class="text-wrong-ink">
			{error ?? 'We could not save your changes just now.'} Your work is still on this screen.
		</span>
		{#if onretry}
			<button
				type="button"
				onclick={onretry}
				class="shrink-0 rounded-[5px] text-wrong-ink underline underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
			>
				Try again
			</button>
		{/if}
	{:else if status === 'saving'}
		<span class="text-ink-muted">Saving…</span>
	{:else if status === 'pending'}
		<!--
			Not "unsaved changes". The person is typing; telling them their work is at risk every
			time they touch a key is anxiety the product has no business creating.
		-->
		<span class="text-ink-muted">Saving as you go</span>
	{:else}
		<Check size={14} aria-hidden="true" class="shrink-0 text-settled" />
		<span class="text-ink-secondary">
			All changes saved · {clockTime(savedAtMs)}. You can close this and come back.
		</span>
	{/if}
</p>
