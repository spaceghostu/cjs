import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';

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
		// Coolify is the default target and runs a long-lived Node process. Vercel sets
		// VERCEL=1 in its build environment, and adapter-node's output (a Node server in
		// `build/`) is not something Vercel can serve — it looks for `.vercel/output/` and
		// otherwise fails the build with "No Output Directory named public".
		//
		// Both targets run Node with real TCP sockets, so the driver constraint documented in
		// `$lib/server/core/db/client.ts` still holds: node-postgres keeps transactions and
		// `SET LOCAL`, which RLS session context depends on. That argument is against
		// stateless HTTP/edge drivers, not against Vercel's Node functions.
		//
		// ORIGIN must be set in the deployment environment for adapter-node. Without it
		// adapter-node refuses every form POST with "Cross-site POST form submissions are
		// forbidden", which would break every commit path in the product — quotes, invoices,
		// payments, everything. adapter-vercel derives the origin from request headers and
		// ignores ORIGIN entirely.
		adapter: process.env.VERCEL ? adapterVercel() : adapterNode(),

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
