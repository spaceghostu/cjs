/**
 * A FIELD'S WIRING, AND THE ONE PLACE A REFUSAL BECOMES A SENTENCE ON A SCREEN.
 *
 * `$lib/core/validation` decided what a message says. `$lib/core/money` decided what a number
 * is. Neither of them decided where the words go, what colour they are, or which input the
 * screen reader should be told they belong to — and before this file, seven screens each
 * decided that for themselves. Settings wrote `text-xs text-wrong` and set `aria-invalid` but
 * no `aria-describedby`. Sign-in set both. The quote line table set `aria-invalid` and then put
 * the message in a paragraph nothing pointed at. The two dialogs used `text-wrong-ink` at 14px.
 * Four renderings of one idea, none of them wrong on its own, all of them drifting.
 *
 * So this is the wiring, extracted:
 *
 *   `FieldControl`  the three attributes a control needs to be invalid OUT LOUD — an id to be
 *                   labelled by, `aria-invalid` for the border and the assistive tree, and
 *                   `aria-describedby` pointing at the sentence underneath it.
 *   `messageOf`     result-or-string in, the sentence to show out, `null` for "nothing to say".
 *
 * WHY A RESULT IS ACCEPTED AND NOT ONLY A STRING
 * ----------------------------------------------
 * `$lib/core/money` answers `{ ok: false, message }` and `$lib/core/validation` answers the
 * same shape with `problems` added. A field that takes the RESULT rather than a string it
 * pulled out of one cannot render a message the parser did not produce — no call site gets to
 * write its own copy for a number it could not read, and no call site gets to reach for
 * `parseFloat` to decide whether the number was readable in the first place. The message on the
 * failure arm is already `sentence(problems[0])`: capitalised, stopped, and carrying the
 * "did you mean" where one exists. There is nothing left to assemble, which is exactly why the
 * standard tells the rendering layer to show it as-is.
 *
 * WHY BOTH `error` AND `result` EXIST
 * -----------------------------------
 * The server's `fail(400, { values, errors })` arrives as a `Record<field, string>` — already
 * rendered by `messagesByField()` on the way out, because a `Checked` cannot cross the wire
 * with its functions intact. That is a string, and pretending it is a result would mean every
 * form action inventing a fake `{ ok: false }` wrapper to satisfy a type. Meanwhile a money
 * field checked in the browser has a genuine result and should hand it over whole. Two props,
 * each honest about what it has; `messageOf` collapses them in one place with the string
 * winning, because a server that has spoken has spoken about the value that was actually
 * submitted.
 */
import type { ParseResult } from '$lib/core/money';
import type { Checked } from '$lib/core/validation';

/**
 * Anything that answers "may this be saved?".
 *
 * `Checked<T>` is structurally a `ParseResult<T>` — the validation core says so in its own
 * header and shapes itself that way on purpose — so the union is documentation rather than
 * widening. It is spelled out because a reader arriving at a call site should be able to see,
 * without opening two more files, that `checkAmount(...)` and `parseMoneyInput(...)` are both
 * welcome here.
 */
export type FieldResult = ParseResult<unknown> | Checked<unknown>;

/**
 * The attributes that make a control invalid out loud, handed to the caller's snippet.
 *
 * Handed over rather than applied, because a field wraps `Input`, `Textarea` and
 * `SelectTrigger` and those are three different elements with three different prop types. A
 * wrapper that rendered the control itself would have to grow a `type` prop and a branch per
 * control, and the twelfth kind of control would be the one it could not express.
 *
 * `aria-invalid` is what turns the border `--state-wrong-border`: the vendored `Input`,
 * `Textarea` and `SelectTrigger` all carry `aria-invalid:border-wrong-border` already, so the
 * invalid state is stated once, in the control, rather than restyled per field. Nothing here
 * writes a border colour.
 */
export type FieldControl = {
	readonly id: string;
	readonly 'aria-invalid': 'true' | undefined;
	readonly 'aria-describedby': string | undefined;
	/**
	 * Passed through so that "this field is disabled" is said once, to the field, and reaches
	 * both the control and the label that dims with it. Two places to say it is one place to
	 * forget it.
	 */
	readonly disabled: boolean | undefined;
};

/**
 * The sentence to put under the control, or null.
 *
 * An explicit `error` string wins over a `result`, because the string is what the SERVER said
 * about the value that was actually submitted and the result is at best what the browser
 * thinks about what is in the box now. Where both are present the person has already pressed
 * the button, and the answer that came back from the place that decides is the one they need.
 */
export function messageOf(
	error: string | null | undefined,
	result: FieldResult | null | undefined
): string | null {
	const given = error?.trim();
	if (given) return given;
	if (result && !result.ok) return result.message;
	return null;
}

/**
 * The ids a field hands out: one for the control, one for whichever line sits beneath it.
 *
 * Two ids and not one, so that `aria-describedby` can point at the helper when the field is
 * fine and at the message when it is not, without the two ever being the same node. A field
 * that reused one id would leave a stale description pointing at text that is no longer there
 * the moment the person fixed the typo.
 */
export function fieldIds(uid: string, given: string | undefined) {
	const control = given ?? `${uid}-control`;
	return {
		control,
		message: `${control}-message`,
		helper: `${control}-helper`
	} as const;
}
