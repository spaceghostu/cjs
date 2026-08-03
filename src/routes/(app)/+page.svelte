<script lang="ts">
	// PLACEHOLDER AWAITING T14. The shell around it is real; this is the hole in the middle.
	//
	// Deliberately not a mocked dashboard. The design's home is "the four numbers that matter
	// and the three things to do", and inventing plausible-looking numbers on the screen an
	// owner checks first is worse than an honest gap.
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{data.tradingName} · CJs</title></svelte:head>

<div class="mx-auto w-full max-w-4xl px-4 py-10 lg:px-8">
	<h1 class="text-title text-ink">{data.tradingName}</h1>
	<p class="mt-2 max-w-prose text-ui text-ink-secondary">
		The shell is in place. Your dashboard — what is owed you, what is due, and what needs doing —
		arrives with the home screen.
	</p>
</div>
