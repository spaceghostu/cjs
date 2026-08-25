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
