<script lang="ts">
	// Placeholder shell. The real dashboard is T14; the app shell around it is T07.
	//
	// A signed-in person with no business never reaches this — `handleGuard` in
	// hooks.server.ts sends them to onboarding — so the only two states here are "signed out"
	// and "signed in, with a business".
	import { Button } from '$lib/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>CJs</title></svelte:head>

<main class="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 px-6 py-16">
	<h1 class="text-2xl font-semibold tracking-tight text-ink">CJs</h1>

	{#if data.business}
		<p class="text-sm text-ink-secondary">
			Signed in to <span class="text-ink">{data.business.tradingName}</span>. The dashboard and the
			module shell are on their way.
		</p>
		<div class="flex gap-2">
			<Button href="/settings" variant="secondary">Settings</Button>
		</div>
	{:else}
		<p class="text-sm text-ink-secondary">
			One place to run your business. Foundations are in place; the first module is on its way.
		</p>
		<div><Button href="/sign-in">Sign in</Button></div>
	{/if}
</main>
