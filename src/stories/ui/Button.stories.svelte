<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import { Button, type ButtonVariant } from '$lib/components/ui/button/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Button',
		component: Button,
		parameters: { layout: 'fullscreen' }
	});

	const VARIANTS: { variant: ButtonVariant; label: string; note: string }[] = [
		{ variant: 'primary', label: 'Send quote', note: '--brand, white text, 500' },
		{ variant: 'secondary', label: 'Save draft', note: '1px --border-strong' },
		{ variant: 'quiet', label: 'Cancel', note: 'no border, --text-secondary' },
		{ variant: 'destructive', label: 'Delete invoice', note: '1px quiet wrong border' }
	];
</script>

<!--
	Four variants and no more. The design's "Primitives & states" block is a closed set —
	shadcn's outline / ghost / link are gone on purpose, because the fastest way to lose a
	design system is to leave a fifth button lying around.

	Rest, hover, active, focus and disabled are all here. Hover and active cannot be forced
	from markup, so the row below shows rest and disabled side by side and the ring is
	rendered explicitly; the interactive states are checked by hovering in the toolbar.
-->
<Story name="Variants" asChild>
	<Specimen
		title="Button variants"
		note="36px tall, 8px radius, 16px of horizontal padding. Every variant takes the same focus ring: 2px --brand-focus-ring at 2px offset."
	>
		<div class="flex flex-col gap-6">
			{#each VARIANTS as { variant, label, note } (variant)}
				<div class="flex flex-col gap-2">
					<p class="text-helper text-ink-muted">{variant} — {note}</p>
					<div class="flex flex-wrap items-center gap-3">
						<Button {variant}>{label}</Button>
						<Button {variant} class="outline-2 outline-offset-2 outline-brand-focus-ring">
							{label}
						</Button>
						<Button {variant} disabled>{label}</Button>
					</div>
					<p class="text-helper text-ink-muted">rest · focus · disabled</p>
				</div>
			{/each}
		</div>
	</Specimen>
</Story>

<Story name="Sizes" asChild>
	<Specimen
		title="Button sizes"
		note="The design gives two: a 36px desktop control and a 50px full-width mobile action. `touch` is the 44px minimum, for a control that has to work under a thumb without being a primary action."
	>
		<div class="flex max-w-sm flex-col gap-4">
			<div class="flex flex-wrap items-center gap-3">
				<Button size="sm">Small · 32px</Button>
				<Button size="default">Default · 36px</Button>
				<Button size="touch">Touch · 44px</Button>
			</div>
			<div class="flex flex-wrap items-center gap-3">
				<Button size="icon-sm" aria-label="Add line, small">+</Button>
				<Button size="icon" aria-label="Add line">+</Button>
				<Button size="icon-touch" aria-label="Add line, touch">+</Button>
			</div>
			<Button size="mobile">Mobile primary · 50px, full width</Button>
		</div>
	</Specimen>
</Story>

<Story
	name="Touch targets"
	asChild
	play={async ({ canvas }) => {
		// The design's floor for anything a thumb has to hit.
		for (const name of ['Record payment', 'Mark as sent', 'More']) {
			const box = (await canvas.getByRole('button', { name })).getBoundingClientRect();
			expect(box.height, `${name} height`).toBeGreaterThanOrEqual(44);
		}
	}}
>
	<Specimen title="Touch targets" note="Every control here clears 44px in both dimensions.">
		<div class="flex max-w-sm flex-col items-start gap-3">
			<Button size="mobile">Record payment</Button>
			<Button variant="secondary" size="touch">Mark as sent</Button>
			<Button variant="quiet" size="icon-touch" aria-label="More">···</Button>
		</div>
	</Specimen>
</Story>
