/**
 * QUOTING'S SCREENS.
 *
 * The editor and its parts. `QuoteEditor` is the one a route mounts; the rest are exported
 * because they are the pieces the design names — a header band, a line table, a totals column
 * — and Invoicing will want two of them nearly unchanged at T21.
 */
export { default as QuoteEditor } from './QuoteEditor.svelte';
export { default as EditorHeader } from './EditorHeader.svelte';
export { default as InventoryPicker } from './InventoryPicker.svelte';
export { default as LineTable } from './LineTable.svelte';
export { default as PreviewPane } from './PreviewPane.svelte';
export { default as SaveBackDialog } from './SaveBackDialog.svelte';
export { default as SaveState } from './SaveState.svelte';
export { default as TermsFields } from './TermsFields.svelte';
export { default as TotalsPanel } from './TotalsPanel.svelte';
export { default as WhoItsFor } from './WhoItsFor.svelte';
export { default as QuoteList } from './QuoteList.svelte';
export { default as SentQuote } from './SentQuote.svelte';

export { AUTOSAVE_DELAY_MS, Autosave, clockTime } from './state.svelte.js';
export type { SaveStatus } from './state.svelte.js';
