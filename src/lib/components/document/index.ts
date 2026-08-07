/**
 * THE DOCUMENT RENDERER.
 *
 * One component, because T17's requirement is that there be exactly one. The editor preview,
 * the invoice detail panel and the PDF all render the same `PrintableDocument`; two of them
 * render it through `DocumentSheet`, and the PDF lays out the same model with the same
 * measurements in `$lib/server/core/pdf`.
 */
export { default as DocumentSheet } from './DocumentSheet.svelte';
