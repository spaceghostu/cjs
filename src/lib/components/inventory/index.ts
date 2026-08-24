/**
 * INVENTORY'S COMPONENTS. Screens import from here.
 *
 * Dumb renderers, all of them: every word they say comes from `$lib/core/inventory/copy.ts` and
 * every number they show was computed on the server. None of them queries, formats money by hand,
 * or decides what "running low" means.
 */
export { default as FilterTabs } from './FilterTabs.svelte';
export { default as ItemCard } from './ItemCard.svelte';
export { default as ItemDetail } from './ItemDetail.svelte';
export { default as ItemDialog } from './ItemDialog.svelte';
export { default as ItemList } from './ItemList.svelte';
export { default as ItemTable } from './ItemTable.svelte';
export { default as MovementHistory } from './MovementHistory.svelte';
export { default as StockBadge } from './StockBadge.svelte';
export { default as SummaryBar } from './SummaryBar.svelte';
