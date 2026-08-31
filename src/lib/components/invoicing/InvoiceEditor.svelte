<script lang="ts">
	/**
	 * THE INVOICE EDITOR.
	 *
	 * **NOT DESIGNED, AND DELIBERATELY MODEST.** T20 says only that "New invoice routes to the
	 * editor, which reuses T16's shape", and no ticket in this phase specifies it — so this is
	 * built from the foundations, kept to what an invoice actually needs, and says so on the
	 * screen. The same treatment the quotes list and the T06 stubs get.
	 *
	 * WHAT IT BORROWS FROM T16, and what it does not:
	 *
	 *   BORROWED  Two panes, with the client-facing document leading. "The document is
	 *             client-facing, so it leads" is as true of an invoice as of a quote, and the
	 *             preview is the same `DocumentSheet` the PDF and the client's own page render.
	 *
	 *   BORROWED  One source of truth. `state` is what the person typed; everything else derives
	 *             from it through `invoiceFromEditor -> priceInvoice -> invoiceDocument`, so the
	 *             totals column and the preview cannot disagree, and neither of them does
	 *             arithmetic.
	 *
	 *   NOT YET   Autosave. T16's editor saves as you type, and this one has an explicit Save —
	 *             because the debounce, the in-flight queue and the `sendBeacon` flush in
	 *             `quoting/state.svelte.ts` were written against that screen's design, and
	 *             copying them onto a screen nobody has drawn would be inventing the design by
	 *             implication. The draft exists from the moment it is created, so "you can close
	 *             this and come back" is already true; what is missing is only the convenience.
	 *
	 * THE ONE THING AN INVOICE'S EDITOR HAS THAT A QUOTE'S DOES NOT is `noCharge` — the design's
	 * `±0.00`. A line at zero because it is being thrown in is not the same fact as a line nobody
	 * has priced, and the button that issues the invoice blocks on one and not the other.
	 */
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import {
		Button,
		Field,
		FieldError,
		Input,
		Label,
		Refusal,
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger,
		Amount
	} from '$lib/ui';
	import { DocumentSheet } from '$lib/components/document';
	import { checkQuantity, checkUnitPrice } from '$lib/core/validation';
	import {
		blankLine,
		blockersToIssuing,
		editorFromInvoice,
		invoiceDocument,
		invoiceFromEditor,
		lineAmounts,
		patchFromEditor,
		priceInvoice,
		type EditorState,
		type Invoice
	} from '$lib/core/invoicing';
	import { documentTaxLabel } from '$lib/core/invoicing';
	import type { DocumentIssuer } from '$lib/core/document';

	let {
		invoice,
		issuer,
		customers,
		bankingDetails,
		footer,
		provisionalNumber,
		usualDays,
		saving = false,
		issuing = false,
		lastSavedAtMs = null,
		message = null,
		onsave,
		onsaveretry,
		onissue,
		ondiscard
	}: {
		invoice: Invoice;
		issuer: DocumentIssuer;
		customers: readonly { id: string; name: string }[];
		bankingDetails: readonly string[] | null;
		footer: readonly string[] | null;
		provisionalNumber: string;
		usualDays: number;
		saving?: boolean;
		issuing?: boolean;
		/**
		 * When the last explicit save LANDED, epoch milliseconds. Null until one has. It feeds
		 * the status line beside Save — the announcement a screen reader gets in place of
		 * watching the button's label flip.
		 */
		lastSavedAtMs?: number | null;
		message?: string | null;
		/**
		 * Present only when `message` came from the SAVE endpoint, so the banner offers a retry
		 * for a save that did not land and offers nothing for a form action, whose own button
		 * already is the retry. It takes the payload for the same reason `onissue` does: the
		 * retry has to be built from what is on the screen NOW, not from whatever failed.
		 */
		onsaveretry?: (payload: unknown) => void;
		onsave: (payload: unknown) => void;
		/** Takes the payload too: issuing FLUSHES it first. See the page's `issue()`. */
		onissue: (payload: unknown) => void;
		ondiscard: () => void;
	} = $props();

	/**
	 * `invoice` is the SNAPSHOT the server loaded. The form takes a copy of it and owns that copy
	 * from then on; re-seeding the fields from a later `invoice` would overwrite what somebody is
	 * in the middle of typing every time the page data refreshed. Same reasoning, same ignore, as
	 * `quoting/QuoteEditor.svelte`.
	 */
	// svelte-ignore state_referenced_locally
	let state = $state<EditorState>(editorFromInvoice(invoice));

	/** state -> invoice -> price -> the totals column, and -> the document -> the preview. */
	const live = $derived(invoiceFromEditor(invoice, state));
	const price = $derived(priceInvoice(live));
	const amounts = $derived(lineAmounts(price));
	const document = $derived(
		invoiceDocument({
			invoice: live,
			price,
			issuer,
			bankingDetails,
			footer,
			provisionalNumber
		})
	);

	const blockers = $derived(blockersToIssuing(state));

	function addLine() {
		state.lines = [...state.lines, blankLine(crypto.randomUUID())];
	}

	function removeLine(id: string) {
		state.lines = state.lines.filter((l) => l.id !== id);
	}

	/**
	 * "21:47" — the same six lines as `clockTime` in `quoting/state.svelte.ts`, duplicated
	 * rather than imported: a cross-module reach into `components/quoting` has no precedent in
	 * this codebase, and two callers is not yet the case for promoting it to a shared core. A
	 * third caller should do that promotion instead of copying this again.
	 */
	function savedClock(atMs: number): string {
		// A transient read of the clock, not reactive state — nothing holds this object and
		// nothing mutates it.
		const at = new Date(atMs);
		return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
	}

	function chooseCustomer(id: string) {
		state.customerId = id;
		const chosen = customers.find((c) => c.id === id);
		// The name is filled in so the preview stops saying "No client chosen yet" immediately.
		// The server retakes the full snapshot from `core_customer` on save — the address, the
		// VAT number and the rest are not the browser's to invent.
		if (chosen) state.name = chosen.name;
	}
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-8">
	<!-- ── The form ─────────────────────────────────────────────────────────────────── -->
	<div class="min-w-0">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-[24px] font-semibold text-ink">New invoice</h1>
				<p class="mt-1 numeric text-helper text-ink-muted">
					<!-- Labelled as provisional: the counter is read without being taken, so two
					     people drafting at once see the same number and exactly one gets it. -->
					{provisionalNumber} · not allocated until you issue it
				</p>
			</div>
			<Button variant="secondary" onclick={ondiscard}>Discard</Button>
		</div>

		<!--
			This editor saves on an explicit Save rather than as you type, so a retry is simply
			that same save again — built from what is on the screen NOW, never from a payload
			captured when the failure happened, which would quietly discard anything typed since.
			The page only decides WHETHER to offer it: `onsaveretry` is passed when the message
			came from the save endpoint and withheld when it came from a form action, where the
			action's own button is the retry.
		-->
		{#if message}
			<Refusal
				{message}
				onretry={onsaveretry ? () => onsaveretry(patchFromEditor(state)) : undefined}
				class="mt-4"
			/>
		{/if}

		<p
			class="mt-4 rounded-[10px] border border-line-default bg-surface-card px-4 py-3 text-helper text-ink-muted"
		>
			This editor is awaiting a design pass. The invoice document and the screens around it are
			designed; the form you build one on is not, so this is deliberately plain.
		</p>

		<!-- ── Who it is for ──────────────────────────────────────────────────────────── -->
		<section class="mt-6">
			<h2 class="text-ui font-medium text-ink">Who it's for</h2>

			<div class="mt-3 grid gap-4 sm:grid-cols-2">
				<Field label="Client" id="invoice-client">
					{#snippet control(field)}
						<Select type="single" value={state.customerId ?? ''} onValueChange={chooseCustomer}>
							<SelectTrigger {...field}>
								{customers.find((c) => c.id === state.customerId)?.name ?? 'Choose a client'}
							</SelectTrigger>
							<SelectContent>
								{#each customers as customer (customer.id)}
									<SelectItem value={customer.id}>{customer.name}</SelectItem>
								{/each}
							</SelectContent>
						</Select>
					{/snippet}
				</Field>

				<Field label="Send it to" id="invoice-email">
					{#snippet control(field)}
						<Input {...field} bind:value={state.sendToEmail} autocomplete="email" />
					{/snippet}
				</Field>

				<Field label="Due date" id="invoice-due" helper="Your usual {usualDays} days.">
					{#snippet control(field)}
						<Input {...field} type="date" bind:value={state.dueDate} />
					{/snippet}
				</Field>
			</div>
		</section>

		<!-- ── The lines ──────────────────────────────────────────────────────────────── -->
		<section class="mt-8">
			<h2 class="text-ui font-medium text-ink">What you're billing for</h2>

			<div class="mt-3 flex flex-col gap-3">
				{#each state.lines as line, i (line.id)}
					<!--
						The money core is asked and its answer is rendered as it stands. A blank box
						is a line somebody has not priced yet — a normal state of a draft, and
						`blockersToIssuing` is what stops it going out, not a complaint under the
						field.
					-->
					{@const qty = line.qty.trim() === '' ? null : checkQuantity(line.qty)}
					{@const price = line.unitPrice.trim() === '' ? null : checkUnitPrice(line.unitPrice)}
					{@const qtyBad = qty !== null && !qty.ok}
					{@const priceBad = price !== null && !price.ok}
					{@const messageId = `line-${line.id}-message`}
					<div class="rounded-[10px] border border-line-default bg-surface-card p-3">
						<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_80px_120px_auto] sm:items-start">
							<div>
								<Label for="line-{line.id}-description" class="sr-only">Description</Label>
								<Input
									id="line-{line.id}-description"
									bind:value={state.lines[i].description}
									placeholder="What it is"
								/>
							</div>

							<div>
								<Label for="line-{line.id}-qty" class="sr-only">Quantity</Label>
								<Input
									id="line-{line.id}-qty"
									bind:value={state.lines[i].qty}
									inputmode="decimal"
									aria-invalid={qtyBad ? 'true' : undefined}
									aria-describedby={qtyBad ? messageId : undefined}
								/>
							</div>

							<div>
								<Label for="line-{line.id}-price" class="sr-only">Unit price</Label>
								<Input
									id="line-{line.id}-price"
									bind:value={state.lines[i].unitPrice}
									inputmode="decimal"
									disabled={line.noCharge}
									placeholder={line.noCharge ? 'Included' : 'Each'}
									aria-invalid={priceBad ? 'true' : undefined}
									aria-describedby={priceBad && !qtyBad ? messageId : undefined}
								/>
							</div>

							<Button
								variant="quiet"
								class="h-9 w-9 p-0"
								aria-label="Remove this line"
								onclick={() => removeLine(line.id)}
							>
								<Trash2 class="size-4" aria-hidden="true" />
							</Button>
						</div>

						<div class="mt-2 flex flex-wrap items-center justify-between gap-3">
							<label class="flex items-center gap-2 text-helper text-ink-secondary">
								<!--
									The design's `±0.00`. A deliberate zero, distinct from a price nobody
									has typed yet — which is the difference between an invoice that is
									ready to issue and one that is not.
								-->
								<input
									type="checkbox"
									bind:checked={state.lines[i].noCharge}
									class="size-4 rounded-[4px] border-line-control outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
								/>
								Included, no charge
							</label>

							{#if amounts[i]}
								<Amount value={amounts[i]} size="sm" />
							{/if}
						</div>

						<!--
							One message for the row, not one per cell. Quantity speaks first when both
							are unreadable — it is the number typed first, and two complaints about one
							line reads as the row being broken rather than two characters needing a look.
						-->
						{#if qtyBad || priceBad}
							<FieldError id={messageId} result={qtyBad ? qty : price} class="mt-1.5" />
						{/if}
					</div>
				{/each}
			</div>

			<Button variant="secondary" class="mt-3" onclick={addLine}>
				<Plus class="size-4" aria-hidden="true" />
				Add a line
			</Button>
		</section>

		<!-- ── The totals ─────────────────────────────────────────────────────────────── -->
		<section class="mt-8 rounded-[10px] border border-line-default bg-surface-card p-4">
			<dl class="flex flex-col gap-2">
				<div class="flex items-baseline justify-between gap-4">
					<dt class="text-[13px] text-ink-secondary">Before VAT</dt>
					<dd><Amount value={price.subtotal} size="sm" /></dd>
				</div>
				<div class="flex items-baseline justify-between gap-4">
					<dt class="text-[13px] text-ink-secondary">{documentTaxLabel(price.priced)}</dt>
					<dd><Amount value={price.tax} size="sm" /></dd>
				</div>
				<div
					class="mt-1 flex items-baseline justify-between gap-4 border-t border-line-default pt-3"
				>
					<dt class="text-ui text-ink">Amount due</dt>
					<dd><Amount value={price.total} size="lg" /></dd>
				</div>
			</dl>
		</section>

		<!-- ── The two acts ───────────────────────────────────────────────────────────── -->
		<div class="mt-6 flex flex-wrap items-center gap-3">
			<Button variant="secondary" disabled={saving} onclick={() => onsave(patchFromEditor(state))}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
			<Button
				disabled={saving || issuing || blockers.length > 0}
				onclick={() => onissue(patchFromEditor(state))}
			>
				{issuing ? 'Issuing…' : 'Issue and send'}
			</Button>

			<!--
				The save, said out loud. The button's label flips to "Saving…" but a label change
				is not an announcement, and a successful save was silent — so this is the same
				visible 13px polite line `quoting/SaveState.svelte` draws, always in the DOM
				because a live region mounted mid-flight does not reliably announce its first
				message. The clock in the saved sentence makes consecutive saves re-announce.

				This and the `Refusal` above are two polite regions with DISJOINT content: errors
				are announced only by the Refusal, save progress only here — so nothing is
				announced twice, which is the operative clause of Refusal.svelte's "exactly one
				polite region per surface" doctrine. The saved sentence is also suppressed while
				`message` is non-null, because after a failed save `lastSavedAtMs` still holds the
				PREVIOUS success and a stale "All changes saved" beside a Refusal saying the save
				failed would be the indicator lying.
			-->
			<p class="flex items-center gap-1.5 text-[13px]" aria-live="polite">
				{#if saving}
					<span class="text-ink-muted">Saving…</span>
				{:else if lastSavedAtMs !== null && message === null}
					<Check size={14} aria-hidden="true" class="shrink-0 text-settled" />
					<span class="text-ink-secondary">All changes saved · {savedClock(lastSavedAtMs)}</span>
				{/if}
			</p>
		</div>

		{#if blockers.length > 0}
			<!--
				EVERY reason at once, not the first one. Revealing one problem per attempt is how a
				form makes somebody press a disabled button four times to find out what it wants.
			-->
			<ul class="mt-3 flex flex-col gap-1">
				{#each blockers as blocker (blocker)}
					<li class="text-helper text-ink-muted">{blocker}</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- ── The document, leading ────────────────────────────────────────────────────── -->
	<div class="min-w-0 rounded-[12px] bg-surface-sunken p-4 lg:p-6">
		<p class="mb-3 text-helper text-ink-muted">What your client will get</p>
		<DocumentSheet {document} />
	</div>
</div>
