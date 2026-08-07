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
		error
	}: { status: SaveStatus; savedAtMs: number; error: string | null } = $props();
</script>

<p class="flex items-center gap-1.5 text-[13px]" aria-live="polite">
	{#if status === 'error'}
		<TriangleAlert size={14} aria-hidden="true" class="shrink-0 text-wrong" />
		<span class="text-wrong-ink">
			{error ?? 'We could not save your changes just now.'} Your work is still on this screen.
		</span>
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
