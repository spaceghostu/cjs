/**
 * FORM PRIMITIVES. The rendering layer for `$lib/core/validation` and `$lib/core/money`.
 *
 * WHY THIS IS NOT IN `src/lib/components/ui/form`.
 * That directory is vendored shadcn-svelte, and `eslint.config.js` says so out loud —
 * `ignores: ['src/lib/components/ui/**']`, "Not ours to lint or to hold to our zones". A
 * hand-written primitive dropped in there would be exempt from every architecture zone in this
 * repo, including the two that matter most to a field holding a price: the money-constructor
 * zone and the `parseFloat`/`toFixed` smoke alarm. A component that renders amounts, sitting in
 * the one directory where nothing checks whether it parses them by hand, is precisely the file
 * that would eventually parse them by hand.
 *
 * Note what is NOT an argument for this, though an earlier draft of this comment claimed it
 * was: zone 2 forbids `src/routes/(app)/**` and `src/lib/modules/**` from importing
 * `$lib/components/ui/*`, but zone 2's `files` pattern does not cover `src/lib/ui/index.ts`
 * itself — which is exactly why that barrel already re-exports `Button` and `Input` from the
 * vendored directory today. A primitive in `ui/form` could have been re-exported the same way
 * and screens would have reached it fine. Reachability was never the problem; linting was, and
 * that one reason is sufficient on its own.
 *
 * So it lives here, beside `money`, `inventory` and `quoting`, where it is linted and held to
 * the zones like everything else we wrote — and it is re-exported from `$lib/ui`, which is the
 * door screens actually come through. A screen imports `Field` from `$lib/ui`; nothing outside
 * this directory imports these files by path.
 */
export { default as Field } from './Field.svelte';
export { default as FieldError } from './FieldError.svelte';
export { default as MoneyField } from './MoneyField.svelte';
export { fieldIds, messageOf, type FieldControl, type FieldResult } from './field.js';
