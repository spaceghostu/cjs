/**
 * The printable document. Import from here.
 *
 * A type-only module today. It stays that way as long as the shape is the whole contract —
 * anything that manipulates a document belongs to the module that owns it, and anything that
 * renders one belongs to `$lib/components/document`.
 */
export { DOCUMENT_KINDS } from './types';
export type {
	DocumentDate,
	DocumentIssuer,
	DocumentKind,
	DocumentLine,
	DocumentParty,
	DocumentTotals,
	DocumentTypeLabel,
	PrintableDocument
} from './types';
