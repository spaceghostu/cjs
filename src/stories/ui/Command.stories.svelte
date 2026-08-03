<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as Command from '$lib/components/ui/command/index.js';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Command',
		component: Command.Root,
		parameters: { layout: 'fullscreen' }
	});
</script>

<!--
	The raw list, not the ⌘K dialog. The command BAR — what it searches, what it can do,
	how it behaves when a module is not owned — is T09; this is only the surface it is
	built on.
-->
<Story name="Command list" asChild>
	<Specimen title="Command" note="Keyboard hints are mono, like every other numeral and key.">
		<div class="max-w-md rounded-xl border border-line-strong bg-surface-overlay">
			<Command.Root>
				<!--
					bits-ui gives the input role="combobox" and aria-expanded but no aria-controls,
					which ARIA requires. It cannot supply one itself — only the caller knows the id
					of the list — so the pairing is made here. T09 does the same for the real bar.
				-->
				<Command.Input placeholder="Search or jump to…" aria-controls="command-results" />
				<Command.List id="command-results">
					<Command.Empty>Nothing matches that.</Command.Empty>
					<Command.Group>
						<Command.Item>
							New quote
							<Command.Shortcut class="numeric">Q</Command.Shortcut>
						</Command.Item>
						<Command.Item>
							New invoice
							<Command.Shortcut class="numeric">I</Command.Shortcut>
						</Command.Item>
						<Command.Item>
							Record a payment
							<Command.Shortcut class="numeric">P</Command.Shortcut>
						</Command.Item>
					</Command.Group>
					<Command.Separator />
					<Command.Group>
						<Command.Item>Thornhill Joinery</Command.Item>
						<Command.Item>INV-2041</Command.Item>
					</Command.Group>
				</Command.List>
			</Command.Root>
		</div>
	</Specimen>
</Story>
