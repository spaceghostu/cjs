/**
 * `wawoff2` ships no types.
 *
 * Google's woff2 tool, compiled to WebAssembly. Two functions, and this product uses one of
 * them: WOFF2 in, TrueType out, so `fontkit` can read a font Fontsource only publishes
 * compressed. See `fonts.ts` for why that decompression happens at runtime rather than as a
 * pair of binaries checked into the repository.
 */
declare module 'wawoff2' {
	export function decompress(input: Uint8Array): Promise<Uint8Array>;
	export function compress(input: Uint8Array): Promise<Uint8Array>;
}
