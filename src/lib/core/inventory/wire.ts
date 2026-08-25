/**
 * WHAT CROSSES THE NETWORK.
 *
 * The item form's payload, as a type both sides hold. The browser builds it; the server
 * validates with zod (`modules/inventory/wire.ts`) and never trusts one before that. Declaring
 * the shape here rather than only in the validator means a change to the form and a change to
 * what the server accepts cannot compile independently of each other.
 *
 * WHY THIS IS SMALL, AND WHY THAT IS THE POINT
 * --------------------------------------------
 * Quoting and Invoicing send the WHOLE document on every autosave, because a granular patch
 * stream has to arrive in order to be correct and an editor on a train does not guarantee that.
 * An item is not a document. It is eight fields, each valid on its own, submitted once when a
 * person is finished — so it crosses as an ordinary form POST, and there is no ordering problem
 * to design around.
 *
 * MONEY CROSSES AS INTEGERS, produced by the sanctioned parsers in the browser and rebuilt
 * through `db/map.ts` on the way in. A number that arrived over the network is an input like any
 * other.
 */
import type { MovementReason } from './types';

/**
 * A new or edited item.
 *
 * `openingQtyE6` is only meaningful on creation, and it is not a level — the server turns it into
 * one `inventory_movement` with reason `opening`. There is no field here, and no field
 * anywhere, that writes a quantity directly.
 */
export type ItemPatch = {
	readonly name: string;
	readonly unitOfMeasure: string;
	/** Millionths of a rand. */
	readonly costPriceMicros: number;
	/** Millionths of a rand. */
	readonly sellPriceMicros: number;
	/** Millionths of a unit. */
	readonly reorderPointE6: number;
	/** An existing location, or null to leave the item without a home for now. */
	readonly defaultLocationId: string | null;
	/**
	 * A location the person typed rather than picked.
	 *
	 * Locations are free-form per business, so a first item must not require visiting a settings
	 * screen that does not exist. The server creates it inside the same transaction as the item.
	 */
	readonly newLocationName: string | null;
	/** Millionths of a unit. Creation only; ignored on edit, where movements are the only route. */
	readonly openingQtyE6: number;
};

/**
 * A correction somebody is recording by hand.
 *
 * Deliberately requires a `reason` and a `note`: a quantity changing with no explanation is the
 * thing the append-only ledger exists to prevent, and an unexplained correction is the closest
 * this module gets to one.
 */
export type MovementPatch = {
	readonly locationId: string;
	/** Millionths of a unit. Signed — negative is stock leaving. */
	readonly qtyE6: number;
	readonly reason: MovementReason;
	readonly note: string;
};

/**
 * ONE COUNTED LINE, ON ITS WAY TO THE SERVER.
 *
 * `counted` is THE TEXT SOMEBODY TYPED, not a number — and that is the whole of the decision.
 * There is one parser in this product (`$lib/core/money`, reached through `checkQuantity`), it
 * lives on the server side of every boundary, and a component that turned "1 200,5" into an
 * integer before sending it would be the second one. The browser's own `checkQuantity` call is a
 * COURTESY: it decides whether to show a message under the input, and nothing else.
 *
 * `null` MEANS "I HAVE NOT LOOKED AT THIS ONE YET", and it is not the same as `"0"`. An empty
 * shelf and an empty row on a clipboard are different facts, `saveCountLine` stores them
 * differently, and the dashed border on the screen is the third place that says so.
 */
export type CountLinePatch = {
	readonly id: string;
	/** What was typed, trimmed. Null un-counts the line. */
	readonly counted: string | null;
};

/**
 * A BATCH, NOT A LINE AT A TIME.
 *
 * Counting is typing down a column, so the debounce that fires after a pause has several lines
 * waiting behind it. One request carrying all of them beats N racing requests for three reasons,
 * in order of importance: a closed tab can only flush ONE `sendBeacon` reliably; N requests can
 * land out of order and the loser silently wins; and the person is on a phone tethered in a yard.
 */
export type CountPatch = {
	readonly lines: readonly CountLinePatch[];
};

/** What the server answers with. The indicator shows what was WRITTEN, never what was hoped. */
export type CountSaveResult = {
	/** ISO 8601, from the database's clock. */
	readonly savedAt: string;
	/** How many of the submitted lines were stored. */
	readonly saved: number;
};
