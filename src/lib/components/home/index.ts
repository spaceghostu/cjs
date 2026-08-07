/**
 * THE DASHBOARD'S PANELS.
 *
 * Five components, and not one of them knows a module's name. Every row, card and reassurance
 * they render was contributed by an owned module and arranged by `$lib/server/core/home` —
 * which is what makes "an eighth module needs no change to Home" a property of the code.
 *
 * Each takes exactly what one streamed promise resolves to, so a panel can be rendered in a
 * story, or asserted in a test, with a literal and no server.
 */
export { default as ComingUp } from './ComingUp.svelte';
export { default as MonthPanel } from './MonthPanel.svelte';
export { default as PanelSkeleton, type PanelShape } from './PanelSkeleton.svelte';
export { default as ResumePanel } from './ResumePanel.svelte';
export { default as StandingPanel } from './StandingPanel.svelte';
export { default as YourModules } from './YourModules.svelte';
