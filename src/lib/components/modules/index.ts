/**
 * The module surfaces — the switcher, its confirmations, and the three small states that
 * carry most of the design's argument about how modularity should feel.
 *
 * None of them knows a module name. Everything comes from `$lib/core/modules/catalogue` and
 * the server's `catalogueGroups()` / `loadModulesView()`, which is what makes "adding an
 * eighth module needs no UI change" a property of the code rather than a hope.
 */
export { default as AddModuleDialog } from './AddModuleDialog.svelte';
export { default as ContextualAdd } from './ContextualAdd.svelte';
export { default as LockedModule } from './LockedModule.svelte';
export { default as ModuleAddedToast } from './ModuleAddedToast.svelte';
export { default as ModuleList, type ListGroup, type ListModule } from './ModuleList.svelte';
export { default as ModuleRow } from './ModuleRow.svelte';
export { default as ModuleSwitcher } from './ModuleSwitcher.svelte';
export { default as RemoveModuleDialog } from './RemoveModuleDialog.svelte';
export { default as RemovedModule } from './RemovedModule.svelte';

export { deltaAccent } from './accent';
export { countModules, filterGroups, type Filterable, type FilterableGroup } from './filter';
