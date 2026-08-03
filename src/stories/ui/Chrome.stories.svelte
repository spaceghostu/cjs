<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Chrome',
		component: Separator,
		parameters: { layout: 'fullscreen' }
	});
</script>

<!--
	The three primitives with nothing to specify: separator, avatar, label. They are here
	so that a change to the token layer cannot break them unnoticed.
-->
<Story name="Separator" asChild>
	<Specimen
		title="Separator"
		note="--border-subtle, not --border-default. A section divider should be quieter than the outline of a card."
		surface="card"
	>
		<div class="max-w-md">
			<p class="text-ui text-ink">Before VAT</p>
			<Separator class="my-3" />
			<p class="text-ui text-ink">VAT 15%</p>
			<div class="mt-6 flex h-6 items-center gap-3">
				<span class="text-ui text-ink-secondary">Draft</span>
				<Separator orientation="vertical" />
				<span class="text-ui text-ink-secondary">Edited 4 minutes ago</span>
			</div>
		</div>
	</Specimen>
</Story>

<Story name="Avatar" asChild>
	<Specimen title="Avatar" note="Three sizes. The fallback carries initials, never a silhouette.">
		<div class="flex items-center gap-4">
			<Avatar.Root size="sm"><Avatar.Fallback>TJ</Avatar.Fallback></Avatar.Root>
			<Avatar.Root><Avatar.Fallback>BC</Avatar.Fallback></Avatar.Root>
			<Avatar.Root size="lg"><Avatar.Fallback>MI</Avatar.Fallback></Avatar.Root>
		</div>
	</Specimen>
</Story>

<Story name="Label" asChild>
	<Specimen
		title="Label"
		note="14px, tied to its field with `for`. A label that is not tied to anything is decoration."
		surface="card"
	>
		<div class="flex max-w-xs flex-col gap-1.5">
			<Label for="business">Business name</Label>
			<Input id="business" value="Thornhill Joinery" />
		</div>
	</Specimen>
</Story>
