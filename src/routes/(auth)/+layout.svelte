<script lang="ts">
	// STUB AWAITING DESIGN (T06).
	//
	// The Claude Design project covers the shell and three modules. It does not cover
	// sign-in, so this is deliberately plain: T01 tokens, T02 primitives, no invented visual
	// language. Anything decorative added here would have to be unpicked when the real
	// design lands.
	let { children } = $props();
</script>

<div class="flex min-h-svh flex-col items-center justify-center bg-surface-base px-4 py-12">
	<div class="w-full max-w-sm">
		<header class="mb-8 text-center">
			<h1 class="text-2xl font-semibold tracking-tight text-ink">CJs</h1>
			<p class="mt-1 text-sm text-ink-secondary">One place to run your business.</p>
		</header>

		{@render children()}
	</div>
</div>
