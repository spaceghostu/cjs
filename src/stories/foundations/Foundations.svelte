<script lang="ts">
	import { BrandScope, BRAND_OPTIONS } from '$lib/components/theme/index.js';
	import TokenSwatch from './TokenSwatch.svelte';
	import {
		ACCENTS,
		BORDERS,
		BRAND,
		PAPER,
		RADII,
		SPACING,
		STATES,
		SURFACES,
		TEXT,
		TYPE_SCALE
	} from './token-groups.js';

	/**
	 * The design's foundations block, rendered from the live token layer.
	 *
	 * The design's own claim is that "a new module should need no new visual decisions".
	 * This page is where that claim is checked: everything a screen is allowed to reach
	 * for is on it, and nothing on it is a literal.
	 */
</script>

{#snippet section(title: string, note: string, body: import('svelte').Snippet)}
	<section class="border-t border-line-subtle pt-6">
		<h2 class="text-section text-ink">{title}</h2>
		<p class="mt-1 mb-4 max-w-prose text-helper text-ink-muted">{note}</p>
		{@render body()}
	</section>
{/snippet}

<div class="min-h-svh bg-surface-base px-6 py-8 text-ink">
	<div class="mx-auto flex max-w-5xl flex-col gap-8">
		<header>
			<p class="eyebrow">Foundations</p>
			<h1 class="mt-1 text-title text-ink">CJs token system</h1>
			<p class="mt-2 max-w-prose text-body text-ink-secondary">
				Every value below is read back off the live stylesheet. Switch the theme in the toolbar —
				the whole page is the same markup in both.
			</p>
		</header>

		{#snippet surfaces()}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each SURFACES as { token, role } (token)}
					<TokenSwatch {token} {role} />
				{/each}
			</div>
			<!-- Depth by layer, not shadow: base holds sunken holds card holds raised. -->
			<div class="mt-4 rounded-xl border border-line-default bg-surface-base p-4">
				<div class="rounded-lg bg-surface-sunken p-4">
					<div class="rounded-lg border border-line-default bg-surface-card p-4">
						<div class="rounded-md bg-surface-raised px-3 py-2 text-ui text-ink">
							Active nav row on a card, in a sunken panel, on the page.
						</div>
					</div>
				</div>
			</div>
		{/snippet}
		{@render section('Surfaces', 'Depth comes from stacking layers, never from shadow.', surfaces)}

		{#snippet borders()}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each BORDERS as { token, role } (token)}
					<TokenSwatch {token} {role} />
				{/each}
			</div>
		{/snippet}
		{@render section('Borders', 'Ascending prominence, from row rule to hover edge.', borders)}

		{#snippet textRamp()}
			<div class="flex flex-col gap-4 rounded-lg border border-line-default bg-surface-card p-4">
				{#each TEXT as { token } (token)}
					<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
						<span class="text-ui" style="color: var({token})">
							The quick brown fox jumps over 12 lazy dogs
						</span>
						<span class="ml-auto numeric text-[11px] text-ink-muted">{token}</span>
					</div>
				{/each}
			</div>
			<div class="mt-3 grid gap-3 sm:grid-cols-2">
				{#each TEXT as { token, role } (token)}
					<TokenSwatch {token} {role} against="--surface-card" />
				{/each}
				<TokenSwatch
					token="--decoration-quiet"
					role="NEVER a glyph — rules and inert marks only"
					against="--surface-card"
				/>
			</div>
		{/snippet}
		{@render section(
			'Text',
			'Four steps, measured against --surface-card. --text-muted is the floor; nothing that carries a glyph goes quieter. --decoration-quiet is below it, which is exactly why it is not a text token.',
			textRamp
		)}

		{#snippet brand()}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each BRAND as { token, role } (token)}
					<TokenSwatch {token} {role} />
				{/each}
			</div>
			<div class="mt-4 flex flex-wrap items-center gap-3">
				<span class="rounded-md bg-brand px-4 py-2 text-ui font-medium text-ink-on-brand">
					Primary action
				</span>
				<span
					class="rounded-md border border-line-strong px-4 py-2 text-ui text-ink"
					style="outline: 2px solid var(--brand-focus-ring); outline-offset: 2px"
				>
					Focused
				</span>
				<span class="text-[13px] font-medium text-brand-ink">Resume</span>
			</div>
		{/snippet}
		{@render section(
			'Brand',
			'Per-tenant. Only --brand is set from tenant data; hover, active, focus ring and ink all re-derive from it in CSS. --brand-ink exists because --brand itself is too dark to carry a label on a card.',
			brand
		)}

		{#snippet tenants()}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each BRAND_OPTIONS as option (option.value)}
					<BrandScope brand={option.value}>
						<div class="rounded-lg border border-line-default bg-surface-card p-4">
							<p class="eyebrow">{option.label}</p>
							<div class="mt-3 flex gap-1">
								{#each BRAND as { token } (token)}
									<span class="h-6 flex-1 rounded-sm" style="background: var({token})"></span>
								{/each}
							</div>
							<span
								class="mt-3 block rounded-md bg-brand px-3 py-2 text-center text-[13px] font-medium text-ink-on-brand"
							>
								Add module
							</span>
							<p class="mt-2 text-[13px] font-medium text-brand-ink">Resume</p>
						</div>
					</BrandScope>
				{/each}
			</div>
		{/snippet}
		{@render section(
			'Per-tenant brand',
			'The four options the design offers. Each card sets one custom property; the entire ramp follows.',
			tenants
		)}

		{#snippet semantics()}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each STATES as { token, role } (token)}
					<TokenSwatch {token} {role} against="--surface-card" />
				{/each}
			</div>
			<div
				class="mt-4 flex flex-wrap gap-2 rounded-lg border border-line-default bg-surface-card p-4"
			>
				<span class="rounded-[5px] bg-settled-tint px-2.25 py-1 text-helper text-settled-ink"
					>Paid</span
				>
				<span class="rounded-[5px] bg-surface-raised px-2.25 py-1 text-helper text-ink-secondary">
					Sent
				</span>
				<span class="rounded-[5px] bg-attention-tint px-2.25 py-1 text-helper text-attention-ink">
					Due in 3 days
				</span>
				<span class="rounded-[5px] bg-wrong-tint px-2.25 py-1 text-helper text-wrong-ink"
					>Overdue</span
				>
				<span class="rounded-[5px] bg-surface-quiet px-2.25 py-1 text-helper text-ink-muted">
					Draft
				</span>
				<span class="rounded-[5px] bg-quoting-tint px-2.25 py-1 text-helper text-quoting-ink">
					Drafted for you · check it
				</span>
			</div>
		{/snippet}
		{@render section(
			'Semantic state',
			'Pill fills are the same colour at 15% alpha. Sent and Draft are deliberately colourless — they are not states worth spending colour on.',
			semantics
		)}

		{#snippet accents()}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each ACCENTS as { token, role } (token)}
					<TokenSwatch {token} {role} against="--surface-card" />
				{/each}
			</div>
			<div class="mt-4 flex flex-wrap gap-2">
				{#each ACCENTS as { token, tint, role } (token)}
					<span
						class="flex items-center gap-2 rounded-md px-3 py-2 text-[13px]"
						style="background: var({tint}); color: var({token}-ink)"
					>
						<span class="size-2 rounded-full" style="background: var({token})"></span>
						{role}
					</span>
				{/each}
			</div>
		{/snippet}
		{@render section(
			'Module accents',
			'Wayfinding only, never fields of colour. Fixed across all tenants, so a client colour can never collide with the meaning of a module. Tint is the accent at 18% alpha.',
			accents
		)}

		{#snippet type()}
			<div class="flex flex-col gap-4 rounded-lg border border-line-default bg-surface-card p-4">
				{#each TYPE_SCALE as { className, role, spec } (className)}
					<div class="flex flex-wrap items-baseline gap-x-4">
						<span class={className}>Counter and bar top</span>
						<span class="ml-auto numeric text-[11px] text-ink-muted">{spec}</span>
						<span class="w-full text-helper text-ink-muted">{role}</span>
					</div>
				{/each}
			</div>
			<div class="mt-3 rounded-lg border border-line-default bg-surface-card p-4">
				<p class="eyebrow">Every numeral is mono and tabular</p>
				<table class="mt-2 w-full numeric text-ui">
					<tbody>
						<tr>
							<td class="py-1 text-ink">Counter and bar top</td>
							<td class="py-1 text-right text-ink">16 400.00</td>
						</tr>
						<tr>
							<td class="py-1 text-ink">Shelving unit</td>
							<td class="py-1 text-right text-ink">4 600.00</td>
						</tr>
						<tr>
							<td class="py-1 text-ink-muted">Fitting and finishing</td>
							<td class="py-1 text-right text-ink-muted">±0.00</td>
						</tr>
					</tbody>
				</table>
			</div>
		{/snippet}
		{@render section(
			'Type',
			'Inter for words, JetBrains Mono for numbers. Columns of figures align on the decimal because every numeral is tabular.',
			type
		)}

		{#snippet spaceAndRadius()}
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="rounded-lg border border-line-default bg-surface-card p-4">
					<p class="eyebrow">Spacing</p>
					<div class="mt-3 flex flex-col gap-2">
						{#each SPACING as { className, px } (className)}
							<div class="flex items-center gap-3">
								<span class="h-2 rounded-sm bg-brand {className}"></span>
								<span class="numeric text-[11px] text-ink-muted">{px}</span>
							</div>
						{/each}
					</div>
				</div>
				<div class="rounded-lg border border-line-default bg-surface-card p-4">
					<p class="eyebrow">Radius</p>
					<div class="mt-3 flex flex-col gap-3">
						{#each RADII as { className, role, px } (className)}
							<div class="flex items-center gap-3">
								<span class="size-10 border border-line-strong bg-surface-raised {className}"
								></span>
								<span class="text-[13px] text-ink">{role}</span>
								<span class="ml-auto numeric text-[11px] text-ink-muted">{px}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
			<div class="mt-4 rounded-lg border border-line-default bg-surface-card p-4">
				<p class="eyebrow">Motion</p>
				<p class="mt-1 text-helper text-ink-secondary">
					150–200ms, ease-out, forward only. Hover the bar.
				</p>
				<span
					class="mt-3 block h-2 w-16 rounded-sm bg-brand hover:w-full"
					style="transition: width var(--motion-base) var(--motion-ease)"
				></span>
			</div>
		{/snippet}
		{@render section(
			'Space, radius, motion',
			'Spacing is 4 / 8 / 12 / 16 / 24 / 32 — Tailwind stock, unchanged. Radius is 8 for controls, 12 for cards, 14 for dialogs and shell frames.',
			spaceAndRadius
		)}

		{#snippet paper()}
			<div class="grid gap-4 lg:grid-cols-[1fr_auto]">
				<!-- A document always sits in a sunken preview gutter, never straight on the page. -->
				<div class="rounded-xl bg-surface-sunken p-4">
					<div class="rounded-lg p-6" style="background: var(--paper-bg); color: var(--paper-ink)">
						<p class="eyebrow" style="color: var(--paper-ink-muted)">Quote · Q-2041</p>
						<p class="mt-1 text-title">Thornhill Joinery</p>
						<hr class="my-4 border-0 border-t" style="border-color: var(--paper-rule)" />
						<div class="flex justify-between numeric text-ui">
							<span>Counter and bar top</span><span>16 400.00</span>
						</div>
						<hr class="my-2 border-0 border-t" style="border-color: var(--paper-rule-light)" />
						<div class="flex justify-between numeric text-ui">
							<span>Shelving unit</span><span>4 600.00</span>
						</div>
					</div>
				</div>
				<div class="flex min-w-64 flex-col gap-3">
					{#each PAPER as { token, role } (token)}
						<TokenSwatch {token} {role} />
					{/each}
				</div>
			</div>
		{/snippet}
		{@render section(
			'Paper',
			'What the client receives. Always light, in both themes — these tokens are declared once and never overridden, so switching the theme cannot touch a document.',
			paper
		)}
	</div>
</div>
