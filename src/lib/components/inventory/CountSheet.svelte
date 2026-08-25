<script lang="ts">
	/**
	 * THE VARIANCE TABLE — step 2, and the screen a person actually works in.
	 *
	 * Columns `1fr 150px 100px 120px 110px 130px`: Item, Where, Expected, You counted, Difference,
	 * Value effect. Header row on `--surface-card`, rows divided by `--border-row`, every numeral
	 * mono and tabular so the column aligns on the decimal.
	 *
	 * THE INTERFACE DOES THE TRIAGE, SO THE PERSON DOES NOT SCROLL LOOKING FOR PROBLEMS.
	 * Differences come first — `triageCount` decided the order, on the server, once — and the 42
	 * that matched collapse into a single row with "Show them" on the right. A count sheet where
	 * the two boards that are missing are on row 31 is a sheet somebody has to audit rather than
	 * read.
	 *
	 * THE ORDER DOES NOT MOVE WHILE SOMEBODY TYPES, and that is deliberate rather than lazy. The
	 * obvious implementation re-sorts on every keystroke, which takes the row out from under the
	 * cursor of a person who is looking at a shelf and not at the screen. The counts in the
	 * sentence above the table are live; the rows stay where they were when the page loaded, and
	 * are re-triaged on the next load — the moment somebody is looking at the whole sheet again
	 * anyway. "They're at the top of the list" stays true either way: a row that has just been
	 * made to match is still up there, it has simply stopped being a problem.
	 *
	 * "NOT YET" IS NOT A ZERO, AND THE BORDER IS DOING REAL WORK.
	 * An uncounted box wears a DASHED `--border-control` and the placeholder "not yet"; a counted
	 * one wears a solid `--border-strong`. The dashed edge reads as awaiting input rather than as
	 * a value — which is the difference between an empty row on a clipboard and an empty shelf,
	 * and the two are worth different amounts of money. The same distinction is carried in the
	 * assistive tree by a per-row "Not counted yet" description, because a dashed border is not
	 * announced to anybody.
	 *
	 * EVERY FIGURE IN A ROW IS LIVE, THROUGH `liveLine`. The difference and the value effect are
	 * recomputed from what is in the box, by the same function the sticky footer totals with — so
	 * a row and the footer above it cannot disagree, which T24 makes an acceptance criterion.
	 *
	 * WHY THERE IS NO `Field` WRAPPER AROUND A COUNT BOX.
	 * `FieldError.svelte`'s own header names this case: a table row is a grid, not a stack of
	 * labelled fields, and wrapping each cell in a field turns a document you work through into a
	 * form you fill in. So the message atom is used directly, spanning the row, and found through
	 * `aria-describedby` built from the row's own stable id — the pattern
	 * `quoting/LineTable.svelte` set.
	 */
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { Amount, FieldError, Input, Qty, signedQtyText } from '$lib/ui';
	import {
		checkCounted,
		countReassurance,
		liveLine,
		matchedRowLabel,
		settleLine,
		type TriagedRow
	} from '$lib/core/inventory';

	let {
		differing,
		matched,
		values,
		facts,
		oncount
	}: {
		/** Variances first, then the shelves nobody reached. Ordered by `triageCount`. */
		differing: readonly TriagedRow[];
		/** The rows the last row collapses. Expandable, and still editable when expanded. */
		matched: readonly TriagedRow[];
		/** What is in each box, keyed by line id. The parent owns it; this only reports changes. */
		values: Readonly<Record<string, string>>;
		/** Live counts, from the parent's own arithmetic — one place totals this sheet. */
		facts: { readonly matched: number; readonly counted: number; readonly total: number };
		oncount: (lineId: string, text: string) => void;
	} = $props();

	let showMatched = $state(false);

	const said = $derived(
		countReassurance({
			matched: facts.matched,
			differing: facts.total - facts.matched,
			counted: facts.counted,
			total: facts.total
		})
	);

	const COLUMNS = 'grid-cols-[1fr_150px_100px_120px_110px_130px]';
</script>

<section class="mt-6">
	<h2 class="sr-only">What you counted</h2>

	<!--
		THE REASSURANCE LINE. A settled tick, then two statements: what is fine, and where to look.
		Two rather than one, because the first is reassurance and the second is a direction, and a
		single sentence would have to choose which of the two it was.
	-->
	<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui">
		{#if said.settled}
			<span
				class="flex size-4 shrink-0 items-center justify-center rounded-full bg-settled-tint"
				aria-hidden="true"
			>
				<Check size={10} strokeWidth={3} class="text-settled" />
			</span>
		{/if}
		<span class="text-ink">{said.matched}</span>
		{#if said.differing}
			<span class="text-ink-secondary">{said.differing}</span>
		{/if}
	</p>

	<div class="mt-3 overflow-x-auto">
		<div class="min-w-[860px] overflow-hidden rounded-[10px] border border-line-default">
			<div
				class="grid {COLUMNS} gap-3 border-b border-line-default bg-surface-card px-3 py-2
					text-eyebrow text-ink-muted uppercase"
			>
				<span>Item</span>
				<span>Where</span>
				<span class="text-right">Expected</span>
				<span class="text-right">You counted</span>
				<span class="text-right">Difference</span>
				<span class="text-right">Value effect</span>
			</div>

			{#each differing as row (row.line.id)}
				{@render countRow(row)}
			{/each}

			{#if showMatched}
				{#each matched as row (row.line.id)}
					{@render countRow(row)}
				{/each}
			{/if}

			{#if matched.length > 0}
				<!--
					THE COLLAPSED GOOD NEWS. Stated, never hidden: "42 items matched exactly" is the
					line an owner most wants to read, and it cannot appear if the sheet only mentions
					what went wrong.
				-->
				<div
					class="grid {COLUMNS} items-center gap-3 border-t border-line-default bg-surface-card
						px-3 py-2.5"
				>
					<span class="text-ui text-ink-secondary">{matchedRowLabel(matched.length)}</span>
					<span class="text-ui text-ink-muted">All locations</span>
					<span class="text-right numeric text-ui text-ink-muted" aria-hidden="true">—</span>
					<span class="text-right numeric text-ui text-ink-muted" aria-hidden="true">—</span>
					<span class="text-right numeric text-ui text-ink-muted">0</span>
					<div class="text-right">
						<button
							type="button"
							class="inline-flex items-center gap-1 rounded-sm text-ui text-brand-ink outline-none
								hover:underline focus-visible:outline-2 focus-visible:outline-offset-2
								focus-visible:outline-brand-focus-ring"
							aria-expanded={showMatched}
							onclick={() => (showMatched = !showMatched)}
						>
							{#if showMatched}
								<ChevronDown size={14} aria-hidden="true" />
								Hide them
							{:else}
								<ChevronRight size={14} aria-hidden="true" />
								Show them
							{/if}
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</section>

{#snippet countRow(row: TriagedRow)}
	{@const id = row.line.id}
	{@const text = values[id] ?? ''}
	{@const checked = checkCounted(text, id)}
	{@const bad = checked !== null && !checked.ok}
	{@const blank = text.trim() === ''}
	{@const settled = settleLine(liveLine(row.line, text))}
	{@const messageId = `count-line-${id}-message`}
	{@const stateId = `count-line-${id}-state`}
	<div class="grid {COLUMNS} items-center gap-3 border-b border-line-row px-3 py-2.5">
		<span class="min-w-0 truncate text-ui text-ink">{row.itemName}</span>
		<span class="min-w-0 truncate text-ui text-ink-secondary">{row.locationName}</span>

		<Qty value={row.line.expected} class="text-right text-ink-secondary" />

		<Input
			numeric
			inputmode="decimal"
			placeholder="not yet"
			class={[
				'h-auto rounded-sm px-2.5 py-[5px] text-right',
				blank ? 'border-dashed border-line-control' : 'border-line-strong'
			]}
			aria-label="How many {row.itemName} in {row.locationName}, in {row.unit}"
			aria-invalid={bad ? 'true' : undefined}
			aria-describedby={[bad ? messageId : null, blank ? stateId : null]
				.filter(Boolean)
				.join(' ') || undefined}
			value={text}
			oninput={(event) => oncount(id, event.currentTarget.value)}
		/>

		{#if blank}
			<!--
				The dashed border says "awaiting input" to somebody looking at it. This says the
				same thing to somebody who is not, and it is what makes an uncounted box and a
				counted zero tell apart with the screen off.
			-->
			<span id={stateId} class="sr-only">Not counted yet.</span>
			<span class="text-right numeric text-ui text-ink-muted">
				<span aria-hidden="true">—</span>
				<span class="sr-only">Nothing to compare yet</span>
			</span>
			<span class="text-right numeric text-ui text-ink-muted">
				<span aria-hidden="true">—</span>
				<span class="sr-only">Nothing to compare yet</span>
			</span>
		{:else}
			<span
				class="text-right numeric text-ui {settled.difference.e6 < 0
					? 'text-attention'
					: 'text-ink-secondary'}"
			>
				{signedQtyText(settled.difference)}
			</span>

			{#if settled.valueEffect}
				<Amount value={settled.valueEffect} class="text-right" signed />
			{:else}
				<span class="text-right numeric text-ui text-ink-muted">
					<span aria-hidden="true">—</span>
					<span class="sr-only">No cost recorded for this item</span>
				</span>
			{/if}
		{/if}

		<!--
			One message per row, spanning it, rather than one under a 120px cell. Same decision as
			the quote line table, and the same primitive drawing it.
		-->
		{#if bad}
			<FieldError id={messageId} result={checked} class="col-span-6" />
		{/if}
	</div>
{/snippet}
