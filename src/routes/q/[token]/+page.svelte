<script lang="ts">
	/**
	 * WHAT THE CLIENT SEES.
	 *
	 * **Awaiting a design pass**, and it says so at the bottom of the page. The design draws the
	 * OUTCOME of acceptance and never this screen, so it is built from the foundations and kept
	 * to exactly what T18 asks for: the document on paper, and two actions.
	 *
	 * It is deliberately plain in the ways that matter to somebody who is not a customer of
	 * ours: no product marketing, no sign-up prompt, no "powered by". They came to read a quote
	 * from a joinery, and the joinery's document is the only thing on the page that should be
	 * loud.
	 *
	 * The sheet renders on the theme-invariant `--paper-*` tokens, so this page looks the same
	 * as the PDF in their inbox whatever their device thinks about dark mode.
	 */
	import { enhance } from '$app/forms';
	import { DocumentSheet } from '$lib/components/document';
	import { Button, Input, Label, Textarea } from '$lib/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let answering = $state<'accept' | 'decline' | null>(null);
	let busy = $state(false);
</script>

<svelte:head>
	<title>{data.document.number ?? 'Quote'} from {data.tradingName}</title>
	<!-- A shared document is not for search engines, whatever else the token protects. -->
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-10">
	<DocumentSheet document={data.document} />

	<section class="rounded-[12px] border border-line-default bg-surface-card p-5">
		{#if data.status === 'accepted'}
			<p class="text-ui text-ink">
				Thank you — this quote was accepted{data.acceptedByName
					? ` by ${data.acceptedByName}`
					: ''}. {data.tradingName} has been told.
			</p>
		{:else if data.status === 'declined'}
			<p class="text-ui text-ink">
				This quote was declined. If that was a mistake, get in touch with {data.tradingName}
				and they can send you a new one.
			</p>
		{:else if data.status === 'expired'}
			<!--
				Viewable, not acceptable. The client should still be able to read what they were
				offered and phone up about it — an expired quote that showed nothing would be
				worse than useless to the person holding the link.
			-->
			<p class="text-ui text-ink">
				This quote has passed its valid-until date, so it can no longer be accepted. You can still
				read it — and {data.tradingName} can send you an up-to-date one.
			</p>
		{:else if form?.answered === 'accepted'}
			<p class="text-ui text-ink">Thank you — {data.tradingName} has been told.</p>
		{:else if form?.answered === 'declined'}
			<p class="text-ui text-ink">Thank you for letting them know.</p>
		{:else if data.canAnswer}
			{#if form?.message}
				<p class="mb-3 text-ui text-wrong-ink" aria-live="polite">{form.message}</p>
			{/if}

			{#if answering === null}
				<p class="text-ui text-ink-secondary">
					Happy with this? Let {data.tradingName} know either way.
				</p>
				<div class="mt-3 flex flex-wrap gap-2">
					<Button onclick={() => (answering = 'accept')}>Accept this quote</Button>
					<!--
						Not styled to lose. Declining is a real answer and the business would rather
						hear it than be left waiting.
					-->
					<Button variant="secondary" onclick={() => (answering = 'decline')}>Decline</Button>
				</div>
			{:else if answering === 'accept'}
				<form
					method="POST"
					action="?/accept"
					use:enhance={() => {
						busy = true;
						return async ({ update }) => {
							await update();
							busy = false;
						};
					}}
				>
					<Label for="accept-name">Your name</Label>
					<div class="mt-1.5 max-w-sm">
						<Input id="accept-name" name="name" required autocomplete="name" />
					</div>
					<p class="mt-1.5 text-helper text-ink-muted">
						So {data.tradingName} knows who accepted it.
					</p>
					<div class="mt-3 flex flex-wrap gap-2">
						<Button type="submit" disabled={busy}>
							{busy ? 'Sending…' : 'Accept this quote'}
						</Button>
						<Button variant="secondary" type="button" onclick={() => (answering = null)}>
							Back
						</Button>
					</div>
				</form>
			{:else}
				<form
					method="POST"
					action="?/decline"
					use:enhance={() => {
						busy = true;
						return async ({ update }) => {
							await update();
							busy = false;
						};
					}}
				>
					<Label for="decline-reason">Anything you'd like to tell them? (optional)</Label>
					<div class="mt-1.5">
						<Textarea id="decline-reason" name="reason" rows={3} />
					</div>
					<div class="mt-3 flex flex-wrap gap-2">
						<Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Decline'}</Button>
						<Button variant="secondary" type="button" onclick={() => (answering = null)}>
							Back
						</Button>
					</div>
				</form>
			{/if}
		{/if}
	</section>

	<!--
		Said out loud on the page, not only in a ticket. The same treatment the T06 stubs carry:
		a screen that has not had a design pass should admit it to the person looking at it.
	-->
	<p class="text-helper text-ink-muted">
		This page is awaiting a design pass. The document above is the designed one.
	</p>
</main>
