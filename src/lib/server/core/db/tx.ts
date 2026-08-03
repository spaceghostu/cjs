/**
 * THE BRANDED TRANSACTION HANDLE.
 *
 * `client.ts` says the access model in one sentence:
 *
 *   > Module code takes a `Ctx` from `withModule(event, key, intent)`; there is no other
 *   > route to the database, and `unsafeDb` is not assignable to the branded `Tx` that
 *   > scoped code requires.
 *
 * This file is the second half of that sentence. `Tx` is an ordinary Drizzle transaction
 * carrying a phantom property that nothing can produce except `runScoped()` in `client.ts`,
 * which opens the transaction and sets the RLS session variables before handing it over.
 *
 * The brand is what turns the architecture from a convention into a compile error. ESLint
 * already refuses an import of `unsafeDb` outside this directory — but lint rules are
 * suppressible and a determined author can always find a way to hold the wrong object. What
 * they cannot do is pass it to a function that wants a `Tx`, because the type does not
 * match and no cast is available that does not read as exactly what it is.
 *
 * This module exports a TYPE and nothing else, which is why it is safe to import from
 * anywhere. There is no value here to misuse.
 */
import type { Database } from './client';

declare const TxBrand: unique symbol;

/** Drizzle's transaction object, as `Database['transaction']` hands it to its callback. */
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * A transaction that is known to be tenant-scoped.
 *
 * Holding one is proof that `SET LOCAL cjs.business_id` has already run on this connection,
 * so every query through it is constrained by Row Level Security to a single business.
 */
export type Tx = Transaction & { readonly [TxBrand]: true };
