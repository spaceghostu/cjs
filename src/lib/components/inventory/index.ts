/**
 * INVENTORY'S COMPONENTS. Screens import from here.
 *
 * Dumb renderers, all of them: every word they say comes from `$lib/core/inventory/copy.ts` and
 * every number they show was computed on the server. None of them queries, formats money by hand,
 * or decides what "running low" means.
 */
export { default as CountApplied } from './CountApplied.svelte';
export { default as CountFooter } from './CountFooter.svelte';
export { default as CountHeader } from './CountHeader.svelte';
export { default as CountReview } from './CountReview.svelte';
export { default as CountSheet } from './CountSheet.svelte';
export { default as FilterTabs } from './FilterTabs.svelte';
export { default as ItemCard } from './ItemCard.svelte';
export { default as ItemDetail } from './ItemDetail.svelte';
export { default as ItemDialog } from './ItemDialog.svelte';
export { default as ItemList } from './ItemList.svelte';
export { default as ItemTable } from './ItemTable.svelte';
export { default as MovementHistory } from './MovementHistory.svelte';
export { default as StockBadge } from './StockBadge.svelte';
export { default as SummaryBar } from './SummaryBar.svelte';

/**
 * The one exception to "dumb renderers": the count sheet's autosave, which is state rather than
 * markup. It lives here because it belongs to this module's screens and nowhere else, and it is
 * a class in a `.svelte.ts` file because the hard part of an autosaving sheet is the ordering —
 * and ordering is testable without mounting anything.
 */
export {
	CountAutosave,
	COUNT_AUTOSAVE_DELAY_MS,
	type CountAutosaveOptions,
	type CountSaveStatus
} from './count.svelte.js';
