/**
 * STATE SURFACES, AND THE STANDARD FOR THEM. Import from here, never from the files inside.
 *
 * `$lib/core/validation` settled what a message SAYS when a field cannot accept what it was
 * given, and `$lib/components/form` settled where that message SITS. Everything else a screen
 * has to say when it cannot show what somebody came for — you have nothing here yet, nothing
 * matched, that did not save, you have not added this module, that is not there — had no shared
 * surface at all. It was written out again on each screen that needed it, seven verbatim copies
 * of one tinted banner and three of one empty paragraph, which is exactly the drift
 * `$lib/components/form/field.ts` documents for field errors, one layer up.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE STANDARD
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 *   1. AN EMPTY STATE IS NOT AN ERROR, AND NEVER WEARS ERROR COLOUR.
 *      A business that has not invoiced anything yet has not done anything wrong, and neither
 *      has the product. There is no tint, no border colour, no icon borrowed from a warning,
 *      and nothing announced. What an empty module needs is a way out of itself; that is the
 *      whole content of `EmptyState`, and it is drawn in the module's own accent.
 *
 *   2. NO RECORDS AND NO MATCHES ARE STRUCTURALLY DIFFERENT STATES.
 *      The argument was written in full on the screen that got it right first, and it is
 *      quoted rather than paraphrased because paraphrasing is how it would be lost:
 *
 *          "An empty MODULE is a panel with a way out of itself; an empty FILTER is one
 *           sentence and no call to action. Offering 'Add an item' under an empty 'Running
 *           low' tab would be the interface misreading good news as a lack. The branch is on
 *           `counts`, not on `items.length`, because that is the difference between 'you have
 *           nothing' and 'nothing matched'."
 *                                        — `$lib/components/inventory/ItemList.svelte`
 *
 *      THE BRANCH IS ON COUNTS, NEVER ON `rows.length`. A screen that branches on the visible
 *      rows tells a business with forty invoices that it has never invoiced anything, the
 *      moment a filter narrows to nothing. A screen that branches on which TAB is showing —
 *      which is what the invoices list did before SPA-13 — gets it wrong in both directions at
 *      once. `EmptyState` and `NoMatches` are two components rather than one with a `variant`
 *      precisely so that the decision cannot be made at the call site again.
 *
 *   3. A SAVE FAILURE SAYS SO, KEEPS THE WORK, AND OFFERS A RETRY.
 *      The sentence names what did not happen in words somebody can act on, the input is never
 *      cleared, and nothing navigates away — the failure is a report on an attempt, not a
 *      verdict on the document. An indicator that quietly stopped updating would be worse than
 *      no indicator at all. Retry is a button, and both autosave engines already put the failed
 *      payload back before they flip status, so retrying is a flush and nothing more.
 *
 *   4. NOT ENTITLED IS NOT AN ERROR.
 *      `module_locked` and `module_removed` reach the error boundary and render CALM, with no
 *      state colour anywhere on them. A business deciding whether to pay for Payroll should not
 *      be told that something broke, and a business whose Invoicing is read-only has data that
 *      is still perfectly intact. The file called `ErrorState` is named for WHERE IT MOUNTS,
 *      never for what it says; `toneOf()` in `$lib/core/refusals` decides how a refusal looks
 *      from what it is, and `refusals.test.ts` asserts it, so this is a test rather than a
 *      habit the next screen can forget.
 *
 *   5. NOT PERMITTED STATES THE REASON, IN THE SENTENCE.
 *      "Only an owner can add or remove modules. Ask whoever owns this business and they can do
 *      it in seconds." — `$lib/server/core/modules/subscribe.ts`. The reason and the way round
 *      it are in the same breath. A refusal that says only "forbidden" leaves somebody to guess
 *      which of the two it is, and guessing wrong wastes a phone call.
 *
 *   6. NOT FOUND HAS EXACTLY ONE SENTENCE, AND IT IS A TENANCY BOUNDARY.
 *      It comes from `notFound()` in `$lib/core/refusals` and from nowhere else. Row Level
 *      Security has already made "another business's quote" and "no such quote" the same
 *      answer; two sentences that both read well but differ by a word would confirm, to
 *      somebody guessing at URLs, that the record exists. `src/routes/(app)/not-found.test.ts`
 *      proves the property the only way it can be proved — a rival tenant's REAL committed
 *      record and a random UUID producing byte-identical refusals, on every tenant-scoped id
 *      route. This is not a copy preference and it must not be treated as one.
 *
 *   7. THIS LAYER COMPOSES WITH `$lib/core/validation` RATHER THAN DUPLICATING IT.
 *      `Field` and `FieldError` own everything anchored to a control, and they deliberately
 *      carry NO live region — `FieldError.svelte` says why, and names "the banner above the
 *      fields" as the thing that announces. `Refusal` IS that banner. Anything with a control
 *      to sit under belongs to `$lib/components/form`; anything without one belongs here.
 *
 *   8. EXACTLY ONE POLITE LIVE REGION PER SURFACE, AND NEVER `role="alert"`.
 *      `Refusal` carries `aria-live="polite"` itself, which is why every caller DELETED its
 *      wrapping paragraph rather than nesting the component inside it. `role="alert"` is
 *      assertive and fires on static render, so it would interrupt somebody mid-keystroke to
 *      tell them about a panel that was already on the screen when they arrived. It is also one
 *      of the two reasons the shadcn registry's `Alert` was rejected for this job.
 *
 *   9. THE PRIMITIVES ARE MARGIN-FREE.
 *      Spacing belongs to the caller, exactly as it does for `LockedModule` and `RemovedModule`
 *      — which is the only reason those two compose into four different page containers without
 *      a variant prop. Every list screen passes `class="mt-8"`; the banners pass the margin they
 *      already had.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHERE THE PIECES LIVE
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 *   EmptyState.svelte   the calm panel, geometry identical to `LockedModule`'s, with an
 *                       optional action snippet. Rules 1, 2 and 9.
 *   NoMatches.svelte    one sentence, no panel, no action, and never an action. Rule 2.
 *   Refusal.svelte      the tinted inline banner with an optional retry. Rules 3 and 8, and
 *                       the only file outside the vendored `ui/**` that names the wrong tint.
 *   ErrorState.svelte   the whole-surface panel the two `+error.svelte` files render, tone
 *                       derived rather than chosen. Rules 4, 5 and 6.
 *
 * The vocabulary itself is NOT here. `RefusalCode`, `notFound()`, `notFoundMessage()` and
 * `toneOf()` live in `$lib/core/refusals`, because the server throws them and a component may
 * not be imported into a route's `+page.server.ts`. This directory is the rendering; that file
 * is the decision.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THESE ARE HAND-WRITTEN, AND WHY THEY ARE HERE
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The shadcn-svelte registry's `empty` and `alert` were fetched and read before any of this was
 * written, and both were rejected on the evidence. `Empty` is centred, dashed, background-less,
 * `text-lg`/`gap-6`/`md:p-12`, where the house panel is left-aligned, solid, on
 * `--surface-card`, `text-[16px]`/`gap-2.5`/`p-7` — every axis contradicted, and overriding all
 * of them would leave nothing of the registry component but nested divs. `Alert` is closer, but
 * `AlertTitle` carries `line-clamp-1`, which truncates exactly the long full sentences this
 * product writes, and `Alert` hard-codes `role="alert"`, which rule 8 forbids. Recorded so
 * nobody adds them later believing the omission was an oversight.
 *
 * They sit beside `form/` rather than in `$lib/components/ui/` for the reason
 * `$lib/components/form/index.ts` gives in full: `eslint.config.js` globally ignores
 * `src/lib/components/ui/**` — "Not ours to lint or to hold to our zones" — so a hand-written
 * primitive dropped there would escape every architecture zone in this repo. Reachability is
 * NOT the reason and never was: zone 2 restricts `$lib/components/ui/*` and nothing else, so
 * these files are directly importable from `src/routes/(app)/**` today. They are re-exported
 * from `$lib/ui` because that is the door every screen already comes through, and that single
 * door is convention rather than enforcement — exactly as it is for `Field`.
 */
export { default as EmptyState } from './EmptyState.svelte';
export { default as ErrorState } from './ErrorState.svelte';
export { default as NoMatches } from './NoMatches.svelte';
export { default as Refusal } from './Refusal.svelte';
