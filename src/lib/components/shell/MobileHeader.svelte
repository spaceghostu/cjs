<script lang="ts">
	/**
	 * Mobile is not the desktop workflow shrunk.
	 *
	 * The design names the three questions a phone answers — _is it clear, did they pay, send
	 * this_ — and this header exists to get out of their way. No sidebar, no ⌘K chip: a
	 * keyboard hint on a device with no keyboard is noise, and the sidebar's job is done by
	 * the bottom nav, where a thumb is.
	 *
	 * The search field is 44px here against 34px on desktop. That is not a bigger version of
	 * the same control: on desktop it is a hint, and on a phone it is a touch target.
	 */
	import Search from '@lucide/svelte/icons/search';
	import * as Avatar from '$lib/components/ui/avatar/index.js';

	let {
		tradingName,
		initials,
		userInitials,
		userName,
		aiEnabled,
		onSearch
	}: {
		tradingName: string;
		initials: string;
		userInitials: string;
		userName: string;
		aiEnabled: boolean;
		onSearch: () => void;
	} = $props();
</script>

<header class="flex flex-col gap-3 bg-surface-base px-5 pt-[18px] pb-3">
	<div class="flex items-center gap-2.5">
		<span
			aria-hidden="true"
			class="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-surface-raised text-helper font-medium text-ink"
		>
			{initials}
		</span>
		<span class="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{tradingName}</span>
		<Avatar.Root class="size-[30px]">
			<Avatar.Fallback class="text-[11px]">
				<span class="sr-only">{userName}</span>
				<span aria-hidden="true">{userInitials}</span>
			</Avatar.Fallback>
		</Avatar.Root>
	</div>

	{#if aiEnabled}
		<button
			type="button"
			onclick={onSearch}
			class="flex h-11 w-full items-center gap-2.5 rounded-lg border border-line-control bg-surface-card px-3.5 text-left text-ui text-ink-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
		>
			<Search size={17} aria-hidden="true" class="shrink-0" />
			<span class="min-w-0 flex-1 truncate">Search, or ask a question</span>
		</button>
	{/if}
</header>
