<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import { relativeLuminance } from '$lib/core/color/contrast.js';
	import Foundations from './foundations/Foundations.svelte';

	const { Story } = defineMeta({
		title: 'Foundations/Tokens',
		component: Foundations,
		parameters: {
			layout: 'fullscreen'
		}
	});

	const rootValue = (token: string) =>
		getComputedStyle(document.documentElement).getPropertyValue(token).trim();
</script>

<!--
	One story, two themes. `vite.config.ts` runs the whole story suite twice — once as
	`stories-light`, once as `stories-dark` — so this renders and is asserted in both
	without a second story to keep in sync. Switch themes interactively from the toolbar.

	The assertions below are the three things that would silently rot: that the theme
	switch reaches the tokens at all, that shadcn's names stay aliases rather than becoming
	a second palette, and that paper never follows the theme.
-->
<Story
	name="Tokens"
	play={async () => {
		const isLight = document.documentElement.classList.contains('light');

		const base = relativeLuminance(rootValue('--surface-base'));
		expect(isLight ? base : 1 - base).toBeGreaterThan(0.9);

		expect(rootValue('--background')).toBe(rootValue('--surface-base'));
		expect(rootValue('--card')).toBe(rootValue('--surface-card'));
		expect(rootValue('--muted-foreground')).toBe(rootValue('--text-muted'));
		expect(rootValue('--primary')).toBe(rootValue('--brand'));
		expect(rootValue('--ring')).toBe(rootValue('--brand-focus-ring'));

		expect(relativeLuminance(rootValue('--paper-bg'))).toBeGreaterThan(0.9);
		expect(relativeLuminance(rootValue('--paper-ink'))).toBeLessThan(0.05);
	}}
/>
