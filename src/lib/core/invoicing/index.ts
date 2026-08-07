/**
 * INVOICING'S CLIENT-SAFE CORE. Import from here.
 *
 * The model, the derived status, the settlement arithmetic, the pricing adapter, the document
 * projection and every word the screens say — everything the browser needs and everything the
 * issue transaction needs, in one place so that neither can drift from the other. The database
 * side lives in `$lib/server/modules/invoicing`, and nothing in here knows it exists.
 */
export {
	COST_SOURCES,
	INVOICE_EVENT_ACTORS,
	INVOICE_EVENT_KINDS,
	INVOICE_STATUSES,
	PAYMENT_KINDS,
	PAYMENT_METHODS,
	REVERSAL_WINDOW_DAYS,
	STORED_INVOICE_STATUSES,
	isInvoiceStatus,
	isStoredInvoiceStatus
} from './types';

export type {
	CostSource,
	Invoice,
	InvoiceCustomer,
	InvoiceEvent,
	InvoiceEventActor,
	InvoiceEventKind,
	InvoiceLine,
	InvoicePayment,
	InvoicePricing,
	InvoiceStatus,
	PaymentKind,
	PaymentMethod,
	SendTo,
	StoredInvoiceStatus
} from './types';

export { effectiveInvoiceStatus, isOutstanding, isPastDue, statusAfterSettlement } from './status';

export { canReverse, daysSince, reversalWindowCloses, settle } from './settlement';
export type { Settlement } from './settlement';

export { lineAmounts, priceInvoice } from './pricing';
export type { InvoicePrice } from './pricing';

export {
	DEFAULT_INVOICE_FOOTER,
	documentTaxLabel,
	invoiceDocument,
	invoiceTypeLabel
} from './document';
export type { InvoiceDocumentInput } from './document';

export {
	DUE_SOON_DAYS,
	detailSentence,
	openCountPhrase,
	overdueIsNone,
	statusCopy,
	summarySentence
} from './copy';
export type { StatusCopy, StatusFacts, SummaryFacts, Tone } from './copy';

export { COST_LABELS, marginFootnote, marginPanel } from './margin';
export type {
	CostInput,
	CostKind,
	CostLine,
	Margin,
	MarginPanel,
	MarginUnavailable
} from './margin';

export {
	blankLine,
	blockersToIssuing,
	editorFromInvoice,
	invoiceFromEditor,
	patchFromEditor,
	priceIssue,
	qtyIssue
} from './editor';
export type { EditorLine, EditorState } from './editor';

export {
	INVOICE_FILTERS,
	INVOICE_SORTS,
	defaultDirection,
	filterLabel,
	isInvoiceFilter,
	isInvoiceSort,
	isSortDirection,
	matchesFilter
} from './filter';
export type { InvoiceFilter, InvoiceSort, SortDirection } from './filter';

export type { InvoiceListItem, InvoicePatch, LinePatch, PaymentInput } from './wire';
