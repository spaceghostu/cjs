/**
 * DOCUMENT NUMBERS — `QT-1043`, `INV-1042`.
 *
 * A client can phone up about `INV-1042`. That means the number has to mean exactly one
 * document, forever, across concurrent requests, retries and crashes. Three properties
 * follow, and they are in tension:
 *
 *  1. NEVER DUPLICATED. Two quotes saved at the same instant must not both be `QT-1043`.
 *  2. NEVER REUSED. If a document is abandoned its number is spent. Handing `QT-1043` to a
 *     second client because the first quote was discarded is worse than a gap — the first
 *     client may already have the PDF.
 *  3. ALLOCATED WITH THE DOCUMENT. The number and the row it belongs to commit together or
 *     not at all.
 *
 * A Postgres `SEQUENCE` gives 1 and 2 but not 3 — sequences are deliberately
 * non-transactional, so a rollback leaves the number burnt and there is no per-tenant
 * sequence without creating one object per business per type.
 *
 * So: a counter row, and a single statement that increments it. `INSERT … ON CONFLICT DO
 * UPDATE … RETURNING` takes a row lock held until the caller's transaction ends, which
 * serialises concurrent allocations for the same business and type while leaving different
 * businesses entirely uncontended. Gaps are possible (property 2 requires them) and are not
 * a defect.
 *
 * This is the machinery `client.ts` means when it says transactions and `SET LOCAL` were the
 * reason node-postgres was chosen over neon-http. With stateless HTTP queries, none of the
 * three properties above is achievable.
 */
import { sql } from 'drizzle-orm';
import type { Tx } from './tx';
import type { DocumentType } from './schema/core';

/** The first number each sequence hands out, and the prefix it wears. */
const DEFAULTS: Record<DocumentType, { prefix: string; start: number; pad: number }> = {
	quote: { prefix: 'QT', start: 1001, pad: 4 },
	invoice: { prefix: 'INV', start: 1001, pad: 4 },
	credit_note: { prefix: 'CN', start: 1001, pad: 4 },
	stock_count: { prefix: 'SC', start: 1, pad: 4 }
};

export type DocumentNumber = {
	/** What the client sees: `QT-1043`. */
	formatted: string;
	/** What sorts and compares correctly: 1043. */
	value: number;
	prefix: string;
};

/**
 * Take the next number for this business and document type.
 *
 * Call it inside the same transaction that writes the document. If that transaction rolls
 * back the allocation rolls back with it — which does NOT reuse the number for the next
 * caller, because the next caller will already have been handed the one after.
 *
 * The `business_id` is not a parameter. It comes from the transaction's own RLS context, so
 * this function cannot be pointed at another tenant's counter even by mistake.
 */
export async function allocateDocumentNumber(
	tx: Tx,
	docType: DocumentType
): Promise<DocumentNumber> {
	const { prefix, start, pad } = DEFAULTS[docType];

	const { rows } = await tx.execute<{ value: number | string; prefix: string; pad: number }>(sql`
		insert into core_document_number (business_id, doc_type, prefix, pad, next_value)
		values (app.current_business_id(), ${docType}, ${prefix}, ${pad}, ${start + 1})
		on conflict (business_id, doc_type) do update
		   set next_value = core_document_number.next_value + 1,
		       updated_at = now()
		returning next_value - 1 as value, prefix, pad
	`);

	const row = rows[0];
	if (!row) {
		// Reachable exactly one way: the transaction has no business context, so
		// `app.current_business_id()` is NULL and the row violates the RLS check. That is a
		// programming error in the caller, not a condition to paper over.
		throw new Error(
			`Could not allocate a ${docType} number: the transaction has no business context. ` +
				`Document numbering must run inside withModule()/withBusiness().`
		);
	}

	return format(Number(row.value), row.prefix, row.pad);
}

/**
 * Read the next number WITHOUT taking it.
 *
 * For showing "this will be QT-1043" while a draft is still being edited. Deliberately not
 * a reservation: the number displayed here is provisional, and the one that ends up on the
 * document is whatever `allocateDocumentNumber` returns at save time. Reserving on open
 * would burn a number every time somebody clicked New and changed their mind.
 */
export async function peekDocumentNumber(tx: Tx, docType: DocumentType): Promise<DocumentNumber> {
	const fallback = DEFAULTS[docType];

	const { rows } = await tx.execute<{ value: number | string; prefix: string; pad: number }>(sql`
		select next_value as value, prefix, pad
		  from core_document_number
		 where business_id = app.current_business_id()
		   and doc_type = ${docType}
	`);

	const row = rows[0];
	if (!row) return format(fallback.start, fallback.prefix, fallback.pad);
	return format(Number(row.value), row.prefix, row.pad);
}

function format(value: number, prefix: string, pad: number): DocumentNumber {
	return {
		value,
		prefix,
		formatted: `${prefix}-${String(value).padStart(pad, '0')}`
	};
}
