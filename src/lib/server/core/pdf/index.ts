/**
 * DOCUMENT PDFs. Import from here.
 *
 * One entry point for the whole product: quotes today, invoices at T19, credit notes after
 * that. Nothing module-specific lives behind it — the input is a `PrintableDocument`, which is
 * paper, and paper does not know which module made it.
 */
export { renderDocumentPdf, pdfFilename } from './render';
export { layoutDocument, PAGE, MARGIN, PAPER } from './layout';
export type { Layout, PlacedRule, PlacedText } from './layout';
export { loadFonts } from './fonts';
