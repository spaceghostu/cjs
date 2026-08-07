<script lang="ts">
	/**
	 * THE PAPER.
	 *
	 * One renderer, three destinations: the live preview in the quote editor, the document
	 * panel in the invoice detail, and — through `$lib/server/core/pdf.ts`, which lays out the
	 * same `PrintableDocument` with the same rules — the PDF the client receives. T17 is blunt
	 * about why: "They must be the same code, or they will drift, and the client will receive
	 * something the business never saw."
	 *
	 * ALWAYS LIGHT.
	 *
	 * The `--paper-*` tokens are declared once on `:root` in `layout.css` and are deliberately
	 * NOT redeclared under `.light`. So this sheet renders identically in both themes, which is
	 * correct: it is what a client opens and prints, and it does not belong to the interface
	 * that happens to be displaying it. Everything below draws its colour from those five
	 * tokens and from nothing else — no `text-ink`, no `bg-surface-card`, nothing that moves
	 * when the person using the app flips a switch.
	 *
	 * NO ARITHMETIC. Every amount arrives as `Money`, already computed by `priceDocument` via
	 * the module's projection. This file spells numbers; it never makes them.
	 */
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { amountText, qtyText } from '$lib/components/money/amount.js';
	import type { PrintableDocument } from '$lib/core/document';

	let {
		document,
		class: className,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & { document: PrintableDocument } = $props();

	/**
	 * The line grid. `1fr 40px 88px` on a quote, `1fr 40px 92px` on an invoice — T17 states
	 * both, and the four extra points are for the wider amounts an invoice carries.
	 */
	const columns = $derived(document.kind === 'invoice' ? '1fr 40px 92px' : '1fr 40px 88px');

	/**
	 * No currency symbol in the columns.
	 *
	 * The design's documents print `16 400.00`, not `R16 400.00` — the currency is established
	 * by the masthead and repeating it in ninety table cells is noise. Two decimals always: a
	 * document is a tax record, and dropping the cents there is a defect.
	 */
	const amount = (value: Parameters<typeof amountText>[0]) =>
		amountText(value, { decimals: 2, symbol: false });
</script>

<!--
	`text-[…]` and `leading-[…]` throughout rather than the app's type scale. The sheet is
	measured in the design in absolute pixels because it is a piece of paper, and it does not
	inherit the interface's rhythm — see the PDF layout in `$lib/server/core/pdf/layout.ts`,
	which carries the same numbers in points.
-->
<div
	data-slot="document-sheet"
	class={cn('rounded-[8px] px-[32px] py-[34px] text-[12px]', className)}
	style="background: var(--paper-bg); color: var(--paper-ink);"
	{...restProps}
>
	<!-- ── Masthead ──────────────────────────────────────────────────────────────── -->
	<header class="flex items-start justify-between gap-6">
		<div class="min-w-0">
			<p class="text-[14px] font-semibold tracking-[0.14em] uppercase">
				{document.issuer.tradingName}
			</p>
			<div class="mt-[6px] text-[11px] leading-[1.6]" style="color: var(--paper-ink-muted);">
				{#each document.issuer.addressLines as line (line)}
					<p>{line}</p>
				{/each}
				{#if document.issuer.vatNumber || document.issuer.phone}
					<p>
						{#if document.issuer.vatNumber}VAT {document.issuer.vatNumber}{/if}
						{#if document.issuer.vatNumber && document.issuer.phone}
							·
						{/if}
						{#if document.issuer.phone}{document.issuer.phone}{/if}
					</p>
				{/if}
			</div>
		</div>

		<div class="shrink-0 text-right">
			<!--
				`TAX INVOICE` is not a label choice. A South African tax invoice has statutory
				content requirements under s20 of the VAT Act and the wording is one of them,
				which is why this is a closed union in `$lib/core/document` and a value here.
			-->
			<p class="text-[11px] tracking-[0.1em]" style="color: var(--paper-ink-muted);">
				{document.typeLabel}
			</p>
			{#if document.number}
				<p class="mt-[2px] numeric text-[13px]">{document.number}</p>
			{/if}
		</div>
	</header>

	<!-- ── Parties ───────────────────────────────────────────────────────────────── -->
	<section
		class="mt-[26px] flex items-start justify-between gap-6 border-t pt-[18px]"
		style="border-color: var(--paper-rule);"
	>
		<div class="min-w-0">
			<p class="text-[10px] tracking-[0.08em] uppercase" style="color: var(--paper-ink-muted);">
				{document.party.label}
			</p>
			<p class="mt-[6px] text-[13px]">{document.party.name}</p>
			{#if document.party.detail}
				<p class="mt-[2px] text-[11px]" style="color: var(--paper-ink-muted);">
					{document.party.detail}
				</p>
			{/if}
		</div>

		{#if document.date}
			<div class="shrink-0 text-right">
				<p class="text-[10px] tracking-[0.08em] uppercase" style="color: var(--paper-ink-muted);">
					{document.date.label}
				</p>
				<p class="mt-[6px] text-[13px]">{document.date.value}</p>
			</div>
		{/if}
	</section>

	<!-- ── Lines ─────────────────────────────────────────────────────────────────── -->
	<section class="mt-[26px]">
		<div
			class="grid gap-x-[12px] border-b pb-[6px] text-[10px] tracking-[0.08em] uppercase"
			style="grid-template-columns: {columns}; border-color: var(--paper-rule); color: var(--paper-ink-muted);"
		>
			<span>Description</span>
			<span class="text-right">Qty</span>
			<span class="text-right">Amount</span>
		</div>

		{#each document.lines as line (line.id)}
			<div
				class="grid gap-x-[12px] border-b py-[9px]"
				style="grid-template-columns: {columns}; border-color: var(--paper-rule-light);"
			>
				<span class="text-[12px] leading-[1.5]">{line.description}</span>
				<span class="text-right numeric text-[12px] leading-[1.5]">{qtyText(line.qty)}</span>
				<span class="text-right numeric text-[12px] leading-[1.5]">{amount(line.amount)}</span>
			</div>
		{/each}
	</section>

	<!-- ── Totals ────────────────────────────────────────────────────────────────── -->
	<section class="mt-[18px] flex justify-end">
		<div class="w-[200px]">
			<div class="flex items-baseline justify-between text-[11px]">
				<span style="color: var(--paper-ink-muted);">{document.totals.subtotalLabel}</span>
				<span class="numeric">{amount(document.totals.subtotal)}</span>
			</div>
			<div class="mt-[5px] flex items-baseline justify-between text-[11px]">
				<span style="color: var(--paper-ink-muted);">{document.totals.taxLabel}</span>
				<span class="numeric">{amount(document.totals.tax)}</span>
			</div>
			<div
				class="mt-[9px] flex items-baseline justify-between border-t pt-[9px]"
				style="border-color: var(--paper-rule);"
			>
				<span class="text-[11px]">{document.totals.totalLabel}</span>
				<span class="numeric text-[16px]">{amount(document.totals.total)}</span>
			</div>
		</div>
	</section>

	<!-- ── Footer ────────────────────────────────────────────────────────────────── -->
	<footer
		class="mt-[28px] flex items-end justify-between gap-6 border-t pt-[14px] text-[10px] leading-[1.7]"
		style="border-color: var(--paper-rule); color: var(--paper-ink-muted);"
	>
		<div class="min-w-0">
			{#each document.footer as term (term)}
				<p>{term}</p>
			{/each}
		</div>
		<p class="shrink-0">{document.pageLabel}</p>
	</footer>
</div>
