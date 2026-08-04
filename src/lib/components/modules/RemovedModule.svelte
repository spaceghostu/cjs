<script lang="ts">
	/**
	 * A MODULE THIS BUSINESS REMOVED — the data is still here.
	 *
	 * The middle entitlement state, and the reason `Access` is not a boolean. The design is
	 * explicit that removing Payroll does not take your payroll data with it: it is read-only
	 * and exportable, and it comes back exactly as it was.
	 *
	 * DELIBERATELY NOT `LockedModule`.
	 * Reusing the locked panel here would tell someone their own invoicing history "isn't part
	 * of your workspace yet" — wrong, and frightening, on the screen where they came to look
	 * something up. The two states share a shape and share no words.
	 *
	 * The export link is as prominent as the add-back button, because "exportable" is only a
	 * promise if there is a way to do it from the screen that makes the claim.
	 */
	import { Button } from '$lib/ui';
	import { accentText } from '$lib/components/shell';
	import { navIcon } from '$lib/components/shell/icons';
	import type { ModuleKey } from '$lib/core/modules/catalogue';

	let {
		moduleKey,
		label,
		accent,
		href = '/settings/modules',
		exportHref = '/settings/export'
	}: {
		moduleKey: ModuleKey;
		label: string;
		accent: string;
		href?: string;
		exportHref?: string;
	} = $props();

	const Icon = $derived(navIcon(moduleKey));
</script>

<div
	data-slot="removed-module"
	class="flex flex-col items-start gap-2.5 rounded-[10px] border border-line-default bg-surface-card p-7"
>
	<Icon size={22} strokeWidth={1.75} aria-hidden="true" class={accentText(accent)} />

	<h2 class="text-[16px] leading-snug text-ink">
		{label} is read-only — everything in it is still yours
	</h2>

	<p class="max-w-95 text-[13px] leading-relaxed text-ink-secondary">
		You removed {label}, so nothing in it can be changed. You can still read it and export it
		whenever you like, and adding it back picks up exactly where you left off — you'd start paying
		again from that day, not for the gap.
	</p>

	<div class="mt-1.5 flex flex-wrap gap-3">
		<Button {href} variant="secondary">Add {label} back</Button>
		<Button href={exportHref} variant="secondary" data-sveltekit-reload>Export your data</Button>
	</div>
</div>
