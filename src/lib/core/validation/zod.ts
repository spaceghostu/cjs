/**
 * THE ONE DOOR FROM A SCHEMA FAILURE TO A SENTENCE.
 *
 * Every server action in this product validates with zod, and must: the client check is a
 * courtesy and this is the boundary. But a `ZodError` is a developer's artefact — a path, a
 * code, and a message written for whoever wrote the schema — and today three of our boundaries
 * put pieces of it straight in front of a person:
 *
 *     "We couldn't save: lines.3.qtyE6 must be a whole number."
 *     "Invalid input: expected string, received undefined"
 *
 * The first names a field path. The second is zod's own copy. Both are exactly what the
 * standard forbids, and both disappear by routing through `check()`.
 *
 * HOW AUTHOR COPY SURVIVES AND ZOD'S DOES NOT
 * -------------------------------------------
 * The schemas in this codebase already contain good sentences — "Your business needs a name to
 * put on a quote", "A South African VAT number is 10 digits starting with 4". Those are house
 * copy, written deliberately, and a bridge that replaced them with something generic would be
 * a downgrade dressed as a standard. zod's DEFAULTS are the problem, and the two are
 * indistinguishable on a finished issue: both arrive as `issue.message`.
 *
 * zod v4 settles it for us. Its message precedence is schema-level first, per-parse error map
 * second, locale default last — so a map installed for the duration of one parse replaces the
 * defaults and NOTHING ELSE. `check()` installs one that returns a marker no human would ever
 * type. Afterwards, every issue still carrying that marker had no author copy and gets the
 * standard's words; every issue carrying anything else was written by one of us and is kept.
 *
 * Rejected alternative: a copy table keyed by field at each boundary, with the sentences moved
 * out of the schemas. It works, it is a much larger diff, and it splits every rule from its
 * words — a `min(1)` in one file and the sentence explaining it in another is how the two come
 * to disagree. The marker keeps them together.
 *
 * WHY WE ASK ZOD FOR THE INPUT
 * ----------------------------
 * `reportInput: true`, because two questions cannot be answered without it. "Was this field
 * left blank, or sent as the wrong shape?" is one code, `invalid_type`, for both. And "what did
 * they probably mean?" needs to see what they typed. The input never reaches a message: the
 * only things this module echoes back are values it constructed itself, like a repaired date.
 */
import type { core, ZodType } from 'zod';
import { plainly, keyOf, pathOf, placeOf, type Vocabulary } from './copy';
import {
	about,
	at,
	invalid,
	problem,
	valid,
	type Checked,
	type Invalid,
	type Problem
} from './types';

export type { Vocabulary } from './copy';

/**
 * Anything zod hands back on failure, described structurally.
 *
 * A shape rather than `z.ZodError`, so this module holds no zod value at all — the import
 * above is types only, and nothing in `$lib/core/validation` pulls a validation library into
 * a bundle that only wanted to render a message.
 */
export type ZodFailure = { readonly issues: readonly core.$ZodIssue[] };

/**
 * A marker no schema author would write and no person would type.
 *
 * It exists for the length of one `safeParse` call and is compared, never displayed. There is
 * a test asserting it cannot escape into a rendered message.
 *
 * The delimiters are written as `\u0000` ESCAPES rather than as literal NUL bytes. The value is
 * identical at runtime, but a source file carrying a raw NUL is classified as binary by git —
 * which silently costs you the diff in every review, on the one module whose whole job is to
 * be auditable.
 */
const NO_AUTHOR_COPY = '\u0000validation:no-author-copy\u0000';

/**
 * VALIDATE, AND SAY WHAT IS WRONG IN THE PRODUCT'S OWN WORDS.
 *
 * The sanctioned door. A server action calls this instead of `safeParse`, and by construction
 * cannot then hand a person a path or a schema message.
 *
 * `vocabulary` is optional and worth supplying: it is how a message learns to say "Line 4" and
 * "A description" instead of "That". See `Vocabulary` in ./copy.ts.
 */
export function check<T>(
	schema: ZodType<T>,
	input: unknown,
	vocabulary: Vocabulary = {}
): Checked<T> {
	const result = schema.safeParse(input, {
		error: () => NO_AUTHOR_COPY,
		// See the header: needed to tell "left blank" from "wrong shape", and to suggest.
		reportInput: true
	});
	if (result.success) return valid(result.data);
	return invalid(describe(result.error.issues, vocabulary, true));
}

/**
 * The same translation, for a `ZodError` that did not come through `check`.
 *
 * A `.parse()` that threw, an error caught from a library, a nested result pulled apart by
 * hand. It IGNORES every `issue.message` — without the marker there is no way to tell a
 * sentence one of us wrote from one zod generated, and guessing wrong in that direction is the
 * failure this module exists to prevent. The cost is that a schema's own copy goes unused;
 * parse through `check` and it will not.
 */
export function problemsFromZodError(
	error: ZodFailure,
	vocabulary: Vocabulary = {}
): readonly Problem[] {
	return describe(error.issues, vocabulary, false);
}

/** The same, as a refusal ready to return from an action. */
export function fromZodError(error: ZodFailure, vocabulary: Vocabulary = {}): Invalid {
	return invalid(problemsFromZodError(error, vocabulary));
}

/**
 * ONE PROBLEM PER FIELD, IN THE ORDER THEY WERE FOUND.
 *
 * zod reports every failing check; a form shows one message per input. Beyond the first, the
 * rest are noise attached to the same box — and the first is the one the person will fix, at
 * which point the parse runs again anyway.
 */
function describe(
	issues: readonly core.$ZodIssue[],
	vocabulary: Vocabulary,
	keepAuthorCopy: boolean
): readonly Problem[] {
	const seen = new Set<string>();
	const problems: Problem[] = [];

	for (const issue of issues) {
		const field = pathOf(issue.path);
		const anchor = field ?? '';
		if (seen.has(anchor)) continue;
		seen.add(anchor);
		problems.push(explain(issue, vocabulary, keepAuthorCopy, field));
	}

	return problems;
}

function explain(
	issue: core.$ZodIssue,
	vocabulary: Vocabulary,
	keepAuthorCopy: boolean,
	field: string | null
): Problem {
	// A field whose copy a core checker owns. It knows what the value MEANS — that 13 is not a
	// month — which is more than a schema predicate can express, so it wins over both the
	// author's sentence and ours.
	const key = keyOf(issue.path);
	const explainer = key === null ? undefined : vocabulary.explain?.[key];
	const place = placeOf(issue.path, vocabulary.rows);

	if (explainer) {
		const found = explainer(issue.input);
		if (found) return located(at(found, field), place);
	}

	const authored = keepAuthorCopy && issue.message !== NO_AUTHOR_COPY ? issue.message : null;
	return located(problem(authored ?? plainly(issue, vocabulary), { field }), place);
}

/**
 * The place goes on whoever wrote the words.
 *
 * Author copy gets "Line 4:" as readily as the standard's own does, which is the point: a
 * person looking at a table of eight lines needs to know which one, and that is not a fact the
 * sentence's author was in a position to know.
 */
function located(p: Problem, place: string | null): Problem {
	return place === null ? p : about(p, place);
}

/**
 * THE ONE EXEMPTION, AND WHY IT IS NOT A HOLE IN THE STANDARD.
 *
 * `src/lib/server/env.ts` validates the server's environment at boot. Its reader is not a user;
 * it is whoever deployed the thing, reading a container log, and the single most useful
 * sentence for them is the one this module forbids everywhere else:
 * "DATABASE_POOL_MAX: Too big: expected number to be <=200". The path IS the answer, and
 * softening it to "something here is out of date" would be a worse product, not a kinder one.
 *
 * So the exemption is granted here, named, and given a signature that cannot be mistaken for
 * the other door: it says "operator" in the name, it returns a block of log lines rather than a
 * `Checked`, and it will not compile into anything that renders a `Problem`. A boot failure is
 * never rendered to anybody either — the app does not start.
 */
export function explainToOperator(error: ZodFailure): string {
	return error.issues
		.map((issue) => `  - ${pathOf(issue.path) ?? '(root)'}: ${issue.message}`)
		.join('\n');
}
