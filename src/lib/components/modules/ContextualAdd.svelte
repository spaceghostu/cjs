<script lang="ts">
	/**
	 * THE CONTEXTUAL ADD — offered at the moment of need, with the way out underneath it.
	 *
	 * The design's example: a quote has just been accepted, and turning it into an invoice
	 * needs a module this business does not have. So the offer appears exactly there, inline,
	 * with the cost stated plainly rather than discovered later.
	 *
	 * THE ESCAPE HATCH IS NOT OPTIONAL COPY.
	 *
	 *   > Or download the accepted quote as a PDF and invoice it yourself — no module needed.
	 *
	 * That line is the design's whole ethic in one sentence, and it is the difference between
	 * an offer and a toll gate. It is a REAL link to a working alternative, it sits directly
	 * under the button it competes with, and nothing about it is styled to lose.
	 *
	 * THE TOTAL IS COMPUTED, NEVER WRITTEN DOWN.
	 * The design's own figure ("new total R600/mo") assumes a tenant who does not own
	 * Invoicing, while every other screen shows the same business owning it inside a R450
	 * total — README open question 3. Read as a different tenant state, which is exactly why
	 * `newTotal` is a prop fed from `totalWith()` and never a constant here.
	 */
	import { Amount, Button } from '$lib/ui';
	import { accentText } from '$lib/components/shell';
	import { navIcon } from '$lib/components/shell/icons';
	import type { ModuleKey } from '$lib/core/modules/catalogue';
	import type { Money } from '$lib/core/money';

	let {
		moduleKey,
		label,
		accent,
		/** What this offer lets someone do. "Turn it into an invoice". */
		headline,
		price,
		newTotal,
		/** The label and href of the thing they can do WITHOUT the module. Never omitted. */
		escape,
		onadd
	}: {
		moduleKey: ModuleKey;
		label: string;
		accent: string;
		headline: string;
		price: Money;
		newTotal: Money;
		escape: { label: string; href: string };
		onadd: (key: ModuleKey) => void;
	} = $props();

	const Icon = $derived(navIcon(moduleKey));
</script>

<!--
	The escape hatch's href is caller-supplied DATA — a PDF download, an export, whatever the
	no-module alternative is on that screen — so there is no route id for `resolve()` to check
	it against. Same situation as the sidebar's catalogue hrefs, and disabled for the same
	reason: the fix, if a base path is ever configured, belongs where the href is built.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<div
	data-slot="contextual-add"
	class="flex flex-col gap-3 rounded-[10px] border border-line-default bg-surface-raised p-5"
>
	<div class="flex items-start gap-2.5">
		<Icon size={18} strokeWidth={1.75} aria-hidden="true" class="mt-0.5 {accentText(accent)}" />
		<div class="min-w-0">
			<p class="text-ui text-ink">{headline}</p>
			<!--
				The cost, in the same breath as the offer. Not on the next screen, not after a
				click: the design's rule is that nothing about the money is discovered later.
			-->
			<p class="mt-0.5 flex flex-wrap items-baseline gap-1 text-helper text-ink-muted">
				<span>Needs {label} ·</span>
				<Amount value={price} size="sm" tone="muted" decimals={0} />
				<span>/mo · new total</span>
				<Amount value={newTotal} size="sm" tone="muted" decimals={0} />
				<span>/mo</span>
			</p>
		</div>
	</div>

	<div class="flex flex-col items-start gap-2">
		<!-- Secondary. This is an offer beside the work, not the point of the screen. -->
		<Button variant="secondary" size="sm" onclick={() => onadd(moduleKey)}>Add and continue</Button>

		<p class="text-helper text-ink-muted">
			Or
			<a
				href={escape.href}
				data-sveltekit-reload
				class="underline underline-offset-2 outline-none hover:text-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
			>
				{escape.label}
			</a>
			— no module needed.
		</p>
	</div>
</div>
