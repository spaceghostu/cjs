/**
 * THE DESIGN SYSTEM.
 *
 * The one place a screen imports a control from. `src/lib/components/ui` is vendored
 * shadcn-svelte — ESLint zone 2 stops modules and app routes importing it directly, and the
 * message says why: "wrap it in the design system first, so all twelve modules change
 * together".
 *
 * That is what this barrel is. Today most of it is a re-export, and that is fine — the
 * value is not in the indirection, it is in the fact that when Invoicing needs a button
 * variant that Quoting does not have, there is exactly one file to add it to, and every
 * module gets it. Without the seam, the twelfth module is assembled from eleven different
 * people's idea of what a button is.
 *
 * A primitive appears here once a screen needs it. An unused re-export is a decision nobody
 * has had to make yet.
 */

export { Button, buttonVariants, type ButtonProps } from '$lib/components/ui/button';
export { Input } from '$lib/components/ui/input';
export { Label } from '$lib/components/ui/label';
export { Textarea } from '$lib/components/ui/textarea';
export { Badge } from '$lib/components/ui/badge';
export { Separator } from '$lib/components/ui/separator';
export { Skeleton } from '$lib/components/ui/skeleton';

export {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle
} from '$lib/components/ui/card';

export {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger
} from '$lib/components/ui/select';

export {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow
} from '$lib/components/ui/table';

export { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger
} from '$lib/components/ui/dialog';

/**
 * Toasts. The undo affordance in T13 is one, and the design is specific that its dismissal
 * window is generous and explicit — see `ModuleAddedToast`.
 */
export { Toaster } from '$lib/components/ui/sonner';

/** Money and quantity rendering from T03. Screens never format an amount by hand. */
export {
	Amount,
	Blank,
	Qty,
	StatDelta,
	UnitPrice,
	qtyText,
	signedQtyText
} from '$lib/components/money';

/**
 * MULTI-STEP FLOWS. `Stepper` is here deliberately, and not only because a screen needs it.
 *
 * T24 calls the stock count "the pattern-setter" for every flow after it — pay runs, VAT returns,
 * bank reconciliation. A component the next module is expected to reuse has to be reachable
 * through the door every module already comes to, or the next author writes their own and the
 * platform grows a second idea of what progress looks like.
 */
export { Stepper } from '$lib/components/flow';

/**
 * Fields, and what a field says when it cannot accept what it was given.
 *
 * Ours rather than vendored, and deliberately not in `$lib/components/ui/form`: that directory
 * is globally exempt from linting, so a primitive placed there would escape the money zones and
 * the validation barrel zone — on a component whose whole job is rendering money and validation
 * results. Reachability is NOT the reason: this barrel sits outside zone 2 and re-exports from
 * the vendored directory a dozen times above. `$lib/components/form/index.ts` has it in full.
 * This is the seam that makes the placement work — screens ask `$lib/ui` for a `Field` and
 * never learn where it lives.
 */
export {
	Field,
	FieldError,
	MoneyField,
	type FieldControl,
	type FieldResult
} from '$lib/components/form';

/**
 * What a screen says when it has nothing to show, or when something did not work.
 *
 * The standard these four implement is written out in `$lib/components/state/index.ts`, and it
 * is the deliverable rather than the components: an empty state is not an error and never wears
 * error colour; no-records and no-matches are different states and the branch is on counts;
 * a save failure keeps the work and offers a retry; not entitled is not an error; and not found
 * has exactly one sentence, from `notFound()` in `$lib/core/refusals`, because that one is a
 * tenancy boundary rather than a copy preference.
 *
 * Ours rather than vendored, and for the same reason `Field` is: `eslint.config.js` globally
 * ignores `src/lib/components/ui/**` — "Not ours to lint or to hold to our zones" — so a
 * hand-written primitive placed there would escape every architecture zone in this repo,
 * including the one that would notice `Refusal` growing a `role="alert"`. Reachability is NOT
 * the reason: this barrel sits outside zone 2 and re-exports from the vendored directory a
 * dozen times above, and `$lib/components/state/*` is directly importable from a route today.
 * The single door is the seam that makes the placement work — a screen asks `$lib/ui` for a
 * `Refusal` and never learns where it lives.
 *
 * The shadcn registry's `empty` and `alert` were fetched, read and rejected before these were
 * written — on geometry that contradicts the house panel on every axis, on `AlertTitle`'s
 * `line-clamp-1` truncating the long sentences this product writes, and on `Alert` hard-coding
 * the assertive `role="alert"` this layer forbids. `$lib/components/state/index.ts` records the
 * comparison in full, so nobody adds them later thinking the omission was an oversight.
 */
export { EmptyState, ErrorState, NoMatches, Refusal } from '$lib/components/state';

/** The per-tenant brand hook and palette from T01. */
export {
	BRAND_OPTIONS,
	BrandScope,
	DEFAULT_BRAND,
	brandAttrs,
	isBrandColor,
	toBrandColor,
	type BrandColor
} from '$lib/components/theme';
