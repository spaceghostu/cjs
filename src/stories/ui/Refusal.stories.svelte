<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Refusal } from '$lib/ui';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Refusal',
		component: Refusal,
		parameters: { layout: 'fullscreen' }
	});

	/**
	 * Real sentences, lifted from the code that produces them rather than written for the story.
	 * A specimen showing invented copy tells a reviewer how the banner looks and nothing about
	 * what it will actually be asked to hold — and what it is asked to hold here is long, full
	 * sentences, which is one of the two reasons the registry's `Alert` was rejected.
	 */
	const MAIL_REFUSED =
		'We could not send that quote just now, so nothing was sent and it is still a draft. ' +
		'Try again in a moment.';

	const SAVE_REFUSED = "We couldn't reach the server. Nothing was lost — try again.";
</script>

<!--
	The banner, in the two shapes it takes.

	WITH A RETRY is a save that did not land: the work is still on the screen, and the button
	flushes the same payload the autosave put back. WITHOUT ONE is a one-shot action that was
	refused — the action's own button is already the retry, and a second one beside the sentence
	would only raise the question of which to press.

	It carries `aria-live="polite"` and never `role="alert"`. Assertive would fire on static
	render, interrupting somebody mid-keystroke about a panel that was already there when they
	arrived.
-->
<Story name="Save failed, with a retry" asChild>
	<Specimen
		title="A save that did not land"
		note="The sentence says what did not happen, the work stays where it is, and the retry is a button. Nothing here clears an input or navigates away."
		surface="base"
	>
		<div class="max-w-2xl">
			<Refusal message={SAVE_REFUSED} onretry={() => {}} />
		</div>
	</Specimen>
</Story>

<Story name="Send refused, no retry" asChild>
	<Specimen
		title="A send the server refused"
		note="No retry offered: the Send button beside it is the retry. The sentence is the one the route actually returns, and it says both what did not happen and what is still true."
		surface="base"
	>
		<div class="max-w-2xl">
			<Refusal message={MAIL_REFUSED} />
		</div>
	</Specimen>
</Story>

<Story name="On a card surface" asChild>
	<Specimen
		title="The same banner, on the surface an editor sits on"
		note="The tint and its ink are asserted against all four surfaces in both themes by the token-contrast test. This is the surface a reviewer actually looks at, because it is the one an editor's panel puts underneath it."
		surface="card"
	>
		<div class="max-w-2xl">
			<Refusal message={MAIL_REFUSED} />
		</div>
	</Specimen>
</Story>
