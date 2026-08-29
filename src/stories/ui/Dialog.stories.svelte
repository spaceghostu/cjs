<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, waitFor } from 'storybook/test';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Dialog',
		component: Dialog.Root,
		parameters: { layout: 'fullscreen' }
	});
</script>

<!--
	--surface-overlay behind a --border-strong edge at a 14px radius — the dialog is the
	topmost layer in the system, so it gets the strongest edge.

	Rendered open, because a closed dialog is not a specimen of anything.
-->
<Story name="Dialog" asChild>
	<Specimen title="Dialog" note="Open, with the design's confirm/cancel pairing.">
		<Dialog.Root open>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Add Invoicing to your plan?</Dialog.Title>
					<Dialog.Description>
						R450 becomes R570 a month. The change applies from today and is prorated for the rest of
						this billing month.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer showCloseButton={false}>
					<Button variant="quiet">Not now</Button>
					<Button>Add Invoicing</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	</Specimen>
</Story>

<!--
	FOCUS: trapped while open, returned when closed.

	Nothing else in the repo asserts this, and it would be easy to assume it needs building.
	It does not. `bits-ui`'s dialog wraps its content in a `FocusScope` with `trapFocus`
	defaulting to true, moves focus inside on open, loops Tab at the last tabbable, and puts
	focus back on the pre-open element when it closes — and
	`$lib/components/ui/dialog/dialog-content.svelte` overrides none of that. So the
	deliverable for the criterion is the PROOF, not a hand-rolled trap, which would be
	strictly worse than the one already there.

	This story exists separately from the specimen above because the specimen renders
	`<Dialog.Root open>` with no trigger at all — there is nothing for focus to be returned
	TO. A restore assertion needs a real trigger that was really focused first.

	Both `waitFor`s are load-bearing rather than defensive. `FocusScope` moves focus from its
	open and close auto-focus handlers, which run a frame later than the keypress that opened
	it and the one that closed it; a bare `expect` in the same tick sees the trigger still
	focused and the test fails for a reason that has nothing to do with the dialog. A fixed
	sleep would paper over the same thing less honestly.
-->
<Story
	name="Focus is trapped and returned"
	asChild
	play={async ({ canvas }) => {
		const trigger = await canvas.getByRole('button', { name: 'Add Invoicing' });

		// Opened from the KEYBOARD, with Enter on the focused trigger, rather than with a
		// click. That is the modality this story is about, and it also sidesteps a Storybook
		// artefact: the specimen above renders `<Dialog.Root open>` and never closes it, and a
		// modal dialog puts `pointer-events: none` on <body> while it is open. Run in the same
		// page, that leaves the pointer blocked here and a click never lands. Nothing about
		// the product does this — no dialog in the app is born open and immortal.
		trigger.focus();
		expect(document.activeElement, 'the trigger did not take focus').toBe(trigger);
		await userEvent.keyboard('{Enter}');

		const content = await waitFor(() => {
			const element = document.querySelector<HTMLElement>('[data-slot="dialog-content"]');
			expect(element, 'the dialog never opened').not.toBeNull();
			expect(element!.contains(document.activeElement), 'focus never entered the dialog').toBe(
				true
			);
			return element!;
		});

		// Further than there are controls, so the trap is exercised rather than merely not
		// reached: without a loop, focus would have walked out into the page behind the
		// overlay somewhere in here.
		for (let step = 0; step < 8; step++) {
			await userEvent.tab();
			expect(content.contains(document.activeElement), `focus escaped on tab ${step + 1}`).toBe(
				true
			);
		}

		await userEvent.keyboard('{Escape}');

		await waitFor(() => {
			expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
			expect(document.activeElement, 'focus was not returned to the trigger').toBe(trigger);
		});
	}}
>
	<Specimen title="Focus" note="Open it from the keyboard; Escape puts focus back where it was.">
		<Dialog.Root>
			<Dialog.Trigger>
				{#snippet child({ props })}
					<Button {...props}>Add Invoicing</Button>
				{/snippet}
			</Dialog.Trigger>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Add Invoicing to your plan?</Dialog.Title>
					<Dialog.Description>
						R450 becomes R570 a month. The change applies from today.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer showCloseButton={false}>
					<Button variant="quiet">Not now</Button>
					<Button>Confirm</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	</Specimen>
</Story>
