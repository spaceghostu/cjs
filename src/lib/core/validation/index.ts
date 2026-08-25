/**
 * VALIDATION, AND THE MESSAGE STANDARD. Import from here, never from the files inside.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE STANDARD
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The design contains exactly one validation message, and it settles the question for every
 * message this product will ever show:
 *
 *     Caught before saving — 2026/13/02
 *     "There's no 13th month — did you mean 2 Dec 2026?"
 *
 * Three things at once, and every one of them is a rule:
 *
 *   1. SAY WHAT IS WRONG, IN WORDS SOMEBODY USES.
 *      "There's no 13th month" — not "Invalid date format", not "invalid_format", not
 *      "expected string, received undefined". A person who is mid-quote and not an accountant
 *      has to know what to do next from the sentence alone. A message that names the rule that
 *      fired describes our code; a message that names the mistake describes their problem.
 *
 *   2. OFFER THE PROBABLE INTENT, WHERE ONE EXISTS.
 *      "did you mean 2 Dec 2026?" turns a retype into a glance. Note the shape: it is OFFERED,
 *      never applied. Silently correcting what somebody typed is how a quote goes out with a
 *      number nobody chose. Where the intent is not genuinely knowable, no offer is made —
 *      a confident wrong guess is worse than none. (`copy.ts` names the two we deliberately
 *      refuse to guess, and why.)
 *
 *   3. APPEAR BEFORE THE SAVE, NOT AFTER IT.
 *      "Caught before saving." Nothing is written, nothing has to be undone, and — the part
 *      that is easiest to get wrong — WHAT THEY TYPED IS STILL THERE. A form that clears a
 *      field because it could not read it has taken work away from somebody as a punishment
 *      for a typo. Every function here returns a result and touches no input; the text stays
 *      exactly where the person left it.
 *
 * And the prohibition that follows from all three: NO EXCEPTION, NO FIELD PATH, AND NO SCHEMA
 * MESSAGE IS EVER SHOWN TO ANYBODY. Not "lines.3.qtyE6", not "ZodError", not
 * "Too small: expected string to have >=1 characters", not a Postgres constraint name. If a
 * sentence was written for a developer, a developer is who gets to read it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHERE THE PIECES LIVE
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 *   types.ts   `Checked<T>` and `Problem` — the standard as a type, and `sentence()`, which
 *              is the ONLY place the em dash and the full stop are decided.
 *   dates.ts   the worked example. `2026/13/02` really does produce the sentence above.
 *   input.ts   money and quantity, wrapped. It parses NOTHING — `$lib/core/money` owns every
 *              string-to-number decision in this product and this only dresses the answer.
 *   zod.ts     the bridge. `check(schema, input, vocabulary)` replaces `schema.safeParse` at
 *              every server boundary, and is why a raw issue cannot reach a screen.
 *   copy.ts    the plain-language sentence for each zod issue code.
 *
 * NOT RE-EXPORTED, DELIBERATELY: `copy.ts`'s sentence table (`plainly`, `keyOf`, `pathOf`).
 * It is the FALLBACK — what the standard says when nobody has said anything better — and a
 * caller reaching for it is a caller about to hand-assemble a message. The two supported ways
 * to improve a sentence are to write it on the schema, where the rule it explains lives, or to
 * teach the boundary a `Vocabulary`. There is no third way in, for the same reason
 * `$lib/core/money` does not re-export its constructors.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * FOR THE LAYER THAT RENDERS THIS (SPA-12, and everything after it)
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 *   - Show `sentence(problem)`, or `result.message` for the first one. Do not build a message
 *     out of the parts; the punctuation is the standard's job and it is already done.
 *   - `problem.field` is an ANCHOR — `tradingName`, `lines.3.qtyE6` — for deciding WHICH input
 *     the message sits under. It is never displayed. `messagesByField(result)` gives you the
 *     `{ field: message }` map a form action already returns.
 *   - `problem.suggestion` is `{ say, value }`. `say` is already inside the sentence; `value`
 *     is what to put in the field IF the person accepts it. Accepting is an act they perform.
 *   - Never clear the input. The invalid text is the person's work-in-progress and the only
 *     copy of it that exists.
 *   - A money or quantity field asks `checkAmount` / `checkQuantity` / `checkUnitPrice` /
 *     `checkPercentage` and renders the answer. It does not look at the string itself, split
 *     on a comma, or call `Number()` — there is one parser in this product and these are its
 *     doorbells. ESLint bans `parseFloat` and `toFixed` outright, which is the same rule with
 *     teeth.
 *   - A client check is a COURTESY. The server validates again, always, with zod, through
 *     `check()`. Anything that only the browser enforces is not enforced.
 */
export type { Checked, Invalid, Problem, Suggestion, Valid } from './types';
export {
	about,
	at,
	invalid,
	messagesByField,
	problem,
	sentence,
	sentences,
	suggestion,
	valid
} from './types';

export { checkCalendarDate, explainDate } from './dates';

export {
	checkAmount,
	checkPercentage,
	checkQuantity,
	checkUnitPrice,
	fromParseResult
} from './input';

export type { Vocabulary, ZodFailure } from './zod';
export { check, explainToOperator, fromZodError, problemsFromZodError } from './zod';
