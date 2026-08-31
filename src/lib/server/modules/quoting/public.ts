/**
 * QUOTING'S PUBLIC SURFACE.
 *
 * The only file outside this directory anyone may import — ESLint zone 3 enforces it, and the
 * message says why: "anything else couples two modules and breaks graceful degradation when
 * one is not owned". Home was the first caller and takes the summary; the documents route is
 * the second and takes the printable document.
 *
 * The third caller is the jobs derivation in `server/core/jobs/queries.ts`, which needs to know
 * what a job has been quoted without reaching into Quoting's queries to find out.
 *
 * The seam existed before the module did, on purpose. A boundary retrofitted after the first
 * import has already crossed it is not a boundary.
 *
 * Quoting's OWN screens (`src/routes/(app)/quoting/**`) import the files in this directory
 * directly. They are the module rather than a neighbour of it, and routing every one of their
 * queries through a re-export would make this file a copy of the directory listing.
 */
export { summariseQuoting } from './summary';
export { printableQuote } from './printable';
export { quotesForJob } from './queries';
