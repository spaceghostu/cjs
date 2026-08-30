<script lang="ts">
	/**
	 * THE QUOTE EDITOR.
	 *
	 * The design's framing: _"the document is client-facing, so it leads."_ Two panes — the form
	 * on the left, the live client-facing document on the right — because what the client
	 * receives is the thing being made, not a by-product of filling in a form.
	 *
	 * ONE SOURCE OF TRUTH ON THIS SCREEN
	 * ----------------------------------
	 * `state` is what the person typed. Everything else is derived from it, in this order:
	 *
	 *   state  ->  quoteFromEditor  ->  priceQuote  ->  the totals column
	 *                                              \->  quoteDocument -> the preview
	 *                                               \-> the deposit helper
	 *
	 * So the three places a number appears cannot disagree, and none of them does arithmetic:
	 * `priceDocument` is the only thing in this codebase that computes a total.
	 *
	 * AND ONE SOURCE OF TRUTH ABOUT SAVING
	 * ------------------------------------
	 * `Autosave` owns it. The indicator reads the server's timestamp and never an optimistic
	 * guess, a closed tab flushes through `sendBeacon`, and sending flushes first — a quote
	 * emailed with an unsaved line would be a document the business never finished.
	 */
	import { onMount } from 'svelte';
	import {
		blankLine,
		blockersToSending,
		differencesFromRecord,
		editorFromQuote,
		editorTaxLabel,
		lineAmounts,
		lineFromItem,
		patchFromEditor,
		priceQuote,
		quoteDocument,
		quoteFromEditor,
		type EditorLine,
		type EditorState,
		type FieldDifference,
		type Quote
	} from '$lib/core/quoting';
	import type { DocumentIssuer } from '$lib/core/document';
	import type { PickableItem } from '$lib/core/inventory';
	import EditorHeader from './EditorHeader.svelte';
	import InventoryPicker from './InventoryPicker.svelte';
	import LineTable from './LineTable.svelte';
	import PreviewPane from './PreviewPane.svelte';
	import SaveBackDialog from './SaveBackDialog.svelte';
	import TermsFields from './TermsFields.svelte';
	import TotalsPanel from './TotalsPanel.svelte';
	import WhoItsFor from './WhoItsFor.svelte';
	import { Autosave } from './state.svelte.js';
	import type { Snippet } from 'svelte';

	let {
		quote,
		issuer,
		customers,
		customerRecord,
		usualDays,
		footer,
		provisionalNumber,
		saveEndpoint,
		promoteEndpoint,
		pdfHref,
		sending = false,
		onsend,
		inventoryOffer,
		sourceItems = null
	}: {
		quote: Quote;
		issuer: DocumentIssuer;
		customers: readonly { id: string; name: string }[];
		/** The address book's version of the chosen client, for the save-back comparison. */
		customerRecord: Readonly<Record<string, string | null>> | null;
		usualDays: number;
		footer: readonly string[] | null;
		provisionalNumber: string | null;
		saveEndpoint: string;
		promoteEndpoint: string;
		pdfHref: string;
		sending?: boolean;
		onsend: () => void;
		inventoryOffer?: Snippet;
		/**
		 * What the picker offers, when Inventory is owned. NULL means "not offered" — the
		 * caller's own `inventoryOffer` (T13's add-the-module link) renders instead. An EMPTY
		 * ARRAY means "owned but nothing in it": the picker still renders, and its dialog
		 * points at /inventory. The two are different facts and get different rows.
		 */
		sourceItems?: readonly PickableItem[] | null;
	} = $props();

	/*
	 * Read once, on purpose — hence the two ignores.
	 *
	 * `quote` is the SNAPSHOT the server loaded. The form takes a copy of it and owns that copy
	 * from then on; re-seeding the fields from a later `quote` would overwrite what somebody is
	 * in the middle of typing every time the page data refreshed. Same for the save endpoint,
	 * which is an id in a URL and cannot change while this component is alive.
	 */
	// svelte-ignore state_referenced_locally
	let draft = $state<EditorState>(editorFromQuote(quote));

	// svelte-ignore state_referenced_locally
	const autosave = new Autosave({ endpoint: saveEndpoint, savedAtMs: quote.savedAt.getTime() });

	/**
	 * The whole derivation chain, in one place.
	 *
	 * `quote` is the BASE: the id, the status, and the pricing contract this document was
	 * issued under. The form owns everything else. A VAT rate is never re-derived in the
	 * browser — it is the server's snapshot, and a quote must price the way it did the day it
	 * was made.
	 */
	const live = $derived(quoteFromEditor(quote, draft));
	const price = $derived(priceQuote(live));
	const amounts = $derived(lineAmounts(price));
	const preview = $derived(
		quoteDocument({
			quote: live,
			price,
			issuer,
			footer: footer ?? undefined,
			provisionalNumber
		})
	);

	const blockers = $derived(blockersToSending(draft));

	/**
	 * Save on every change, and not one save per keystroke.
	 *
	 * `$effect` reads `state` deeply through `patchFromEditor`, so it re-runs whenever anything
	 * on the form changes — and `Autosave` debounces, coalesces and serialises from there.
	 */
	let primed = false;
	$effect(() => {
		const patch = patchFromEditor(draft);
		// The first run is the load, not an edit. Saving it would mark a freshly-opened quote as
		// touched and move its "last saved" time for no reason.
		if (!primed) {
			primed = true;
			return;
		}
		autosave.change(patch);
	});

	onMount(() => {
		const flushOnLeave = () => autosave.beacon();
		const onHide = () => {
			if (globalThis.document.visibilityState === 'hidden') autosave.beacon();
		};

		globalThis.addEventListener('pagehide', flushOnLeave);
		globalThis.document.addEventListener('visibilitychange', onHide);

		return () => {
			globalThis.removeEventListener('pagehide', flushOnLeave);
			globalThis.document.removeEventListener('visibilitychange', onHide);
			autosave.beacon();
			autosave.destroy();
		};
	});

	// ── Saving a client change back to the address book ───────────────────────────────
	let askOpen = $state(false);
	let differences = $state<readonly FieldDifference[]>([]);
	/** Fields the person has already declined, so they are not asked twice about the same edit. */
	let declined = $state<string>('');

	function askAboutClientChanges() {
		if (!customerRecord || !draft.customerId) return;
		const found = differencesFromRecord(draft, customerRecord);
		const signature = found.map((d) => `${d.field}=${d.now}`).join('|');
		if (found.length === 0 || signature === declined) return;

		differences = found;
		askOpen = true;
	}

	async function promote(fields: readonly string[]) {
		askOpen = false;
		await autosave.flush();
		await fetch(promoteEndpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ fields })
		});
	}

	function dismissAsk() {
		askOpen = false;
		declined = differences.map((d: FieldDifference) => `${d.field}=${d.now}`).join('|');
	}

	/** Choosing a different client re-takes the snapshot on the server, so the page reloads it. */
	async function changeClient() {
		await autosave.flush();
		globalThis.location.reload();
	}

	/**
	 * A pick appends a snapshotted line, exactly as "Add a line" appends a blank one — and
	 * the autosave `$effect` above picks it up like any other edit. The uuid is freshly
	 * minted PER PICK, and that is load-bearing: `reconcileLines`' update path never writes
	 * `sourceItemId`, so provenance is only recorded when the line inserts.
	 */
	function pickItem(item: PickableItem): void {
		draft.lines = [...draft.lines, lineFromItem(item, crypto.randomUUID())];
	}

	async function send() {
		// Everything typed goes first. The alternative is emailing a client a document that is
		// missing the last thing somebody wrote.
		await autosave.flush();
		if (autosave.status === 'error') return;
		onsend();
	}
</script>

<!--
	The add-line row's last word. When the route supplied items, the picker takes the slot
	LineTable offers; when it supplied null, the caller's own `inventoryOffer` — T13's link to
	add the module — passes through untouched below.
-->
{#snippet picker()}
	{#if sourceItems !== null}
		<InventoryPicker items={sourceItems} onpick={pickItem} />
	{/if}
{/snippet}

<div class="flex h-full min-h-0 flex-col">
	<EditorHeader
		clientName={draft.name || null}
		status={autosave.status}
		savedAtMs={autosave.savedAtMs}
		error={autosave.error}
		{pdfHref}
		{sending}
		canSend={blockers.length === 0}
		onsend={send}
		onretry={() => void autosave.flush()}
	/>

	<div class="flex min-h-0 flex-1">
		<!-- The form. Scrolls on its own, so the preview stays put beside it. -->
		<div class="min-w-0 flex-1 overflow-y-auto px-8 py-6">
			<div class="flex max-w-[720px] flex-col gap-8" onfocusoutcapture={askAboutClientChanges}>
				<WhoItsFor bind:state={draft} {customers} onclientchange={changeClient} />

				<LineTable
					bind:lines={draft.lines}
					{amounts}
					onadd={() => (draft.lines = [...draft.lines, blankLine(crypto.randomUUID())])}
					onremove={(id) => (draft.lines = draft.lines.filter((l: EditorLine) => l.id !== id))}
					inventoryOffer={sourceItems === null ? inventoryOffer : picker}
				/>

				<div class="flex justify-end">
					<TotalsPanel {price} taxLabel={editorTaxLabel(price.priced)} />
				</div>

				<TermsFields bind:state={draft} {price} {usualDays} />

				{#if blockers.length > 0}
					<!--
						Never a mysterious grey button. If the quote cannot go yet, the screen says
						what is missing — in the order somebody would fix it.
					-->
					<section aria-live="polite">
						<h2 class="text-eyebrow text-ink-muted uppercase">Before you send</h2>
						<ul class="mt-2 flex flex-col gap-1">
							{#each blockers as blocker (blocker)}
								<li class="text-ui text-ink-secondary">{blocker}</li>
							{/each}
						</ul>
					</section>
				{/if}
			</div>
		</div>

		<!-- Hidden below the shell's breakpoint: 520px of paper does not fit beside a form. -->
		<div class="hidden xl:flex">
			<PreviewPane document={preview} />
		</div>
	</div>
</div>

<SaveBackDialog
	bind:open={askOpen}
	clientName={customerRecord?.name ?? 'your customer list'}
	{differences}
	onsave={promote}
	ondismiss={dismissAsk}
/>
