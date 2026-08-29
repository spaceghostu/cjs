<script lang="ts">
	/**
	 * THE ROOT ERROR PAGE — what renders when the failure is ABOVE the shell.
	 *
	 * Until SPA-13 there was no `+error.svelte` anywhere in this repo and no `src/error.html`
	 * either, so every refusal the product carefully worded reached people through SvelteKit's
	 * BUILT-IN fallback page. That page does render `App.Error.message`, so the sentences were
	 * not invisible — they arrived BARE. Unstyled, outside the shell, in a typeface nothing else
	 * in the product uses, and with `nextHref`/`nextLabel` silently discarded, which meant every
	 * refusal that had been given a way out of itself was shown as a dead end anyway.
	 *
	 * TWO FILES RATHER THAN ONE, because SvelteKit walks UP to the nearest boundary above the
	 * thing that failed. Three real cases land here rather than on `(app)/+error.svelte`:
	 *
	 *   - a throw inside `(app)/+layout.server.ts`. The `(app)` boundary is skipped when the
	 *     `(app)` layout load is itself what failed, which is also why nothing on this page may
	 *     read `page.data`: there is no layout data in that case.
	 *   - `/q/[token]`, the shared quote a client opens from an email. It is in
	 *     `PRE_BUSINESS_PATHS`, has no shell and no session, and throws 404 `no_such_quote` and
	 *     429 `too_many_requests`.
	 *   - anonymous visitors to `/i/[token]`, the shared invoice, which throws the same two
	 *     shapes.
	 *
	 * So this page assumes NOTHING: no sidebar, no business, no tenant, no load data. It reads
	 * `page.status` and `page.error` from `$app/state` and renders them centred on a bare page.
	 */
	import { page } from '$app/state';
	import { ErrorState } from '$lib/ui';
</script>

<svelte:head><title>{page.status} · CJs</title></svelte:head>

<div class="mx-auto w-full max-w-2xl px-4 py-10 lg:py-16">
	<ErrorState status={page.status} error={page.error} />
</div>
