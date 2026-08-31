<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { ErrorState } from '$lib/ui';
	import { notFound } from '$lib/core/refusals';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/ErrorState',
		component: ErrorState,
		parameters: { layout: 'fullscreen' }
	});

	/**
	 * Every payload below is a real `App.Error`, copied from the code that throws it — `refuse()`
	 * in `$lib/server/core/entitlement`, `requireBillingAdmin` in `modules/subscribe`, the shared
	 * `notFound()` helper, and the house sentence `ctx.ts` says when a request invariant fails.
	 * Inventing plausible payloads here would make this file a drawing of an error page rather
	 * than a specimen of this one.
	 */
	const LOCKED: App.Error = {
		code: 'module_locked',
		message:
			"Your business hasn't added Payroll yet. You can add it any time, and only pay for the days you have it.",
		nextHref: '/settings/modules',
		nextLabel: 'Add Payroll'
	};

	const REMOVED: App.Error = {
		code: 'module_removed',
		message:
			"Invoicing was removed from your business, so it can't be changed. Everything already in it stays yours to read and export.",
		nextHref: '/settings/modules',
		nextLabel: 'Add Invoicing back'
	};

	const NOT_OWNER: App.Error = {
		code: 'not_billing_admin',
		message:
			'Only an owner can add or remove modules. Ask whoever owns this business and they can do it in seconds.',
		nextHref: '/settings/modules',
		nextLabel: 'See what your business has'
	};

	const MISSING: App.Error = notFound('quote');

	const BROKEN: App.Error = {
		code: 'unexpected',
		message: 'Something went wrong on our side. Nothing you did caused this.',
		nextHref: '/',
		nextLabel: 'Back to your dashboard'
	};
</script>

<!--
	THE FIRST FOUR ARE CALM, AND THAT IS THE POINT OF THIS FILE.

	A business that has never added Payroll, a business that removed Invoicing, a member who is
	not the owner, a quote that is not there — none of those is a failure of the product, and
	none of them is drawn in the colour reserved for one. Only the last story wears the tint.

	A reviewer can see the whole decision at a glance here, and the two Storybook projects assert
	every one of these in light and in dark without anybody switching a theme by hand.

	`headingLevel={2}` on every specimen below, which is the ONE thing here that is not what the
	product renders. On a real error page this panel is the whole document and its heading is the
	`h1`; inside a `Specimen` it sits under the specimen's own title, and an `h1` beneath an `h2`
	is a heading-order violation that the a11y addon fails the run on — correctly, because in
	THIS document it would be one. The tag is the only difference; the copy, the tone dispatch
	and the geometry are the shipped ones.
-->
<Story name="Module never added" asChild>
	<Specimen
		title="A module this business has never had"
		note="Calm. NOT ENTITLED IS NOT AN ERROR — the component is named for where it mounts, never for what it says, and the tone comes from toneOf() rather than from the call site."
		surface="base"
	>
		<div class="max-w-2xl"><ErrorState status={403} error={LOCKED} headingLevel={2} /></div>
	</Specimen>
</Story>

<Story name="Module removed" asChild>
	<Specimen
		title="A module that was removed"
		note="Also calm, and for a stronger reason: the data is still there, still readable and still exportable. Drawing this as a failure would be simply untrue."
		surface="base"
	>
		<div class="max-w-2xl"><ErrorState status={403} error={REMOVED} headingLevel={2} /></div>
	</Specimen>
</Story>

<Story name="Not the owner" asChild>
	<Specimen
		title="Something only an owner may do"
		note="The reason and the way round it are in the same sentence. A refusal that said only 'forbidden' would leave somebody to guess which of the two it was."
		surface="base"
	>
		<div class="max-w-2xl"><ErrorState status={403} error={NOT_OWNER} headingLevel={2} /></div>
	</Specimen>
</Story>

<Story name="Not found" asChild>
	<Specimen
		title="An id that is not this tenant's"
		note="One sentence, from notFound(), naming no id, no owner and no reason — because a record that exists and one that does not have to be indistinguishable to somebody guessing at URLs."
		surface="base"
	>
		<div class="max-w-2xl"><ErrorState status={404} error={MISSING} headingLevel={2} /></div>
	</Specimen>
</Story>

<Story name="Something broke" asChild>
	<Specimen
		title="A throw nobody anticipated"
		note="The one story that wears the tint. The cause was logged with the request id; what reaches the person is the house sentence, never the exception's own words."
		surface="base"
	>
		<div class="max-w-2xl"><ErrorState status={500} error={BROKEN} headingLevel={2} /></div>
	</Specimen>
</Story>
