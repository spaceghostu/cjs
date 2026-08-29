<script lang="ts">
	/**
	 * THE QUOTES SCREEN.
	 *
	 * **Not designed.** The design draws the editor and the acceptance outcome, and never the
	 * list they are reached from — but a module whose only entry point is a URL somebody has to
	 * know is not a module. So this is built from the foundations and marked as awaiting a
	 * design pass, the same treatment T06 gives the four stub screens.
	 *
	 * What it does not do is invent: no filters, no bulk actions, no columns the design has not
	 * asked for. A row per quote, the status, who it is for, what it came to, and when it last
	 * moved.
	 */
	import { Amount, Badge, Blank, Button } from '$lib/ui';
	import { formatShortDate, type QuoteStatus } from '$lib/core/quoting';
	import type { Money } from '$lib/core/money';

	type Row = {
		id: string;
		number: string | null;
		status: QuoteStatus;
		customerName: string | null;
		validUntil: string | null;
		total: Money | null;
		updatedAt: Date;
	};

	let {
		quotes,
		oncreate,
		creating = false
	}: {
		quotes: readonly Row[];
		oncreate: () => void;
		creating?: boolean;
	} = $props();

	/**
	 * The words a person would use, and the tone each one earns.
	 *
	 * `sent` and `viewed` are NOT warnings. A quote waiting on a client is the normal state of
	 * a quote, and colouring it amber would make an ordinary Tuesday look like a problem.
	 */
	const LABELS: Readonly<Record<QuoteStatus, string>> = {
		draft: 'Draft',
		sent: 'Sent',
		viewed: 'Opened',
		accepted: 'Accepted',
		declined: 'Declined',
		expired: 'Expired'
	};

	/**
	 * `sent` and `viewed` take the colourless `sent` badge on purpose. A quote waiting on a
	 * client is the normal life of a quote, and amber would make an ordinary Tuesday look like
	 * a problem. Only an answer earns a colour.
	 */
	const TONES: Readonly<Record<QuoteStatus, 'draft' | 'sent' | 'settled' | 'wrong'>> = {
		draft: 'draft',
		sent: 'sent',
		viewed: 'sent',
		accepted: 'settled',
		declined: 'wrong',
		expired: 'draft'
	};
</script>

<!--
	The row href carries a quote id, so there is no literal route id for `resolve()` to
	type-check against. Same situation as the resume cards on Home, and disabled for the same
	reason: the fix, if a base path is ever configured, belongs where the href is built.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<div class="mx-auto w-full max-w-4xl px-4 py-8 lg:px-8">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-[24px] font-semibold text-ink">Quotes</h1>
			<p class="mt-1 text-ui text-ink-secondary">Branded quotes clients can accept online.</p>
		</div>
		<Button onclick={oncreate} disabled={creating}>
			{creating ? 'Starting…' : 'New quote'}
		</Button>
	</div>

	<!--
		Said out loud rather than left as a surprise. The same note the stub screens carry, for
		the same reason: a screen that has not had a design pass should say so to the person
		looking at it, not only in a ticket.
	-->
	<p
		class="mt-4 rounded-[10px] border border-line-default bg-surface-card px-4 py-3 text-helper text-ink-muted"
	>
		This list is awaiting a design pass. The quote editor and the document are designed; the screen
		you reach them from is not, so this is deliberately plain.
	</p>

	{#if quotes.length === 0}
		<p class="mt-8 text-ui text-ink-secondary">
			Nothing quoted yet. Start one and it will save as you go — you can close it and come back.
		</p>
	{:else}
		<ul class="mt-6 overflow-hidden rounded-[10px] border border-line-default">
			{#each quotes as quote (quote.id)}
				<li class="border-b border-line-row last:border-b-0">
					<a
						href="/quoting/{quote.id}"
						class="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 outline-none hover:bg-surface-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
					>
						<span class="min-w-0">
							<span class="flex flex-wrap items-center gap-2">
								<span class="text-ui text-ink">
									{quote.customerName ?? 'No client chosen yet'}
								</span>
								<Badge variant={TONES[quote.status]}>{LABELS[quote.status]}</Badge>
							</span>
							<span class="mt-0.5 block text-helper text-ink-muted">
								{quote.number ?? 'Draft'}
								{#if quote.validUntil}· valid until {formatShortDate(quote.validUntil)}{/if}
							</span>
						</span>

						<span class="shrink-0 text-right">
							{#if quote.total}
								<Amount value={quote.total} size="sm" decimals={0} />
							{:else}
								<!-- A draft has no frozen total, and pricing fifty drafts to fill a
								     column nobody asked for is the N+1 this list exists without. -->
								<Blank />
							{/if}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
