/**
 * HOME'S SERVER HALF — the door the ROUTE comes through.
 *
 * A CONTRIBUTING MODULE does not use this file. It imports `./types` and `./readiness`
 * directly, and the reason is mechanical rather than stylistic: this barrel re-exports the
 * registry, the registry imports every module's `public.ts`, and a module importing the
 * barrel would close that loop into a genuine import cycle. `types.ts` imports nothing of
 * Home's, so it is safe from either side.
 *
 * The composition, the registry and the scheduling are Home's business either way. A module
 * reaching into them would be a module deciding how the dashboard renders it.
 */
export { NOTHING_TO_REPORT } from './types';
export type {
	AgendaContribution,
	Contribution,
	FigureContribution,
	ModuleSummary,
	ModuleSummarySource,
	SummaryContributor,
	SummaryInput
} from './types';

export { loadHome, MODULE_DEADLINE_MS, type HomeData } from './load';
export { greeting, partOfDay } from './greeting';
export { modulesPanel, platformAgenda } from './platform';
export { CONTRIBUTORS, contributorsFor, feeding } from './registry';
export { composeAgenda, composeFigures, composeResume, composeStanding } from './compose';
export { readiness, type ReadinessWords } from './readiness';
