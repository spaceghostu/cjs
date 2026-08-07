<script lang="ts" module>
	/** One per streamed panel. `modules` has no skeleton — it needs no query and never waits. */
	export type PanelShape = 'standing' | 'resume' | 'figures' | 'agenda';
</script>

<script lang="ts">
	/**
	 * THE SHAPE OF WHAT IS COMING.
	 *
	 * Home's panels arrive separately, so each one holds its own place while it waits. Never a
	 * spinner over the page: a spinner says "wait", a skeleton says "here is what will be
	 * here", and on the screen an owner opens first the second is the one that lowers the
	 * pulse rather than raising it.
	 *
	 * Each shape below occupies approximately the height of the panel it stands in for, so the
	 * layout does not jump as the panels land — the standing panel keeps its 32px padding and
	 * its rule, the money row keeps its three columns, the side panels keep their rows. T25
	 * measures that as cumulative layout shift; this is where it is earned.
	 */
	import { Skeleton } from '$lib/ui';

	let { shape }: { shape: PanelShape } = $props();
</script>

{#if shape === 'standing'}
	<div
		data-slot="panel-skeleton"
		class="flex flex-col gap-7 rounded-lg border border-line-default bg-surface-card p-8"
	>
		<div class="flex flex-col gap-3">
			<Skeleton bar={false} tone="raised" class="size-[30px] rounded-full" />
			<Skeleton tone="raised" class="h-5 w-56 rounded-md" />
			<Skeleton class="w-[420px] max-w-full" />
		</div>
		<div
			class="grid gap-x-8 gap-y-5 border-t border-line-subtle pt-7 sm:grid-cols-2 lg:grid-cols-3"
		>
			{#each [0, 1, 2] as row (row)}
				<div class="flex flex-col gap-2">
					<Skeleton tone="raised" class="w-40" />
					<Skeleton class="w-32" />
				</div>
			{/each}
		</div>
	</div>
{:else if shape === 'figures'}
	<div data-slot="panel-skeleton" class="grid gap-3.5 sm:grid-cols-3">
		{#each [0, 1, 2] as card (card)}
			<div class="flex flex-col gap-2 rounded-[10px] bg-surface-card p-[18px]">
				<Skeleton class="w-28" />
				<Skeleton bar={false} tone="raised" class="h-6 w-32 rounded-md" />
				<Skeleton class="w-36" />
			</div>
		{/each}
	</div>
{:else if shape === 'resume'}
	<!--
		Deliberately ONE card, not three. The section is absent when there is nothing to
		resume, so a three-card skeleton would promise work that usually does not exist and
		then collapse — the worst kind of layout shift, because it reads as something having
		been taken away.
	-->
	<div data-slot="panel-skeleton" class="flex flex-col gap-3.5">
		<Skeleton class="w-44" />
		<div class="flex items-center gap-3.5 rounded-[10px] bg-surface-card px-4 py-3.5">
			<Skeleton bar={false} tone="raised" class="size-[17px] rounded-md" />
			<div class="flex flex-1 flex-col gap-2">
				<Skeleton tone="raised" class="w-48" />
				<Skeleton class="w-64 max-w-full" />
			</div>
		</div>
	</div>
{:else}
	<div data-slot="panel-skeleton" class="flex flex-col gap-2.5">
		<Skeleton class="w-24" />
		<div class="rounded-[10px] bg-surface-card px-4 py-1.5">
			{#each [0, 1, 2] as row (row)}
				<div class="flex gap-3 border-b border-line-subtle py-3 last:border-b-0">
					<Skeleton class="w-[46px] shrink-0" />
					<Skeleton tone="raised" class="w-32" />
				</div>
			{/each}
		</div>
	</div>
{/if}
