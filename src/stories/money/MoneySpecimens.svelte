<script lang="ts">
	import { Amount, Blank, Qty, StatDelta, UnitPrice } from '$lib/components/money/index.js';
	import type { AmountSize, AmountTone } from '$lib/components/money/index.js';
	import type { Money, Quantity, UnitPrice as UnitPriceValue } from '$lib/core/money';

	let {
		column,
		qty,
		price,
		from,
		to
	}: {
		column: Money[];
		qty: Quantity;
		price: UnitPriceValue;
		from: Money;
		to: Money;
	} = $props();

	const SIZES: { size: AmountSize; note: string }[] = [
		{ size: 'sm', note: '13px — table cells, dense rows' },
		{ size: 'md', note: '14px — default' },
		{ size: 'lg', note: '20px — a section total' },
		{ size: 'xl', note: '24px — an amount due' },
		{ size: 'hero', note: '32px — the one number on the page' }
	];

	const TONES: { tone: AmountTone; note: string }[] = [
		{ tone: 'default', note: 'money is neutral — this is almost always right' },
		{ tone: 'owed', note: 'a receivable total, and only that' },
		{ tone: 'settled', note: 'paid, matched, all-clear' },
		{ tone: 'muted', note: 'present but not the point' }
	];
</script>

<div class="min-h-svh bg-surface-base px-6 py-8 text-ink">
	<div class="mx-auto flex max-w-4xl flex-col gap-8">
		<header>
			<p class="eyebrow">Foundations</p>
			<h1 class="mt-1 text-title text-ink">Money and numbers</h1>
			<p class="mt-2 max-w-prose text-body text-ink-secondary">
				Every figure below comes from the money core through <code class="numeric"
					>parseMoneyInput</code
				>. Nothing here computes anything.
			</p>
		</header>

		<section class="border-t border-line-subtle pt-6">
			<h2 class="text-section">Alignment</h2>
			<p class="mt-1 mb-4 max-w-prose text-helper text-ink-muted">
				Five orders of magnitude in one column. Tabular figures mean every glyph is the same width,
				so the decimal marks stack whatever the numbers are.
			</p>
			<div
				class="max-w-sm divide-y divide-line-row rounded-lg border border-line-default bg-surface-card px-4"
			>
				{#each column as value, i (i)}
					<div class="flex items-center justify-between py-2">
						<span class="text-ui text-ink-secondary">Line {i + 1}</span>
						<Amount data-testid="aligned-amount" {value} />
					</div>
				{/each}
			</div>
		</section>

		<section class="border-t border-line-subtle pt-6">
			<h2 class="text-section">Size</h2>
			<p class="mt-1 mb-4 max-w-prose text-helper text-ink-muted">
				Tracking tightens to -0.02em at lg and up, where loose figures start to look untidy.
			</p>
			<div class="flex flex-col gap-3 rounded-lg border border-line-default bg-surface-card p-4">
				{#each SIZES as { size, note } (size)}
					<div class="flex flex-wrap items-baseline gap-x-4">
						<Amount value={column[0]} {size} decimals={0} />
						<span class="ml-auto text-helper text-ink-muted">{note}</span>
					</div>
				{/each}
			</div>
		</section>

		<section class="border-t border-line-subtle pt-6">
			<h2 class="text-section">Tone</h2>
			<p class="mt-1 mb-4 max-w-prose text-helper text-ink-muted">
				Colour flags an exception. A screen where every figure is coloured tells the owner nothing
				about which one needs them.
			</p>
			<div class="flex flex-col gap-3 rounded-lg border border-line-default bg-surface-card p-4">
				{#each TONES as { tone, note } (tone)}
					<div class="flex flex-wrap items-baseline gap-x-4">
						<Amount value={column[0]} {tone} size="lg" decimals={0} />
						<span class="ml-auto text-helper text-ink-muted">{tone} — {note}</span>
					</div>
				{/each}
			</div>
		</section>

		<section class="border-t border-line-subtle pt-6">
			<h2 class="text-section">Signed, and rounded</h2>
			<p class="mt-1 mb-4 max-w-prose text-helper text-ink-muted">
				A variance carries its sign with a real minus glyph. A screen summary rounds to whole rand;
				anything a customer receives keeps its cents.
			</p>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="rounded-lg border border-line-default bg-surface-card p-4">
					<p class="eyebrow">Variance</p>
					<div class="mt-2 flex flex-col gap-1">
						<Amount value={column[1]} signed decimals={0} size="lg" />
						<Amount value={column[2]} signed decimals={0} size="lg" tone="muted" />
					</div>
				</div>
				<div class="rounded-lg border border-line-default bg-surface-card p-4">
					<p class="eyebrow">Screen vs document</p>
					<div class="mt-2 flex flex-col gap-1">
						<Amount value={column[2]} decimals={0} size="lg" />
						<Amount value={column[2]} decimals={2} size="lg" tone="muted" />
					</div>
				</div>
			</div>
		</section>

		<section class="border-t border-line-subtle pt-6">
			<h2 class="text-section">Quantity and unit price</h2>
			<div class="max-w-md rounded-lg border border-line-default bg-surface-card p-4">
				<div class="flex items-baseline justify-between py-1">
					<span class="text-ui text-ink">Shelving unit</span>
					<span class="flex gap-6">
						<Qty value={qty} />
						<UnitPrice value={price} />
					</span>
				</div>
			</div>
		</section>

		<section class="border-t border-line-subtle pt-6">
			<h2 class="text-section">A price change</h2>
			<p class="mt-1 mb-4 max-w-prose text-helper text-ink-muted">
				The owner should be able to see what a change costs, not work it out.
			</p>
			<div class="max-w-md rounded-lg border border-line-default bg-surface-card p-4">
				<p class="eyebrow">Adding Invoicing</p>
				<StatDelta {from} {to} unit="a month" accent="invoicing" class="mt-2" />
			</div>
		</section>

		<section class="border-t border-line-subtle pt-6">
			<h2 class="text-section">Missing, two ways</h2>
			<p class="mt-1 mb-4 max-w-prose text-helper text-ink-muted">
				These are not the same thing, and the design does not spell them the same way.
			</p>
			<div
				class="max-w-md divide-y divide-line-row rounded-lg border border-line-default bg-surface-card px-4"
			>
				<div class="flex items-center justify-between py-2">
					<span class="text-ui text-ink-secondary">Draft, nothing priced yet</span>
					<Blank kind="unknown" />
				</div>
				<div class="flex items-center justify-between py-2">
					<span class="text-ui text-ink-secondary">Overdue</span>
					<Blank kind="none" />
				</div>
			</div>
		</section>
	</div>
</div>
