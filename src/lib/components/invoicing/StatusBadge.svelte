<script lang="ts">
	/**
	 * ONE INVOICE'S STATE, IN WORDS.
	 *
	 * Every rule about what this says and what colour it earns lives in
	 * `$lib/core/invoicing/copy.ts`, which is pure and unit-tested. This component's whole job is
	 * to put the answer in a `Badge` — so "Due in 3 days" cannot be spelled one way on the list
	 * and another on a card, and so "reads like a person wrote it" is asserted by a test rather
	 * than reviewed by eye.
	 *
	 * `today` is a PROP, not `new Date()` in here. The server renders this during SSR and the
	 * browser hydrates it; two different clocks would produce two different badges and a
	 * hydration mismatch on the one screen where the numbers have to be trusted.
	 */
	import { Badge } from '$lib/ui';
	import { statusCopy, type StatusFacts } from '$lib/core/invoicing';
	import type { CalendarDate } from '$lib/core/calendar';

	let { facts, today }: { facts: StatusFacts; today: CalendarDate } = $props();

	const copy = $derived(statusCopy(facts, today));
</script>

<Badge variant={copy.tone}>{copy.text}</Badge>
