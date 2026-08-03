<script lang="ts">
	/**
	 * "Search, or ask a question", ⌘K.
	 *
	 * > The command bar is the only always-visible AI surface, and turning it off removes it
	 * > without taking any capability with it. Anything it drafts arrives in the normal form,
	 * > labelled, for you to send.
	 *
	 * ONE PALETTE, TWO TRIGGERS.
	 *
	 * This component is the dialog and the ⌘K listener, and it renders nothing until it is
	 * opened. The two things that open it look nothing alike — a 34px field in the desktop
	 * top bar, a 44px touch target in the mobile header — and both are markup where they
	 * belong, calling `openBar()` on this instance.
	 *
	 * Rendering the whole bar twice and hiding one with a media query would mount two ⌘K
	 * listeners, and the keystroke would open a dialog and immediately toggle it shut again.
	 *
	 * WHAT THIS COMPONENT CANNOT DO
	 * -----------------------------
	 * Commit anything. Every result is a LINK to somewhere in the ordinary product. There is
	 * no action, no form post and no fetch other than the read-only search. That is what makes
	 * "nothing it produces is ever sent, saved or committed by it" a property of the code
	 * rather than a promise.
	 */
	import * as Command from '$lib/components/ui/command/index.js';
	import { allHits, type SearchGroup } from '$lib/core/search';

	let {
		/** Injected so the bar renders in a story and a test without an endpoint. */
		search,
		placeholder = 'Search, or ask a question'
	}: {
		search: (query: string) => Promise<readonly SearchGroup[]>;
		placeholder?: string;
	} = $props();

	let open = $state(false);
	let query = $state('');
	let groups = $state<readonly SearchGroup[]>([]);
	let loading = $state(false);

	/**
	 * Where focus was before the dialog opened.
	 *
	 * bits-ui restores focus to its TRIGGER on close, and ⌘K has no trigger — it can fire
	 * from anywhere, including a half-filled invoice line. Losing the caret there is the
	 * difference between a shortcut and an interruption.
	 */
	let restoreFocusTo: HTMLElement | null = null;

	/** The public surface. `bind:this` on the layout, called by either trigger. */
	export function openBar(): void {
		restoreFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		open = true;
	}

	/**
	 * The last query a response was for. Responses can land out of order — "inv" is a slower
	 * query than "invo" — and rendering a stale one is a list that disagrees with the input
	 * the person is looking at.
	 */
	let inFlight = 0;

	/**
	 * Closing resets the bar and gives the caret back.
	 *
	 * An effect rather than an `onOpenChange` prop because `Command.Dialog` spreads its rest
	 * props into BOTH the dialog and the command root, so a handler passed there would be
	 * handed to a component that has no use for it. `open` is the only thing that has to be
	 * true, and this reacts to it however it changed — ⌘K, Esc, the overlay, or a selection.
	 */
	$effect(() => {
		if (open) return;

		query = '';
		groups = [];

		const previous = restoreFocusTo;
		restoreFocusTo = null;
		previous?.focus();
	});

	async function run(value: string): Promise<void> {
		const ticket = ++inFlight;
		if (value.trim().length === 0) {
			groups = [];
			loading = false;
			return;
		}

		loading = true;
		try {
			const result = await search(value);
			if (ticket === inFlight) groups = result;
		} finally {
			if (ticket === inFlight) loading = false;
		}
	}

	$effect(() => {
		void run(query);
	});

	function onKeydown(event: KeyboardEvent): void {
		// Ctrl as well as ⌘: the product is used on Windows laptops in the field.
		if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		if (open) open = false;
		else openBar();
	}

	const count = $derived(allHits(groups).length);
</script>

<svelte:window onkeydown={onKeydown} />

<Command.Dialog
	bind:open
	title="Search"
	description="Search this business, or jump to a screen."
	shouldFilter={false}
>
	<!--
		`shouldFilter={false}` because the server already ranked and scoped the list. Letting
		the client filter again would quietly drop results that matched on a field the label
		does not show — a customer found by contact person, an invoice found by number.

		bits-ui gives the input role="combobox" and aria-expanded but no aria-controls, which
		ARIA requires and which only the caller can supply. Same pairing as the T02 story.
	-->
	<Command.Input {placeholder} bind:value={query} aria-controls="command-bar-results" />
	<Command.List id="command-bar-results">
		<!--
			Plain elements rather than `Command.Empty` / `Command.Loading`: those decide their
			own visibility from the primitive's internal filter count, and this list is filtered
			on the server with `shouldFilter={false}` — so their count is not the one that
			matters. The condition is stated here, where the truth is.
		-->
		{#if loading}
			<p class="py-6 text-center text-ui text-ink-muted">Searching…</p>
		{:else if query.trim().length > 0 && count === 0}
			<p class="py-6 text-center text-ui text-ink-secondary">Nothing matches that.</p>
		{/if}

		{#each groups as group (group.kind)}
			<Command.Group heading={group.label}>
				{#each group.hits as hit (hit.id)}
					<!--
						A link, not a handler. Middle-click, ⌘-click and "copy link address" all
						work, and there is nowhere for a side effect to hide.
					-->
					<Command.LinkItem href={hit.href} value={hit.id} onSelect={() => (open = false)}>
						<span class="min-w-0 flex-1 truncate">{hit.title}</span>
						{#if hit.subtitle}
							<span class="shrink-0 text-helper text-ink-muted">{hit.subtitle}</span>
						{/if}
						{#if hit.meta}
							<Command.Shortcut class="numeric">{hit.meta}</Command.Shortcut>
						{/if}
					</Command.LinkItem>
				{/each}
			</Command.Group>
		{/each}
	</Command.List>

	<!--
		Announced, not drawn. The list is keyboard-driven, so a screen reader needs the count
		it cannot see changing; a sighted person can already see it.
	-->
	<p aria-live="polite" class="sr-only">
		{count === 0 ? 'No results' : `${count} result${count === 1 ? '' : 's'}`}
	</p>
</Command.Dialog>
