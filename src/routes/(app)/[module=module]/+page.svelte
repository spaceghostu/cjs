<script lang="ts">
	/**
	 * EVERY MODULE ROUTE, UNTIL IT IS BUILT.
	 *
	 * Three states, from `entitlement`, and each gets its own component because each is a
	 * genuinely different thing to say to somebody:
	 *
	 *   none   never owned  — `LockedModule`. Calm, concrete, no primary CTA, no urgency.
	 *   read   removed      — `RemovedModule`. The data is still here, read-only, exportable.
	 *   write  owned        — the module itself, which for four of the seven does not exist.
	 *
	 * The middle one is the one that must never borrow the first one's copy: telling someone
	 * their own invoicing history "isn't part of your workspace yet" is wrong on the screen
	 * where they came to look something up.
	 */
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/ui';
	import { LockedModule, RemovedModule } from '$lib/components/modules';
	import { accentText, accentTint } from '$lib/components/shell';
	import { navIcon } from '$lib/components/shell/icons';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const Icon = $derived(navIcon(data.module.key));
</script>

<svelte:head><title>{data.module.label} · CJs</title></svelte:head>

<div class="mx-auto w-full max-w-2xl px-4 py-10 lg:py-16">
	{#if data.access === 'write'}
		<Card>
			<CardHeader>
				<span
					class="mb-3 flex size-10 items-center justify-center rounded-lg {accentTint(
						data.module.accent
					)}"
				>
					<Icon size={20} aria-hidden="true" class={accentText(data.module.accent)} />
				</span>
				<CardTitle>{data.module.label}</CardTitle>
				<CardDescription>{data.module.description}</CardDescription>
			</CardHeader>
			<CardContent>
				<p class="text-ui text-ink-secondary">
					{data.module.label} is part of your business. The screens for it are still being built — nothing
					you have is affected, and nothing is lost in the meantime.
				</p>
			</CardContent>
		</Card>
	{:else if data.access === 'read'}
		<RemovedModule
			moduleKey={data.module.key}
			label={data.module.label}
			accent={data.module.accent}
		/>
	{:else}
		<LockedModule
			moduleKey={data.module.key}
			label={data.module.label}
			accent={data.module.accent}
			price={data.price}
			carryover={data.carryover}
		/>
	{/if}
</div>
