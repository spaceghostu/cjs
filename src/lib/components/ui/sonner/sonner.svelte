<script lang="ts">
	import { mode } from 'mode-watcher';
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
	theme={mode.current}
	class="toaster group"
	style="--normal-bg: var(--surface-overlay); --normal-text: var(--text-primary); --normal-border: var(--border-strong); --gray1: var(--surface-overlay); --gray2: var(--surface-raised); --description-color: var(--text-secondary); --success-bg: var(--surface-overlay); --success-text: var(--state-settled-ink); --success-border: var(--border-strong); --error-bg: var(--surface-overlay); --error-text: var(--state-wrong-ink); --error-border: var(--border-strong); --warning-bg: var(--surface-overlay); --warning-text: var(--state-attention-ink); --warning-border: var(--border-strong); --info-bg: var(--surface-overlay); --info-text: var(--text-secondary); --info-border: var(--border-strong);"
	{...restProps}
>
	{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4" />
	{/snippet}
	{#snippet infoIcon()}
		<InfoIcon class="size-4" />
	{/snippet}
	{#snippet warningIcon()}
		<TriangleAlertIcon class="size-4" />
	{/snippet}
</Sonner>
