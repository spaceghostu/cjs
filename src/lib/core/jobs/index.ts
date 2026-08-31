/**
 * JOBS' CLIENT-SAFE CORE. Import from here.
 *
 * The model, the commercial derivation and every word the screens will say — everything the
 * browser needs and everything the acceptance transaction needs, in one place so that neither
 * can drift from the other. The database side lives in `$lib/server/core/jobs`, and nothing in
 * here knows it exists.
 *
 * There is one table behind all of this and one only. "Job" and "job card" are the same thing —
 * the client settled it, and `$lib/server/core/db/schema/jobs.ts` carries the argument in full.
 */
export { JOB_PRIORITIES, JOB_STATUSES, isJobPriority, isJobStatus } from './types';
export type { Job, JobPriority, JobStatus } from './types';

export { commercialState } from './commercial';
export type { CommercialInput, CommercialState, JobInvoice, JobQuote } from './commercial';

export { commercialSentence, statusLabel } from './copy';

export { materialsFromMovements } from './materials';
export type { JobMovementCost, MaterialsDerivation } from './materials';
