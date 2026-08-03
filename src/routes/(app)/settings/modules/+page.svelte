<script lang="ts">
	// The list, priced. The switcher dialog is T11 and the add/remove flow is T12.
	import { Amount, Badge, Card, CardContent, CardHeader, CardTitle } from '$lib/ui';
	import { accentText, accentTint, navIcon } from '$lib/components/shell';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Modules · CJs</title></svelte:head>

<div class="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
	<div>
		<h1 class="text-title text-ink">Modules</h1>
		<p class="mt-1 flex items-baseline gap-1 text-ui text-ink-secondary">
			<span>You're paying</span>
			<Amount value={data.monthlyTotal} decimals={0} />
			<span>a month.</span>
		</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>What you can add</CardTitle>
		</CardHeader>
		<CardContent class="space-y-3">
			{#each data.modules as module (module.key)}
				{@const Icon = navIcon(module.key)}
				<div class="flex items-center gap-3 border-b border-line-row pb-3 last:border-0 last:pb-0">
					<span
						class="flex size-9 shrink-0 items-center justify-center rounded-lg {accentTint(
							module.accent
						)}"
					>
						<Icon size={18} aria-hidden="true" class={accentText(module.accent)} />
					</span>
					<div class="min-w-0 flex-1">
						<p class="truncate text-ui text-ink">{module.label}</p>
						<p class="truncate text-helper text-ink-muted">{module.description}</p>
					</div>
					{#if module.access === 'write'}
						<Badge variant="settled">Added</Badge>
					{:else if module.access === 'read'}
						<Badge variant="draft">Removed</Badge>
					{/if}
					<span class="flex shrink-0 items-baseline text-ink-secondary">
						<Amount value={module.price} size="sm" tone="muted" decimals={0} />
						<span class="text-helper text-ink-muted">/mo</span>
					</span>
				</div>
			{/each}
		</CardContent>
	</Card>

	<!--
		Deliberately a sentence rather than a disabled button. A control that looks like it
		adds a module and does nothing is a worse answer than saying so plainly — and this is
		the screen that handles someone's money.
	-->
	<p class="text-ui text-ink-secondary">
		{#if data.isOwner}
			Adding and removing modules arrives with the module switcher. You'll only ever be charged for
			the days you have a module.
		{:else}
			Only owners can change modules and billing.
		{/if}
	</p>
</div>
