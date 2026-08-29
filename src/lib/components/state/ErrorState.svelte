<script lang="ts">
	/**
	 * THE WHOLE-SURFACE REFUSAL — what the two `+error.svelte` files render.
	 *
	 * THE NAME IS FOR WHERE IT MOUNTS, NOT FOR WHAT IT SAYS. This is the component SvelteKit's
	 * error boundary reaches, and SvelteKit calls that boundary an error page; so does this file.
	 * But more than half of what arrives here is not an error at all. A business that has never
	 * added Payroll, a business that removed Invoicing, a member who is not the owner, a quote
	 * that is not there — every one of those is a boundary the product is stating calmly, and
	 * NOT ENTITLED IS NOT AN ERROR. Drawing a locked module in the failure tint would tell somebody
	 * that something broke when nothing did, on the screen where they were about to decide
	 * whether to pay for it.
	 *
	 * So the tone is DERIVED, by `toneOf()` in `$lib/core/refusals`, from the code the throw
	 * carried. That decision is pure and it is asserted in `refusals.test.ts`, which means
	 * "a locked module renders calm" is a test rather than a habit the next screen can forget.
	 *
	 *   calm   the `EmptyState` panel exactly — no state colour anywhere on it.
	 *   wrong  the same panel, with a `<Refusal>` inside it.
	 *
	 * The `wrong` arm COMPOSES `Refusal` rather than restating its classes, and that is
	 * load-bearing rather than tidy: it is what keeps the tint's class string to a single file
	 * outside the vendored directory, which is the property this ticket's verification grep
	 * checks. The panel geometry IS repeated here, deliberately — `LockedModule`,
	 * `RemovedModule` and `EmptyState` each carry it too, and a shared constant for a string
	 * that four components have always spelled out would be a new indirection for a property
	 * nothing checks. The tint is the one that matters, because it is the one that drifted.
	 *
	 * WHAT IT RENDERS IS `error.message`, VERBATIM. Never a status code, never a stack, never
	 * "Internal Error". Those sentences were written for an anxious non-accountant and they are
	 * already right; this component's only job is to stop them arriving bare. `nextHref` and
	 * `nextLabel` have been on `App.Error` all along and SvelteKit's built-in fallback page
	 * discarded them — `refuse()`'s two entitlement refusals and `requireBillingAdmin`'s all
	 * carry one, and this is the first thing that has ever drawn them.
	 *
	 * IT READS `page.status` AND `page.error` AND NOTHING ELSE. Never `page.data`: when the
	 * failure was the `(app)` layout load itself, there is no layout data, and an error page that
	 * threw while rendering an error would leave the person with nothing at all.
	 *
	 * IT IS A FALLBACK, NOT THE ENTITLEMENT SCREEN. The list routes that ASK — through
	 * `moduleAccess` — keep rendering the full `LockedModule`/`RemovedModule`, with the module's
	 * price and the carryover sentence generated for that business. An error page has no load
	 * data to build either of those. This is what the routes that ENFORCE, through `withModule`,
	 * fall through to, and it says the same thing more briefly.
	 */
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Info from '@lucide/svelte/icons/info';
	import { Button } from '$lib/components/ui/button/index.js';
	import { toneOf } from '$lib/core/refusals';
	import EmptyState from './EmptyState.svelte';
	import Refusal from './Refusal.svelte';

	let { status, error }: { status: number; error: App.Error | null } = $props();

	/**
	 * The house sentence for a refusal that arrived with nothing in it. `ctx.ts` already says
	 * this when a request invariant fails, and it is the right sentence for any throw that
	 * reached here without a message of its own — a 404 raised by the router rather than by a
	 * route, say.
	 */
	const message = $derived(
		error?.message ?? 'Something went wrong on our side. Nothing you did caused this.'
	);

	const tone = $derived(toneOf(status, error?.code));

	/**
	 * THE HEADING, AND WHY IT IS DERIVED FROM THE STATUS RATHER THAN WRITTEN ONCE.
	 *
	 * `error.message` is the sentence and it is already right; the heading only has to be true
	 * of every refusal that can reach this arm, and a single line cannot be. "We can't show you
	 * that" is right for a quote that is not there and wrong for a removed module, whose data is
	 * still perfectly visible and merely cannot be CHANGED. So the status decides, because the
	 * status is the one thing every throw agrees on: 403 is "you may not", 404 is "it is not
	 * there", 429 is "not so fast". Nothing here restates the message — a heading that repeated
	 * the sentence beneath it would be the interface saying the same thing twice to fill a slot.
	 */
	const heading = $derived.by(() => {
		if (tone === 'wrong') return "That didn't work";
		if (status === 429) return 'That was a lot of tries';
		if (status === 403) return "That isn't something you can do here";
		return "There's nothing at that address";
	});

	const href = $derived(error?.nextHref ?? '/');
	const label = $derived(error?.nextLabel ?? 'Back to your dashboard');
</script>

<!-- `nextHref` is data on `App.Error`, not a route id, so it cannot be resolved at build time. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

{#if tone === 'calm'}
	<EmptyState icon={Info} {heading} body={message}>
		{#snippet action()}
			<Button {href} variant="secondary">
				<ArrowLeft class="size-4" aria-hidden="true" />
				{label}
			</Button>
		{/snippet}
	</EmptyState>
{:else}
	<div
		data-slot="error-state"
		class="flex flex-col items-start gap-2.5 rounded-[10px] border border-line-default bg-surface-card p-7"
	>
		<h2 class="text-[16px] leading-snug text-ink">{heading}</h2>

		<Refusal {message} class="w-full" />

		<Button {href} variant="secondary" class="mt-1.5">
			<ArrowLeft class="size-4" aria-hidden="true" />
			{label}
		</Button>
	</div>
{/if}
