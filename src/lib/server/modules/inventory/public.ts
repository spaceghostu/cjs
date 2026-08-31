/**
 * INVENTORY'S PUBLIC SURFACE. See `quoting/public.ts` — same rule, same reason.
 *
 * ESLint zone 3 makes this the ONLY file another module may import from. Everything below is
 * something a different module has a legitimate reason to ask Inventory: what Home should say
 * about it, and — once SPA-9 and SPA-10 arrive — what a line's stock cost was. Nothing here
 * exposes a query, a table or an effect.
 */
export { summariseInventory } from './summary';
export { listPickableItems } from './queries';
