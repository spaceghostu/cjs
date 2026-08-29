<script lang="ts">
	/**
	 * WHAT HAS HAPPENED TO THIS ITEM.
	 *
	 * The ledger for one physical thing, newest first. Every row carries a REASON in plain words —
	 * SPA-6 makes that an acceptance criterion, and it is also the only thing that makes a
	 * quantity checkable: "36 boards" is a claim, and this is the argument for it.
	 *
	 * THE SIGN CARRIES THE DIRECTION. T27 §6 names this exact case — "`−4` in `--state-attention`
	 * versus `+6` in `--text-secondary` is currently distinguished by colour *and* sign. The sign
	 * carries it." So the sign is always rendered, with U+2212 for the minus, and the colour only
	 * reinforces it. Remove the colour and every row still reads correctly.
	 *
	 * THE RUNNING BALANCE is what makes this a ledger rather than a list. The newest row's balance
	 * IS the quantity in the header — computed by a window function over the whole history before
	 * the page was cut, so page two's balances are the real ones rather than a sum of what happens
	 * to be visible.
	 */
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Qty } from '$lib/ui';
	import { movementReasonCopy } from '$lib/core/inventory';
	import { formatShortDate } from '$lib/core/calendar';
	import { qtyText } from '$lib/components/money';
	import type { Quantity } from '$lib/core/money';
	import type { MovementReason } from '$lib/core/inventory';

	type Row = {
		id: string;
		locationName: string;
		qty: Quantity;
		reason: MovementReason;
		sourceRef: string | null;
		note: string | null;
		balanceAfter: Quantity;
		occurredOn: string;
	};

	let {
		movements,
		unit,
		page,
		pageCount,
		pageHref
	}: {
		movements: readonly Row[];
		unit: string;
		page: number;
		pageCount: number;
		pageHref: (page: number) => string;
	} = $props();

	/**
	 * The change, always signed, with a real minus sign.
	 *
	 * `qtyText` renders the magnitude; the sign is prepended here so that a positive movement
	 * reads `+6` rather than a bare `6` — without it the two directions would be told apart by
	 * colour alone, which is precisely what T27 §6 forbids.
	 */
	function signed(qty: Quantity): string {
		const text = qtyText(qty);
		if (qty.e6 < 0) return `−${text.replace(/^-/, '')}`;
		return `+${text}`;
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->

<section class="mt-8">
	<h2 class="text-[16px] font-medium text-ink">What has happened</h2>

	{#if movements.length === 0}
		<p class="mt-3 text-ui text-ink-secondary">
			Nothing has moved yet. When stock comes in or goes out, every change will be listed here with
			the reason for it.
		</p>
	{:else}
		<div class="mt-3 overflow-hidden rounded-[10px] border border-line-default">
			<Table>
				<TableHeader class="bg-surface-card">
					<TableRow>
						<TableHead>When</TableHead>
						<TableHead>What happened</TableHead>
						<TableHead>Where</TableHead>
						<TableHead class="text-right">Change</TableHead>
						<TableHead class="text-right">On hand after</TableHead>
					</TableRow>
				</TableHeader>

				<TableBody>
					{#each movements as row (row.id)}
						<TableRow>
							<TableCell class="numeric text-helper text-ink-secondary">
								{formatShortDate(row.occurredOn)}
							</TableCell>

							<TableCell class="text-ui text-ink">
								{movementReasonCopy(row.reason, row.sourceRef)}
								{#if row.note}
									<span class="mt-0.5 block text-helper text-ink-muted">{row.note}</span>
								{/if}
							</TableCell>

							<TableCell class="text-ui text-ink-secondary">{row.locationName}</TableCell>

							<TableCell
								class="text-right numeric text-ui {row.qty.e6 < 0
									? 'text-attention-ink'
									: 'text-ink-secondary'}"
							>
								{signed(row.qty)}
							</TableCell>

							<TableCell class="text-right">
								<Qty value={row.balanceAfter} />
								<span class="ml-1 text-helper text-ink-muted">{unit}</span>
							</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</div>

		{#if pageCount > 1}
			<nav class="mt-4 flex items-center justify-between gap-4" aria-label="Pages of history">
				<a
					href={pageHref(page - 1)}
					aria-disabled={page <= 1}
					class="rounded-[7px] border border-line-control px-3 py-1.5 text-ui text-ink-secondary
						outline-none hover:bg-surface-raised/60 focus-visible:outline-2 focus-visible:outline-offset-2
						focus-visible:outline-brand-focus-ring focus-visible:outline-solid
						aria-disabled:pointer-events-none aria-disabled:opacity-40"
				>
					Previous
				</a>
				<p class="text-helper text-ink-muted">Page {page} of {pageCount}</p>
				<a
					href={pageHref(page + 1)}
					aria-disabled={page >= pageCount}
					class="rounded-[7px] border border-line-control px-3 py-1.5 text-ui text-ink-secondary
						outline-none hover:bg-surface-raised/60 focus-visible:outline-2 focus-visible:outline-offset-2
						focus-visible:outline-brand-focus-ring focus-visible:outline-solid
						aria-disabled:pointer-events-none aria-disabled:opacity-40"
				>
					Next
				</a>
			</nav>
		{/if}
	{/if}
</section>
