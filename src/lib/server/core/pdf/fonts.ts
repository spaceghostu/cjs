/**
 * THE THREE FACES A DOCUMENT IS SET IN.
 *
 * T17: "Fonts are embedded; the PDF renders correctly with no system fonts available." That is
 * not a nicety. A PDF that falls back to a host font renders differently on the client's
 * machine than on the business's, and a 2033 reprint of an invoice is then a different
 * document from the one that was issued.
 *
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------
 * Fontsource ships `.woff2` and nothing else — no `.ttf` in any of its packages. WOFF2 is a
 * Brotli-compressed wrapper that `fontkit` (and therefore pdf-lib) cannot read, so the bytes
 * have to be decompressed before they can be embedded. `wawoff2` is Google's own woff2 tool
 * compiled to WASM, and it is a devDependency doing runtime work in exactly one place: here.
 *
 * The alternative — checking three decompressed TTFs into the repository — was rejected. They
 * are ~200KB of binary that would then have to be kept in step with the package version by
 * hand, and the failure mode of forgetting is a document set in the wrong weight.
 *
 * WHY THE STATIC PACKAGES, NOT THE VARIABLE ONES
 * ----------------------------------------------
 * The app loads `@fontsource-variable/inter`, which is right for a screen. A PDF cannot use a
 * variable axis: what gets embedded is one instance, and the masthead needs 600 while the body
 * needs 400. `@fontsource/inter` ships them as separate files, which is what a PDF wants.
 *
 * CACHED FOR THE PROCESS. Decompression costs a few milliseconds and the answer never changes,
 * so it happens once. The promise itself is cached rather than the bytes, so two documents
 * rendering at the same moment do not both decompress.
 */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

/**
 * `createRequire` rather than a bare `import`.
 *
 * These are asset paths inside a package, resolved at runtime. Importing them would ask Vite
 * to bundle 90KB of binary into the server chunk and hand it back as a URL, which is not what
 * a `readFile` wants. Resolving through Node's own algorithm keeps the bundler out of it.
 */
const require = createRequire(import.meta.url);

const SOURCES = {
	/** Body text, labels, the parties block. */
	regular: '@fontsource/inter/files/inter-latin-400-normal.woff2',
	/** The masthead and the totals line. 14/600 with 0.14em tracking, per T17. */
	semibold: '@fontsource/inter/files/inter-latin-600-normal.woff2',
	/** Every numeral. Tabular by construction, which is what makes the columns align. */
	mono: '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'
} as const;

export type FontRole = keyof typeof SOURCES;

export const FONT_ROLES = Object.keys(SOURCES) as readonly FontRole[];

export type FontBytes = Readonly<Record<FontRole, Uint8Array>>;

let cached: Promise<FontBytes> | null = null;

async function decompressOne(specifier: string): Promise<Uint8Array> {
	const compressed = await readFile(require.resolve(specifier));
	// wawoff2 is CommonJS and has no types. The dynamic import keeps it off the startup path
	// for every request that never renders a PDF.
	const { decompress } = (await import('wawoff2')) as {
		decompress: (input: Uint8Array) => Promise<Uint8Array>;
	};
	return Uint8Array.from(await decompress(compressed));
}

/**
 * The embedded faces, decompressed once.
 *
 * Failure here is loud on purpose. A PDF rendered without its fonts is not a degraded PDF, it
 * is a different document — so there is no fallback to a standard face, and the send that
 * needed it fails with something a person can act on rather than shipping the wrong paper.
 */
export async function loadFonts(): Promise<FontBytes> {
	cached ??= (async () => {
		try {
			// SEQUENTIALLY, and this is not a style choice. `wawoff2` is Google's woff2 tool
			// compiled to WebAssembly, and it decompresses through a single shared WASM heap:
			// three concurrent calls interleave in it and hand back three corrupted fonts.
			// The failure is silent at this level — the bytes come back, they are simply not a
			// font, and the error surfaces four frames away as "Unknown font format", once in
			// every few runs. Three files, a few milliseconds each, once per process.
			const regular = await decompressOne(SOURCES.regular);
			const semibold = await decompressOne(SOURCES.semibold);
			const mono = await decompressOne(SOURCES.mono);
			return Object.freeze({ regular, semibold, mono });
		} catch (cause) {
			// Clear the cache so a transient filesystem problem does not poison every later
			// render in this process.
			cached = null;
			throw new Error(
				'Could not load the fonts a PDF is set in. The document was not produced, ' +
					'because a PDF without its embedded fonts is a different document.',
				{ cause }
			);
		}
	})();

	return cached;
}
