import adapter from '@sveltejs/adapter-node';

/**
 * SvelteKit configuration.
 *
 * This lives here, not inline in vite.config.ts, because `svelte.config.js` is the file
 * every other tool looks for: vite-plugin-svelte (which otherwise warns and falls back to
 * defaults — including in Vitest, where our components would then compile WITHOUT runes),
 * the shadcn-svelte CLI (which reads `kit.alias` and `kit.files.lib`), svelte-check, and
 * the language server. One source of truth beats a warning nobody reads.
 *
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
	compilerOptions: {
		// Force runes mode for our own code, but not for libraries that predate it.
		// Can be removed in Svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},

	kit: {
		// Coolify runs a long-lived Node process.
		//
		// ORIGIN must be set in the deployment environment. Without it adapter-node refuses
		// every form POST with "Cross-site POST form submissions are forbidden", which would
		// break every commit path in the product — quotes, invoices, payments, everything.
		adapter: adapter(),

		typescript: {
			config: (c) => {
				c.include.push('../drizzle.config.ts');
				c.include.push('../scripts/**/*.ts');
				c.include.push('../e2e/**/*.ts');
			}
		}
	}
};

export default config;
