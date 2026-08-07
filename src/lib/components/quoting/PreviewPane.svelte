<script lang="ts">
	/**
	 * "WHAT THE CLIENT SEES."
	 *
	 * `520px`, a `--surface-sunken` gutter, a left border in `--border-subtle`, `24px` padding.
	 * Eyebrow "What the client sees" with "Your branding, applied" right-aligned.
	 *
	 * The document inside renders on PAPER — the theme-invariant `--paper-*` tokens — because it
	 * is not part of the interface. It is the thing being made. The design's framing: "the
	 * document is client-facing, so it leads."
	 *
	 * NO FLASH ON UPDATE.
	 *
	 * `DocumentSheet` is a plain component over a `$derived` model, so a keystroke re-renders
	 * the text nodes that changed and nothing else. There is no `{#key}` around it and no fetch
	 * behind it: the preview is computed in the browser from the same `priceQuote` the totals
	 * use, which is also why it cannot lag the form.
	 */
	import { DocumentSheet } from '$lib/components/document';
	import type { PrintableDocument } from '$lib/core/document';

	let { document }: { document: PrintableDocument } = $props();
</script>

<aside
	class="w-[520px] shrink-0 overflow-y-auto border-l border-line-subtle bg-surface-sunken p-6"
	aria-label="What the client sees"
>
	<div class="flex items-baseline justify-between gap-3">
		<p class="text-eyebrow text-ink-muted uppercase">What the client sees</p>
		<p class="text-helper text-ink-muted">Your branding, applied</p>
	</div>

	<div class="mt-3">
		<DocumentSheet {document} />
	</div>
</aside>
