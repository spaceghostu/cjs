/**
 * JOBS' SERVER HALF — the door a route comes through.
 *
 * This lives in `server/core/` beside `home/` and `search.ts` rather than under
 * `server/modules/`, and that placement is the ticket's central decision rather than a filing
 * convenience: a job is FLOOR. It is created by the platform, for every business, whether or not
 * that business owns "Job scheduling" — the module gates the screens SPA-23 will build, not the
 * row. `db/schema/jobs.ts` carries the argument in full.
 *
 * THE AUTO-CREATE HOOK IS NOT HERE. It lives in `modules/quoting/accept.ts`, because that is
 * where the transition it hangs off happens: a job comes into existence at the moment a client
 * accepts a quote, and the code that notices that moment belongs beside the code that performs
 * it. What lives here is the creation itself, which Quoting calls.
 */
export { createJob, type CreateJobInput } from './create';
export { jobCommercialState, listJobs, loadJob, type JobListItem } from './queries';
