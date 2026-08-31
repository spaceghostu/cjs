<script lang="ts">
	/**
	 * THE IN-SHELL ERROR PAGE — a refusal that keeps the sidebar, so nobody loses their place.
	 *
	 * This is where the eleven page-level refusals land: `refuse()`'s two entitlement refusals
	 * for a module this business never added or has removed, `requireBillingAdmin`'s "Only an
	 * owner can add or remove modules", and the not-found sentence every tenant-scoped id route
	 * now says through `notFound()`. All of them already carried a `nextHref` and a `nextLabel`,
	 * and SvelteKit's built-in fallback page threw both away; this is the first thing in the
	 * product that has ever drawn them.
	 *
	 * MOST OF WHAT ARRIVES HERE IS NOT AN ERROR, and `ErrorState` is named for where it mounts
	 * rather than for what it says. A locked module renders calm, with no state colour on it at
	 * all — see rule 4 of the standard in `$lib/components/state/index.ts`.
	 *
	 * IT IS A FALLBACK, NOT THE ENTITLEMENT SCREEN. The list routes that ASK, through
	 * `moduleAccess`, keep rendering the full `LockedModule`/`RemovedModule` with this business's
	 * own price and carryover sentence. This is what the routes that ENFORCE, through
	 * `withModule`, fall through to, and it says the same thing more briefly because an error
	 * boundary has no load data to build the longer version from.
	 *
	 * The container is the one `[module=module]/+page.svelte` uses, sitting inside the `<main>`
	 * the `(app)` layout scrolls — so this page occupies the content column and the shell around
	 * it is untouched.
	 */
	import { page } from '$app/state';
	import { ErrorState } from '$lib/ui';
</script>

<svelte:head><title>{page.status} · CJs</title></svelte:head>

<div class="mx-auto w-full max-w-2xl px-4 py-10 lg:py-16">
	<ErrorState status={page.status} error={page.error} />
</div>
