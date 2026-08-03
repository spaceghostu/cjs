<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!--
	Dark is the product, not a preference. `defaultMode="dark"` means a first-time visitor
	gets dark even if their OS says light; `mode-watcher` still honours an explicit choice
	from localStorage, and `track` keeps following the OS once the user picks "system".

	`lightClassNames` is what light mode actually keys off — see the theme-switching note in
	`layout.css`. `.dark` stays on for third-party `dark:` utilities.

	`themeColors` paints the mobile browser chrome with `--surface-base` in either theme, so
	the address bar does not sit as a light band above a dark app.
-->
<ModeWatcher
	defaultMode="dark"
	lightClassNames={['light']}
	themeColors={{ dark: '#0E0F12', light: '#FBFBFA' }}
/>
{@render children()}
