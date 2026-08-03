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

/** Money and quantity rendering from T03. Screens never format an amount by hand. */
export { Amount, Blank, Qty, StatDelta, UnitPrice } from '$lib/components/money';

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
