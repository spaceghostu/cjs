<script lang="ts">
	/**
	 * THE STOCK COUNT SCREEN — and the shape every multi-step money flow after it should take.
	 *
	 * T24 calls this the pattern-setter: "progress is visible, nothing commits until reviewed, and
	 * it's interruptible". All three are structural rather than decorative, and each one is a
	 * decision in this file:
	 *
	 *   VISIBLE       one `Stepper`, driven by the count's STATUS. Not by a query parameter, not
	 *                 by local state — by the column the database guards.
	 *   UNCOMMITTED   step 3 is a form action, and `applyCount` at step 4 is the only thing in the
	 *                 whole flow that writes a movement. A person can be at step 2 for a week.
	 *   INTERRUPTIBLE every keystroke reaches `saveCountLine` through the autosave. There is no
	 *                 `localStorage` anywhere: "on any device" is the acceptance criterion, and a
	 *                 count that lives in one browser vanishes when somebody picks up the tablet.
	 *
	 * WHAT IS IN THE BOX, AND WHAT THE SERVER SAYS ARE TWO LAYERS ON PURPOSE.
	 * `seeded` is what the database holds; `edits` is what the person has typed since. `values` is
	 * the second laid over the first. That is what lets an UNREADABLE entry stay on the screen: the
	 * validation standard is explicit that a form must never clear a field it could not read,
	 * because the invalid text is the person's work-in-progress and the only copy of it there is.
	 * A single state seeded once and then mutated would be wiped by every step transition;
	 * an `$effect` that re-seeded would wipe what somebody was typing.
	 *
	 * THE FOOTER'S FIGURES AT STEP 2 ARE THE BROWSER'S; AT STEP 3 THEY ARE THE SERVER'S — and they
	 * agree because both are `netValueEffect` and `countProgress` over lines built by `liveLine`.
	 * Moving between the two flushes the autosave first, so the figure a person approves is the
	 * figure the footer promised a moment earlier. T24 makes that agreement an acceptance
	 * criterion, and one shared set of pure functions is the only way to keep it.
	 */
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { Button, qtyText } from '$lib/ui';
	import {
		CountApplied,
		CountFooter,
		CountHeader,
		CountReview,
		CountSheet,
		CountAutosave
	} from '$lib/components/inventory';
	import {
		checkCounted,
		countProgress,
		liveLine,
		netValueEffect,
		reviewChangesLabel,
		varyingLines,
		type CountSheetRow
	} from '$lib/core/inventory';
	import { ZAR } from '$lib/core/money';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The endpoint is a function, not a captured string: SvelteKit reuses this component across a
	// navigation from one count to another, and a URL frozen here would outlive the count it names.
	const save = new CountAutosave({ endpoint: () => `/inventory/counts/${data.count.id}/save` });

	/** What the database holds, spelled the way the box will hold it. Blank means "not yet". */
	function seedFrom(rows: readonly CountSheetRow[]): Record<string, string> {
		return Object.fromEntries(
			rows.map((row) => [row.line.id, row.line.counted === null ? '' : qtyText(row.line.counted)])
		);
	}

	const rows = $derived([...data.differing, ...data.matched]);
	const seeded = $derived(seedFrom(rows));

	/** What has been typed since the page loaded. Laid over the server's answer, never into it. */
	let edits = $state<Record<string, string>>({});
	const values = $derived({ ...seeded, ...edits });

	// ── The running total, from the same pure functions the review step uses ────────────
	const live = $derived(rows.map((row) => liveLine(row.line, values[row.line.id] ?? '')));
	const progress = $derived(countProgress(live));
	const effect = $derived(netValueEffect(ZAR, live));
	const changes = $derived(varyingLines(live).length);
	/** Counted and agreeing. Everything counted either matches or is one of the changes. */
	const matchedNow = $derived(progress.counted - changes);

	/**
	 * Somebody typed in a box.
	 *
	 * The text goes on the screen unconditionally — the standard forbids a form from clearing a
	 * field it could not read — but only a value the PARSER accepted is queued for the server. An
	 * unreadable box shows a message and sends nothing, so the last quantity the server
	 * acknowledged still stands, in the database and in the figure above the footer, rather than
	 * being replaced by half a keystroke.
	 *
	 * An emptied box is not unreadable. It is "I have not looked at this one yet", it goes as
	 * `null`, and it is the only way back from a number typed into the wrong row.
	 */
	function count(lineId: string, text: string) {
		edits = { ...edits, [lineId]: text };

		const trimmed = text.trim();
		if (trimmed === '') {
			save.change(lineId, null);
			return;
		}

		const checked = checkCounted(trimmed, lineId);
		if (checked !== null && checked.ok) save.change(lineId, trimmed);
	}

	onMount(() => {
		const flushOnLeave = () => save.beacon();
		const onHide = () => {
			if (globalThis.document.visibilityState === 'hidden') save.beacon();
		};

		globalThis.addEventListener('pagehide', flushOnLeave);
		globalThis.document.addEventListener('visibilitychange', onHide);

		return () => {
			globalThis.removeEventListener('pagehide', flushOnLeave);
			globalThis.document.removeEventListener('visibilitychange', onHide);
			save.beacon();
			save.destroy();
		};
	});
</script>

<svelte:head><title>{data.count.title} · Stock · CJs</title></svelte:head>

<div class="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
	<CountHeader
		title={data.count.title}
		number={data.count.number}
		step={data.count.step}
		startedAtMs={data.count.startedAtMs}
		nowMs={data.nowMs}
		locale={data.locale}
		status={save.status}
		error={save.error}
	/>

	{#if form?.message}
		<p
			class="mt-4 rounded-[10px] border border-wrong-border bg-wrong-tint px-4 py-3 text-ui text-wrong-ink"
			aria-live="polite"
		>
			{form.message}
		</p>
	{/if}

	{#if data.count.status === 'preparing'}
		<!--
			Wreckage from a rolled-back prepare. `prepareCount` inserts at `preparing` and flips to
			`counting` in the same transaction, so a row still sitting here is not anybody's
			half-done work — and it has no sheet to show.
		-->
		<p class="mt-6 text-ui text-ink-secondary">
			This count never finished being prepared, so there is nothing on it to count. Start a new one
			from your stock list.
		</p>
	{:else if data.count.status === 'applied'}
		<CountApplied
			movements={data.movements}
			net={data.review.net}
			uncosted={data.review.uncosted}
			number={data.count.number}
		/>
	{:else if data.count.status === 'reviewing'}
		<CountReview
			changes={data.differing.filter((row) => row.state === 'varies')}
			matched={data.review.counted - data.review.changes}
			uncounted={data.review.total - data.review.counted}
		/>
	{:else}
		<CountSheet
			differing={data.differing}
			matched={data.matched}
			{values}
			facts={{ matched: matchedNow, counted: progress.counted, total: progress.total }}
			oncount={count}
		/>
	{/if}
</div>

{#if data.count.status === 'counting'}
	<CountFooter
		counted={progress.counted}
		total={progress.total}
		net={effect.net}
		uncosted={effect.uncosted}
	>
		{#snippet actions()}
			<Button href="/inventory" variant="secondary">Finish later</Button>

			<!--
				THE PRIMARY NAMES THE COUNT — "Review 5 changes", never "Continue". A person who
				reads it already knows the size of the decision on the next step.

				AND IT FLUSHES FIRST, OR IT DOES NOT GO. Reviewing a count with an unsaved row would
				show somebody a figure to approve that is not the figure that would be applied —
				and once the count reaches `reviewing`, the save endpoint refuses the row, so the
				work would be stranded on step 3 with nowhere to land. If the flush leaves anything
				dirty the submit is CANCELLED and the person stays on step 2, where the save
				indicator and the banner above already say what went wrong.
			-->
			<form
				method="POST"
				action="?/review"
				use:enhance={async ({ cancel }) => {
					await save.flush();
					if (save.dirty) {
						cancel();
						return;
					}
					return async ({ update }) => update();
				}}
			>
				<Button type="submit">{reviewChangesLabel(changes)}</Button>
			</form>
		{/snippet}
	</CountFooter>
{:else if data.count.status === 'reviewing'}
	<CountFooter
		counted={data.review.counted}
		total={data.review.total}
		net={data.review.net}
		uncosted={data.review.uncosted}
		promise="This is the last point of return — nothing has changed yet."
	>
		{#snippet actions()}
			<form method="POST" action="?/back" use:enhance>
				<Button type="submit" variant="secondary">Go back and change something</Button>
			</form>
			<form method="POST" action="?/apply" use:enhance>
				<Button type="submit">Update stock</Button>
			</form>
		{/snippet}
	</CountFooter>
{/if}
