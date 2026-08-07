<script lang="ts">
	/**
	 * THE HEADER BAND.
	 *
	 * Padding `28px 32px 20px`, bottom border `--border-subtle` — the design's measurements.
	 *
	 * Left: the module eyebrow (a 14px Quoting glyph in the Quoting accent and the word
	 * "Quoting" at 12px in the same accent), the title at 24/600, and the save state.
	 * Right: "Preview PDF" (secondary) and "Send to client" (primary).
	 *
	 * The title is "Quote for Fynbos Interiors" — the CLIENT, not the number. A draft has no
	 * number, and a person thinks about who they are quoting rather than what it will be
	 * called.
	 */
	import { Button } from '$lib/ui';
	import { accentText } from '$lib/components/shell';
	import { navIcon } from '$lib/components/shell/icons';
	import SaveState from './SaveState.svelte';
	import type { SaveStatus } from './state.svelte.js';

	let {
		clientName,
		status,
		savedAtMs,
		error,
		pdfHref,
		sending = false,
		canSend,
		onsend
	}: {
		clientName: string | null;
		status: SaveStatus;
		savedAtMs: number;
		error: string | null;
		pdfHref: string;
		sending?: boolean;
		/** False while the quote is missing something a client would need. */
		canSend: boolean;
		onsend: () => void;
	} = $props();

	const Icon = navIcon('quoting');
</script>

<header class="border-b border-line-subtle px-8 pt-7 pb-5">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<p class="flex items-center gap-1.5 {accentText('quoting')}">
				<Icon size={14} strokeWidth={1.75} aria-hidden="true" />
				<span class="text-[12px]">Quoting</span>
			</p>

			<h1 class="mt-1.5 text-[24px] font-semibold text-ink">
				{clientName ? `Quote for ${clientName}` : 'New quote'}
			</h1>

			<div class="mt-2">
				<SaveState {status} {savedAtMs} {error} />
			</div>
		</div>

		<div class="flex shrink-0 items-center gap-2">
			<!--
				A real link, opened in a new tab: it is a document, and a person comparing it with
				the form wants both. `data-sveltekit-reload` because the target is a server route
				that streams bytes rather than a page the client router can render.
			-->
			<Button
				variant="secondary"
				href={pdfHref}
				target="_blank"
				rel="noopener"
				data-sveltekit-reload
			>
				Preview PDF
			</Button>
			<Button onclick={onsend} disabled={!canSend || sending}>
				{sending ? 'Sending…' : 'Send to client'}
			</Button>
		</div>
	</div>
</header>
