<script lang="ts">
	/**
	 * REMOVING A MODULE — the same dialog, inverted.
	 *
	 * Deliberately the same shape as `AddModuleDialog`: the same panel, the same
	 * `<StatDelta>`, the same three answers in the same order, the same footer. Removal is not
	 * an exception path in this product, it is the other half of "one tap either way", and a
	 * confirmation that suddenly looked different — narrower, redder, more insistent — would
	 * say so louder than any copy.
	 *
	 * NOT DESTRUCTIVE, AND NOT STYLED AS IF IT WERE.
	 * The confirm is `secondary`, never `destructive`. Nothing is deleted, nothing is lost,
	 * and the data is readable and exportable the moment this dialog closes. `destructive` in
	 * this codebase means "this cannot be undone", and using it here would spend that meaning
	 * on something reversible.
	 */
	import { enhance } from '$app/forms';
	import { Amount, Button, Dialog, DialogContent, DialogTitle, StatDelta } from '$lib/ui';
	import { accentText } from '$lib/components/shell';
	import { navIcon } from '$lib/components/shell/icons';
	import type { ModuleKey } from '$lib/core/modules/catalogue';
	import type { Money } from '$lib/core/money';
	import { deltaAccent } from './accent';

	let {
		open = $bindable(false),
		moduleKey,
		label,
		accent,
		currentTotal,
		newTotal,
		/** True when it was added today — removing it costs nothing at all. */
		freeToday,
		sinceLabel,
		action = '/settings/modules?/remove'
	}: {
		open?: boolean;
		moduleKey: ModuleKey;
		label: string;
		accent: string;
		currentTotal: Money;
		newTotal: Money;
		freeToday: boolean;
		sinceLabel: string;
		action?: string;
	} = $props();

	const Icon = $derived(navIcon(moduleKey));
	const submitting = $state({ busy: false });
</script>

<Dialog bind:open>
	<DialogContent
		class="w-full max-w-[560px] gap-6 bg-surface-overlay p-7 sm:max-w-[560px]"
		showCloseButton={false}
	>
		<DialogTitle class="flex items-center gap-2.5 text-section">
			<Icon size={20} strokeWidth={1.75} aria-hidden="true" class={accentText(accent)} />
			Remove {label}
		</DialogTitle>

		<div class="rounded-[10px] bg-surface-raised p-5">
			<p class="eyebrow text-ink-muted">Your new monthly total</p>
			<StatDelta
				class="mt-2"
				from={currentTotal}
				to={newTotal}
				unit="per month"
				accent={deltaAccent(accent)}
			/>
		</div>

		<div class="flex flex-col gap-5">
			<section class="flex flex-col gap-1.5">
				<h3 class="text-ui font-medium text-ink">When it takes effect</h3>
				<p class="text-ui text-ink-secondary">
					{#if freeToday}
						Today, and you're not charged at all — you added {label} today, so there's nothing to pay
						for it.
					{:else}
						Today. You've had {label} since {sinceLabel}, so this month you'll be charged only for
						the days you had it. Your next bill is
						<Amount value={newTotal} decimals={0} class="text-ui" />.
					{/if}
				</p>
			</section>

			<section class="flex flex-col gap-1.5">
				<h3 class="text-ui font-medium text-ink">What happens to your data</h3>
				<p class="text-ui text-ink-secondary">
					It stays. Everything already in {label} remains yours to read and to export — it just can't
					be changed while the module is off.
				</p>
			</section>

			<section class="flex flex-col gap-1.5">
				<h3 class="text-ui font-medium text-ink">If you want it back</h3>
				<p class="text-ui text-ink-secondary">
					Add it again from the same place, any time. It picks up exactly where you left off, and
					you start paying from that day — not for the gap.
				</p>
			</section>
		</div>

		<div class="flex flex-col gap-4 border-t border-line-strong pt-5">
			<p class="text-helper text-ink-muted">Add it back from the same place you removed it.</p>

			<form
				method="POST"
				{action}
				class="flex justify-end gap-3"
				use:enhance={() => {
					submitting.busy = true;
					return async ({ update }) => {
						await update();
						submitting.busy = false;
						open = false;
					};
				}}
			>
				<input type="hidden" name="module" value={moduleKey} />
				<Button type="button" variant="secondary" onclick={() => (open = false)}>Keep it</Button>
				<!-- `secondary`, never `destructive`. Nothing here is destroyed. -->
				<Button type="submit" variant="secondary" disabled={submitting.busy}>
					Remove {label}
				</Button>
			</form>
		</div>
	</DialogContent>
</Dialog>
