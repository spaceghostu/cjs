/**
 * "Yours to take, any time" is a term of the deal, so the tests treat it as one.
 *
 * The important assertion is not that the zip contains rows — it is that it CANNOT contain
 * anybody else's. Two businesses are set up with deliberately similar data, and the export
 * is checked for the other one's rows by content, not by trusting the query.
 *
 * Requires a database: `bun run db:dev`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { closePool } from './db/client';
import {
	cleanupFixtures,
	createBusiness,
	createCustomer,
	createUser,
	eventFor,
	localsFor,
	type TestBusiness,
	type TestUser
} from './db/fixtures';
import { withBusiness } from './ctx';
import { exportBusiness, exportFilename, toCsv } from './export';

afterAll(async () => {
	await cleanupFixtures();
	await closePool();
});

function read(zip: Uint8Array): Record<string, string> {
	const files = unzipSync(zip);
	return Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, strFromU8(bytes)]));
}

describe('exportBusiness', () => {
	let alice: TestUser;
	let thornhill: TestBusiness;
	let meridian: TestBusiness;
	let files: Record<string, string>;

	beforeAll(async () => {
		alice = await createUser('Alice Thornhill');
		const bongani = await createUser('Bongani Ndlovu');
		thornhill = await createBusiness(alice.id, 'Thornhill Joinery');
		meridian = await createBusiness(bongani.id, 'Meridian Fitouts');

		await createCustomer(thornhill, 'Coastal Property Group');
		await createCustomer(thornhill, 'Zanele Dube, Architect');
		await createCustomer(meridian, 'Highveld Retail');

		const locals = await localsFor(alice, thornhill);
		const result = await withBusiness(eventFor(locals), (ctx) => exportBusiness(ctx));
		files = read(result.zip);
	});

	it('contains one CSV per tenant table', () => {
		expect(Object.keys(files)).toEqual(
			expect.arrayContaining([
				'core_business.csv',
				'core_customer.csv',
				'core_member.csv',
				'core_document_number.csv',
				'audit/row_change.csv',
				'README.txt'
			])
		);
	});

	it('contains this business’s rows', () => {
		expect(files['core_customer.csv']).toContain('Coastal Property Group');
		expect(files['core_business.csv']).toContain('Thornhill Joinery');
	});

	it('contains NO trace of the other business, anywhere in the archive', () => {
		// The assertion that matters. Checked across every file rather than the customer
		// table alone, because a leak through a join or an audit row would be just as bad
		// and much easier to miss.
		const everything = Object.values(files).join('\n');
		expect(everything).not.toContain('Highveld Retail');
		expect(everything).not.toContain('Meridian Fitouts');
		expect(everything).not.toContain(meridian.id);
	});

	it('discovers tables rather than listing them', async () => {
		// A module added in six months is exported the day its migration runs. Proven by
		// checking the export found the audit log, which no line of export.ts names.
		expect(files['audit/row_change.csv']).toBeDefined();
		expect(files['audit/row_change.csv']).toContain('core_business');
	});

	it('quotes values that would otherwise break the CSV', () => {
		// "Zanele Dube, Architect" is a normal thing to type, and an unquoted comma silently
		// shifts every column after it.
		expect(files['core_customer.csv']).toContain('"Zanele Dube, Architect"');
	});

	it('explains itself to somebody opening it in two years', () => {
		const readme = files['README.txt'];
		expect(readme).toContain('Thornhill Joinery');
		// The one thing that is genuinely surprising about the data.
		expect(readme).toContain('123456 means R1 234,56');
		expect(readme).toContain('core_customer');
	});
});

describe('exportFilename', () => {
	it('is obviously yours, and sorts by date', () => {
		const ctx = { business: { tradingName: 'Thornhill Joinery' } } as never;
		expect(exportFilename(ctx, new Date('2026-08-03T10:00:00Z'))).toBe(
			'thornhill-joinery-export-2026-08-03.zip'
		);
	});

	it('survives a name made entirely of punctuation', () => {
		const ctx = { business: { tradingName: '!!!' } } as never;
		expect(exportFilename(ctx, new Date('2026-08-03T10:00:00Z'))).toBe(
			'business-export-2026-08-03.zip'
		);
	});
});

describe('toCsv', () => {
	it('quotes every field, per RFC 4180', () => {
		expect(toCsv(['a', 'b'], [{ a: '1', b: '2' }])).toBe('"a","b"\r\n"1","2"\r\n');
	});

	it('doubles embedded quotes rather than escaping them with a backslash', () => {
		// A backslash is a C convention. Spreadsheets read `""`, and getting this wrong
		// corrupts every row after the offending one.
		expect(toCsv(['a'], [{ a: 'He said "no"' }])).toBe('"a"\r\n"He said ""no"""\r\n');
	});

	it('keeps newlines inside a quoted field', () => {
		expect(toCsv(['a'], [{ a: 'line one\nline two' }])).toContain('"line one\nline two"');
	});

	it('writes NULL as empty, not as the word null', () => {
		expect(toCsv(['a'], [{ a: null }])).toBe('"a"\r\n""\r\n');
		expect(toCsv(['a'], [{}])).toBe('"a"\r\n""\r\n');
	});

	it('writes dates as ISO-8601, which every spreadsheet and every script can read', () => {
		const at = new Date('2026-08-03T10:30:00Z');
		expect(toCsv(['at'], [{ at }])).toContain('2026-08-03T10:30:00.000Z');
	});

	it('writes jsonb as JSON rather than [object Object]', () => {
		expect(toCsv(['before'], [{ before: { phone: null } }])).toContain('{""phone"":null}');
	});

	it('writes a header even when there are no rows', () => {
		// An empty table must still say what its columns were.
		expect(toCsv(['a', 'b'], [])).toBe('"a","b"\r\n');
	});
});
