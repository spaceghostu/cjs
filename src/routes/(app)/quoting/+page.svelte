<script lang="ts">
	/**
	 * Three states, from entitlement — the same three the dynamic module route renders, because
	 * a static route that wins over it inherits its job:
	 *
	 *   none   never owned  — `LockedModule`. Calm, concrete, no urgency.
	 *   read   removed      — `RemovedModule`, above the quotes, which stay readable.
	 *   write  owned        — the module.
	 */
	import { enhance } from '$app/forms';
	import { QuoteList } from '$lib/components/quoting';
	import { LockedModule, RemovedModule } from '$lib/components/modules';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let creating = $state(false);
	let form: HTMLFormElement | null = $state(null);
</script>

<svelte:head><title>Quotes · CJs</title></svelte:head>

{#if data.access === 'none'}
	<div class="mx-auto w-full max-w-2xl px-4 py-10 lg:py-16">
		<LockedModule
			moduleKey="quoting"
			label={data.module.label}
			accent={data.module.accent}
			price={data.price}
			carryover={data.carryover}
		/>
	</div>
{:else}
	{#if data.access === 'read'}
		<div class="mx-auto w-full max-w-4xl px-4 pt-8 lg:px-8">
			<RemovedModule moduleKey="quoting" label={data.module.label} accent={data.module.accent} />
		</div>
	{/if}

	<!--
		The create action is a real form POST, progressively enhanced. Without JavaScript it
		still works, which for the one button that brings a document into existence is worth
		more than the animation it costs.
	-->
	<form
		bind:this={form}
		method="POST"
		action="?/create"
		class="hidden"
		use:enhance={() => {
			creating = true;
			return async ({ update }) => {
				await update();
				creating = false;
			};
		}}
	></form>

	<QuoteList quotes={data.quotes} {creating} oncreate={() => form?.requestSubmit()} />
{/if}
