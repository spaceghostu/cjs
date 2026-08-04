<script lang="ts">
	/**
	 * ADDING A MODULE — "the confirmation is where trust is won."
	 *
	 * The design's rules for this dialog are decisions, not styling, and each one is a place
	 * the product could quietly become something worse:
	 *
	 *   THE NEW TOTAL, NOT THE DELTA.  "+R120" is the number a seller wants shown. "R570 per
	 *                                  month" is the number the person paying it needs.
	 *   PRORATION, ANSWERED FIRST.     Real figures, before anyone has to ask what "prorated"
	 *                                  means or wonder whether they have just been charged a
	 *                                  full month for one day.
	 *   REMOVAL, ANSWERED FIRST.       Stated in the ADD dialog, because the moment someone is
	 *                                  deciding to add is the moment they are wondering how
	 *                                  hard it will be to undo.
	 *   WHAT IT ARRIVES WITH.          Generated from this business's own data. A static
	 *                                  sentence about "your people and tax settings" is a lie
	 *                                  the first time somebody adds a module on day one.
	 *
	 * There is no urgency here, no discount, no countdown and no "most popular" badge. ESLint
	 * zone 10 bans a timer near billing; the rest is a matter of not writing it.
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
		price,
		currentTotal,
		newTotal,
		chargedToday,
		daysCharged,
		nextChargeLabel,
		arrivesWith,
		/** Where the confirm posts. The action owns the write; this owns the explanation. */
		action = '/settings/modules?/add'
	}: {
		open?: boolean;
		moduleKey: ModuleKey;
		label: string;
		accent: string;
		price: Money;
		currentTotal: Money;
		newTotal: Money;
		chargedToday: Money;
		daysCharged: number;
		nextChargeLabel: string;
		arrivesWith: readonly string[];
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
			Add {label}
		</DialogTitle>

		<!--
			THE TOTAL. `<StatDelta>` from T03: the old figure stays quiet and visible, the new one
			is large and in the module's own accent. Someone should be able to SEE what changed
			without doing arithmetic.
		-->
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
					Today. You'll be charged
					<Amount value={chargedToday} class="text-ui" />
					now for {daysCharged === 1 ? 'the last day' : `the last ${daysCharged} days`} of this month,
					then
					<Amount value={newTotal} decimals={0} class="text-ui" />
					a month from {nextChargeLabel}.
				</p>
			</section>

			<section class="flex flex-col gap-1.5">
				<h3 class="text-ui font-medium text-ink">If you remove it later</h3>
				<p class="text-ui text-ink-secondary">
					Everything in it stays yours — {label} turns read-only and you can still export it. Switch it
					back on any time and it picks up where you left off. Remove it today and you're not charged
					at all.
				</p>
			</section>

			<section class="flex flex-col gap-1.5">
				<h3 class="text-ui font-medium text-ink">It arrives ready</h3>
				{#if arrivesWith.length > 0}
					<ul class="flex flex-col gap-1 text-ui text-ink-secondary">
						{#each arrivesWith as line (line)}
							<li class="flex gap-2">
								<span aria-hidden="true" class="text-ink-muted">·</span>
								<span>{line}</span>
							</li>
						{/each}
					</ul>
					<p class="text-ui text-ink-secondary">There's nothing to set up.</p>
				{:else}
					<!--
						The honest empty case, and the reason this section is a query rather than copy.
						A brand-new business has nothing to carry over, and claiming otherwise is the
						fastest way to teach someone that this product's confirmations cannot be
						trusted.
					-->
					<p class="text-ui text-ink-secondary">
						You're just getting started, so there's nothing to bring across yet — {label} opens empty
						and ready.
					</p>
				{/if}
			</section>
		</div>

		<div class="flex flex-col gap-4 border-t border-line-strong pt-5">
			<p class="text-helper text-ink-muted">Remove it from the same place you added it.</p>

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
				<Button type="button" variant="secondary" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={submitting.busy}>
					Add {label} · <Amount value={price} decimals={0} class="text-ui" />/mo
				</Button>
			</form>
		</div>
	</DialogContent>
</Dialog>
