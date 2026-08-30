/**
 * QUOTING'S CLIENT-SAFE CORE. Import from here.
 *
 * The model, the calendar and the pricing adapter — everything the editor needs in the browser
 * and the send transaction needs on the server, in one place so that neither can drift from
 * the other. The database side lives in `$lib/server/modules/quoting`, and nothing in here
 * knows it exists.
 */
export {
	PRICING_MODES,
	QUOTE_STATUSES,
	STANDARD_VAT_RATE_PPM,
	TAX_ENGINES,
	TAX_TREATMENTS,
	isQuoteStatus
} from './types';

export type {
	CalendarDate,
	DepositTerms,
	Quote,
	QuoteCustomer,
	QuoteLine,
	QuotePricing,
	QuoteStatus,
	SendTo
} from './types';

export {
	addDays,
	daysBetween,
	effectiveStatus,
	formatDocumentDate,
	formatShortDate,
	hasExpired,
	isCalendarDate,
	todayIn
} from './validity';

export { depositAmount, lineAmounts, priceQuote } from './pricing';
export type { QuotePrice } from './pricing';

export {
	DEFAULT_QUOTE_FOOTER,
	documentTaxLabel,
	editorTaxLabel,
	issuerFrom,
	quoteDocument
} from './document';
export type { QuoteDocumentInput } from './document';

export {
	blankLine,
	blockersToSending,
	depositIssue,
	differencesFromRecord,
	editorFromQuote,
	lineFromItem,
	patchFromEditor,
	priceIssue,
	qtyIssue,
	quoteFromEditor
} from './editor';
export type { EditorDeposit, EditorLine, EditorState, FieldDifference } from './editor';

export { PROMOTABLE_FIELDS } from './wire';
export type {
	CustomerPatch,
	DepositPatch,
	DraftPatch,
	LinePatch,
	PromotableField,
	SaveResult
} from './wire';
