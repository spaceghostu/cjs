<script lang="ts">
	/**
	 * THE SUMMARY BAR — the neutrality rule in miniature.
	 *
	 * T20 quotes the design's own subtitle for this screen:
	 *
	 *   > Money is neutral; colour only flags the exception. "Overdue: none" is stated rather
	 *   > than hidden.
	 *
	 * Both halves are here. `Owed to you` carries the invoicing accent because it is the figure
	 * the screen exists for; `Due this week` is plain ink; and `Overdue` renders the WORD `None`
	 * when there is nothing late — not `R0`, which reads as a number somebody should look into.
	 * When there IS overdue money it becomes an amount in `--state-wrong`, and that is the only
	 * colour spent on this bar.
	 *
	 * Values from the design: `--surface-card`, `--border-default`, radius 10px, padding 18/20,
	 * gap 48px.
	 */
	import { Amount, Blank, Button } from '$lib/ui';
	import type { Money } from '$lib/core/money';

	let {
		owed,
		dueThisWeek,
		overdue,
		overdueCount,
		exportHref
	}: {
		owed: Money;
		dueThisWeek: Money;
		overdue: Money;
		overdueCount: number;
		exportHref: string;
	} = $props();
</script>

<div
	class="mt-6 flex flex-wrap items-center justify-between gap-6 rounded-[10px] border border-line-default bg-surface-card px-5 py-[18px]"
>
	<dl class="flex flex-wrap items-center gap-x-12 gap-y-4">
		<div>
			<dt class="text-helper text-ink-muted">Owed to you</dt>
			<dd class="mt-1">
				<!-- The receivable total. The one figure on this screen that carries the module accent. -->
				<Amount value={owed} size="lg" tone="owed" decimals={0} />
			</dd>
		</div>

		<div>
			<dt class="text-helper text-ink-muted">Due this week</dt>
			<dd class="mt-1">
				<Amount value={dueThisWeek} size="lg" decimals={0} />
			</dd>
		</div>

		<div>
			<dt class="text-helper text-ink-muted">Overdue</dt>
			<dd class="mt-1">
				{#if overdueCount === 0}
					<!--
						Stated, not hidden, and in WORDS. A zero here is the reassurance the owner came
						for; rendering it as R0,00 would make them read a figure and work out that it
						is fine, which is the opposite of what this bar is for.
					-->
					<Blank kind="none" class="text-[20px]" />
				{:else}
					<Amount value={overdue} size="lg" tone="default" decimals={0} class="text-wrong-ink" />
				{/if}
			</dd>
		</div>
	</dl>

	<div class="flex flex-col items-start gap-1 sm:items-end">
		<!--
			A real link rather than a button: the export streams a file from a `+server.ts`, and the
			router cannot navigate to a download. Same reason the sidebar's "Export your data" row
			carries `reload`.
		-->
		<Button variant="secondary" href={exportHref} data-sveltekit-reload>Export CSV</Button>
		<!-- The platform's promise, stated where somebody is about to use it. -->
		<p class="text-helper text-ink-muted">Yours to take, any time</p>
	</div>
</div>
