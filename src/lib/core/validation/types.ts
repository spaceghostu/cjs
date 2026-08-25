/**
 * THE SHAPE OF A VALIDATION ANSWER, AND THE SHAPE OF WHAT IT SAYS.
 *
 * One example in the design decides this whole module:
 *
 *     Caught before saving — 2026/13/02
 *     "There's no 13th month — did you mean 2 Dec 2026?"
 *
 * Read it again and count what it is doing. It caught the mistake BEFORE the save, so nothing
 * was lost and nothing has to be undone. It says what is actually wrong in words a person
 * uses — there is no 13th month — rather than naming the rule that fired. And it offers the
 * thing they probably meant, so the repair is a glance and a click rather than a retype.
 *
 * Those three are the standard, and this file is the type that makes them structural rather
 * than a habit somebody has to remember:
 *
 *   `Problem.says`        the plain-language wrong-thing.       (rule 1)
 *   `Problem.suggestion`  the probable intent, or null.         (rule 2)
 *   `Checked<T>`          returned, never thrown.               (rule 3)
 *
 * WHY `Checked<T>` IS SHAPED LIKE `ParseResult<T>`
 * -----------------------------------------------
 * `$lib/core/money` already answers "is this input any good?" with
 * `{ ok: true, value } | { ok: false, message }`, and every caller in the product already
 * reads it. Inventing a second, incompatible answer here would mean every call site learning
 * which door it came through. So `Checked<T>` IS that type with one field added:
 *
 *     { ok: false, message, problems }        assignable to ParseResult<T>'s failure arm
 *
 * A caller that only wants a sentence keeps reading `.message` and never learns this module
 * exists. A caller that renders fields (SPA-12) reads `.problems` and gets the field anchor
 * and the suggestion as data instead of parsing them back out of English.
 *
 * WHY `field` IS NEVER SHOWN
 * --------------------------
 * `Problem.field` carries `lines.3.qtyE6`, and it exists so the rendering layer can put the
 * message next to the input it belongs to. It is an ANCHOR, not copy. Today's boundaries
 * literally concatenate that path into the sentence a person reads —
 * "We couldn't save: lines.3.qtyE6 must be a whole number." — which is the failure this
 * module exists to end. Nothing here ever renders `field`; where a message needs to name a
 * place it says "Line 4", built from a word the boundary supplied.
 *
 * PUNCTUATION IS THE STANDARD'S, NOT THE CALL SITE'S
 * -------------------------------------------------
 * `says` is written WITHOUT a terminal full stop, and `sentence()` puts one back — or, when
 * there is a suggestion, joins the two with an em dash exactly as the design does. That is
 * why the money core's "Enter an amount." and a zod schema's "Your business needs a name"
 * can both become `says` and come out the far side punctuated the same way. One rule, applied
 * once, instead of twenty call sites each remembering half of it.
 */

/** The thing they probably meant, ready to say and ready to apply. */
export type Suggestion = {
	/**
	 * The offer, as it is said: "did you mean 2 Dec 2026?".
	 *
	 * Lower case and question-marked, because it is the back half of a sentence the standard
	 * assembles — never a sentence on its own.
	 */
	readonly say: string;
	/**
	 * The same thing as a value the field can adopt: "2026-12-02", "R10,00", "eft".
	 *
	 * Kept beside the words so that "apply this" is a single assignment rather than the
	 * rendering layer parsing the offer back out of the copy it was just given.
	 */
	readonly value: string;
};

/** One thing that is wrong, said once, in one place. */
export type Problem = {
	/**
	 * Where it goes, for the rendering layer: `tradingName`, `lines.3.qtyE6`, or null for
	 * something about the form as a whole. NEVER shown to anybody — see the header.
	 */
	readonly field: string | null;
	/** What is wrong, in plain language, with no terminal full stop. */
	readonly says: string;
	/** What they probably meant, where that is knowable. */
	readonly suggestion: Suggestion | null;
};

export type Valid<T> = { readonly ok: true; readonly value: T };

export type Invalid = {
	readonly ok: false;
	/** The first problem, rendered. Present so this is a `ParseResult` to anyone who wants one. */
	readonly message: string;
	/** Every problem found, one per field, in the order the schema found them. */
	readonly problems: readonly Problem[];
};

/**
 * The answer to "may this be saved?".
 *
 * Structurally a `ParseResult<T>` from `$lib/core/money`, so the two flow into each other
 * without an adapter at the call site — `input.ts` is the adapter, and it goes one way only.
 */
export type Checked<T> = Valid<T> | Invalid;

/** A suggestion. Both halves, because an offer nobody can apply is only half an offer. */
export function suggestion(say: string, value: string): Suggestion {
	return { say, value };
}

/**
 * One problem.
 *
 * `says` is normalised on the way in — trimmed, and stripped of a single trailing full stop —
 * so that copy written for the money core ("Enter an amount.") and copy written for a zod
 * schema ("Your business needs a name") arrive here in the same state and leave `sentence()`
 * punctuated the same way.
 */
export function problem(
	says: string,
	options: { field?: string | null; suggestion?: Suggestion | null } = {}
): Problem {
	return {
		field: options.field ?? null,
		says: trimStop(says),
		suggestion: options.suggestion ?? null
	};
}

/** The same problem, anchored somewhere else. A new object; the original is untouched. */
export function at(p: Problem, field: string | null): Problem {
	return { field, says: p.says, suggestion: p.suggestion };
}

/**
 * The same problem, said about a place: "Line 4: a description is needed".
 *
 * A colon rather than an em dash, because the dash is spoken for — `sentence()` uses it to
 * introduce the suggestion, and an English sentence with two of them in it stops being one.
 * The body's first letter drops to lower case so the place reads as the subject, which is also
 * why `sentence()` capitalises what it is given: the two together mean a boundary can write
 * "A description is needed" once and have it read correctly in both positions.
 */
export function about(p: Problem, place: string): Problem {
	return {
		field: p.field,
		says: `${place}: ${lowerFirst(p.says)}`,
		suggestion: p.suggestion
	};
}

export function valid<T>(value: T): Valid<T> {
	return { ok: true, value };
}

/**
 * A refusal.
 *
 * The rendered `message` is the FIRST problem rather than all of them joined. A person fixing
 * a form deals with one thing at a time, and a paragraph of five faults reads as "everything
 * you did is wrong" — which is both untrue and the tone this product is built to avoid. The
 * rest are in `problems`, where the rendering layer puts each one on its own field.
 */
export function invalid(problems: Problem | readonly Problem[]): Invalid {
	const list = Array.isArray(problems)
		? [...(problems as readonly Problem[])]
		: [problems as Problem];
	if (list.length === 0) {
		// A refusal with nothing to say is a bug in the caller, not a state a user should ever
		// reach. Say something true rather than showing an empty string.
		return { ok: false, message: 'Something here needs another look.', problems: [] };
	}
	return { ok: false, message: sentence(list[0]), problems: list };
}

/**
 * THE STANDARD, RENDERED.
 *
 *   no suggestion:   "There's no 13th month."
 *   with one:        "There's no 13th month — did you mean 2 Dec 2026?"
 *
 * An em dash with spaces around it, because that is what the design draws. The first letter is
 * capitalised here so that copy composed from a place ("Line 4: a description is needed") and
 * copy written as a standalone sentence both come out looking deliberate.
 */
export function sentence(p: Problem): string {
	const body = capitalise(p.says);
	if (p.suggestion) return `${body} — ${p.suggestion.say}`;
	// A question or an exclamation is already finished; anything else gets the stop `problem()`
	// took off on the way in.
	return /[!?]$/.test(body) ? body : `${body}.`;
}

/**
 * Field name -> message, for a form action's `fail(400, { values, errors })`.
 *
 * The shape `settings` and `onboarding` already return, so adopting the standard there is a
 * change of one loop rather than a change to what the page renders. Problems with no field
 * are left out: they belong at the top of the form, and `.message` already carries the first.
 */
export function messagesByField(result: Invalid): Record<string, string> {
	const out: Record<string, string> = {};
	for (const p of result.problems) {
		if (p.field === null) continue;
		out[p.field] ??= sentence(p);
	}
	return out;
}

/** Every problem as a sentence. For a summary at the top of a form, or for a log line. */
export function sentences(result: Invalid): readonly string[] {
	return result.problems.map(sentence);
}

function trimStop(says: string): string {
	const trimmed = says.trim();
	// Exactly one stop comes off, and `sentence()` puts exactly one back — so "Try 1 250,00."
	// is not double-stopped and an ellipsis comes out of the other end still an ellipsis.
	return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
}

function capitalise(text: string): string {
	const first = text.slice(0, 1);
	return first >= 'a' && first <= 'z' ? `${first.toUpperCase()}${text.slice(1)}` : text;
}

/**
 * Lower case the first letter, unless the second one is also a capital.
 *
 * The guard is not fussiness: "VAT number is needed" would otherwise become "vAT number is
 * needed". An acronym at the start of a sentence is left exactly as its author wrote it.
 */
function lowerFirst(text: string): string {
	const first = text.slice(0, 1);
	const second = text.slice(1, 2);
	if (first < 'A' || first > 'Z') return text;
	if (second >= 'A' && second <= 'Z') return text;
	return `${first.toLowerCase()}${text.slice(1)}`;
}
