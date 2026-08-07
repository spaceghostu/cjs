/**
 * INVOICING'S PUBLIC SURFACE. See `quoting/public.ts` — same rule, same reason.
 *
 * ESLint zone 3 makes this the only path another module or a core route may import from. What is
 * here is deliberately small: Home's contribution, the printable document the shared `/documents`
 * route asks every owned module for, and the one function Quoting needs to turn an accepted quote
 * into an invoice.
 *
 * What is NOT here is everything else — the queries, the effects, the ledger. A caller that
 * wanted `recordPayment` would be a caller doing Invoicing's job from outside Invoicing.
 */
export { summariseInvoicing } from './summary';
export { printableInvoice } from './printable';
export { createFromQuote } from './effects';
export { invoiceForQuote } from './queries';
