<script lang="ts">
	/**
	 * "…AND WE'LL ASK IF YOU WANT IT SAVED."
	 *
	 * The other half of the sentence under the client fields. Three rules, all of them the
	 * difference between an offer and a trap:
	 *
	 *  1. IT ONLY APPEARS WHEN SOMETHING ACTUALLY DIFFERS. `differencesFromRecord` compares the
	 *     quote against the address book, so somebody who changed nothing is never interrupted.
	 *
	 *  2. IT SHOWS BOTH VALUES. "Was X, now Y", per field — because the person is being asked
	 *     to change a record every other document reads from, and they cannot answer that
	 *     without seeing what they would be overwriting.
	 *
	 *  3. DECLINING LEAVES THE CUSTOMER RECORD UNTOUCHED. Not "untouched for now" — the quote
	 *     keeps its own copy and the address book keeps its own, permanently. The default
	 *     button is the one that changes nothing.
	 */
	import {
		Button,
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/ui';
	import { SvelteSet } from 'svelte/reactivity';
	import type { FieldDifference } from '$lib/core/quoting';

	let {
		open = $bindable(false),
		clientName,
		differences,
		onsave,
		ondismiss
	}: {
		open: boolean;
		clientName: string;
		differences: readonly FieldDifference[];
		onsave: (fields: readonly string[]) => void;
		ondismiss: () => void;
	} = $props();

	/** Everything on offer starts ticked: the common case is that the correction is a real one. */
	let chosen = new SvelteSet<string>();

	$effect(() => {
		if (!open) return;
		chosen.clear();
		for (const difference of differences) chosen.add(difference.field);
	});

	function toggle(field: string) {
		if (chosen.has(field)) chosen.delete(field);
		else chosen.add(field);
	}
</script>

<Dialog
	bind:open
	onOpenChange={(next) => {
		if (!next) ondismiss();
	}}
>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Save these to {clientName}?</DialogTitle>
			<DialogDescription>
				You changed some details on this quote. The quote keeps them either way — this is about your
				customer list, which every other document reads from.
			</DialogDescription>
		</DialogHeader>

		<ul class="flex flex-col gap-2">
			{#each differences as difference (difference.field)}
				<li>
					<label class="flex items-start gap-2.5 text-ui text-ink">
						<input
							type="checkbox"
							class="mt-1 size-4 accent-[var(--brand)]"
							checked={chosen.has(difference.field)}
							onchange={() => toggle(difference.field)}
						/>
						<span class="min-w-0">
							<span class="block">{difference.label}</span>
							<span class="block text-helper text-ink-muted">
								{difference.was ? `Was ${difference.was}` : 'Was empty'} · now
								{difference.now ?? 'empty'}
							</span>
						</span>
					</label>
				</li>
			{/each}
		</ul>

		<DialogFooter>
			<!-- The one that changes nothing is the calm one, and it is first. -->
			<Button variant="secondary" onclick={ondismiss}>Keep it on this quote only</Button>
			<Button onclick={() => onsave([...chosen])} disabled={chosen.size === 0}>
				Save to my customer list
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
