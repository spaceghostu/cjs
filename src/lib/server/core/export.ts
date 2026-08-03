/**
 * "YOURS TO TAKE, ANY TIME."
 *
 * The design says it on the sidebar and offers "Export CSV" on the invoice list, and the
 * promise is load-bearing: a product that holds a small business's tax records has to be
 * one they can leave. So this is not a feature, it is a term of the deal.
 *
 * WHY THE SCOPING IS STRUCTURAL AND NOT A `WHERE` CLAUSE
 * -----------------------------------------------------
 * The obvious implementation writes `select * from t where business_id = $1` for each table
 * and gets it right until someone adds a table and forgets. This one never names a business
 * at all: every query runs through the caller's `Ctx`, so Row Level Security decides what
 * each `select *` returns. Getting a second business's row into the zip would require
 * defeating the same policy that protects every other read in the product.
 *
 * TABLES ARE DISCOVERED, NOT LISTED
 * ---------------------------------
 * The table list comes from the catalogue — every table carrying `business_id`, which
 * `scripts/invariants.sql` guarantees is every tenant table there is. A module added in
 * six months' time is exported the day its migration runs, with no edit here. A hardcoded
 * list would silently stop being complete, and the first person to notice would be someone
 * who had already left.
 */
import { zipSync, strToU8 } from 'fflate';
import { sql } from 'drizzle-orm';
import type { Ctx } from './ctx';

/** Schemas whose tables belong to a business. `identity` is not one — it is not tenant data. */
const EXPORTED_SCHEMAS = ['public', 'audit'] as const;

export type ExportedTable = { schema: string; name: string; rows: number };

export type BusinessExport = {
	filename: string;
	zip: Uint8Array;
	tables: ExportedTable[];
};

/**
 * Every row this business owns, as one CSV per table, in a zip.
 *
 * Runs on the caller's transaction, so it is bounded by that transaction's tenant context
 * exactly like any other query.
 */
export async function exportBusiness(ctx: Ctx): Promise<BusinessExport> {
	const tables = await tenantTables(ctx);
	const files: Record<string, Uint8Array> = {};
	const summary: ExportedTable[] = [];

	for (const table of tables) {
		const { rows, columns } = await readTable(ctx, table.schema, table.name);
		const key =
			table.schema === 'public' ? `${table.name}.csv` : `${table.schema}/${table.name}.csv`;
		files[key] = strToU8(toCsv(columns, rows));
		summary.push({ ...table, rows: rows.length });
	}

	files['README.txt'] = strToU8(readme(ctx, summary));

	return {
		filename: exportFilename(ctx),
		// `level: 6` — these are text files that compress extremely well, and an export is
		// something a person waits for exactly once.
		zip: zipSync(files, { level: 6 }),
		tables: summary
	};
}

/** A stable, sortable, obviously-yours name. */
export function exportFilename(ctx: Ctx, now: Date = new Date()): string {
	const slug =
		ctx.business.tradingName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 40) || 'business';
	return `${slug}-export-${now.toISOString().slice(0, 10)}.zip`;
}

/**
 * Every table carrying `business_id`, which the platform invariants guarantee is every
 * tenant table. Ordered so the zip reads the same way twice.
 */
async function tenantTables(ctx: Ctx): Promise<{ schema: string; name: string }[]> {
	const { rows } = await ctx.tx.execute<{ schema: string; name: string }>(sql`
		select n.nspname as schema, c.relname as name
		  from pg_class c
		  join pg_namespace n on n.oid = c.relnamespace
		 where c.relkind in ('r', 'p')
		   and n.nspname = any(${sql.raw(`array[${EXPORTED_SCHEMAS.map((s) => `'${s}'`).join(',')}]`)})
		   and exists (
		       select 1 from pg_attribute a
		        where a.attrelid = c.oid
		          and a.attname = 'business_id'
		          and a.attnum > 0
		          and not a.attisdropped
		   )
		 order by n.nspname, c.relname
	`);
	return rows;
}

async function readTable(
	ctx: Ctx,
	schema: string,
	name: string
): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
	// Identifiers come from `pg_class`, not from user input — there is no string here that
	// anybody outside the database chose.
	const { rows, fields } = await ctx.tx.execute<Record<string, unknown>>(
		sql`select * from ${sql.raw(`"${schema}"."${name}"`)}`
	);

	const columns = fields?.map((f) => f.name) ?? Object.keys(rows[0] ?? {});
	return { columns, rows };
}

/**
 * RFC 4180 quoting.
 *
 * Every value is quoted rather than only the ones that need it. Spreadsheets are forgiving
 * about extra quotes and unforgiving about a missing one, and a customer name containing a
 * comma is not an edge case — "Coastal Property Group, Cape Town" is a normal thing to type.
 */
export function toCsv(
	columns: readonly string[],
	rows: readonly Record<string, unknown>[]
): string {
	const lines = [columns.map(quote).join(',')];
	for (const row of rows) {
		lines.push(columns.map((column) => quote(render(row[column]))).join(','));
	}
	// CRLF, which is what RFC 4180 specifies and what Excel expects.
	return lines.join('\r\n') + '\r\n';
}

function quote(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

function render(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

/**
 * A person opening this zip in two years should not have to guess what they are looking at.
 */
function readme(ctx: Ctx, tables: readonly ExportedTable[], now: Date = new Date()): string {
	const widest = Math.max(...tables.map((t) => `${t.schema}.${t.name}`.length), 10);
	const listed = tables
		.map((t) => `  ${`${t.schema}.${t.name}`.padEnd(widest)}  ${t.rows} row(s)`)
		.join('\n');

	return [
		`${ctx.business.tradingName} — full data export`,
		`Taken ${now.toISOString()}`,
		'',
		'This is everything this business has in CJs, one CSV per table. The files are plain',
		'UTF-8 with a header row, quoted per RFC 4180, and open directly in Excel, Numbers,',
		'LibreOffice or any spreadsheet.',
		'',
		'Money is stored as whole cents, so 123456 means R1 234,56. Quantities and unit prices',
		'are stored as millionths, so 2500000 means 2,5. They are kept as exact integers',
		'because rounding errors in money are not acceptable, and converting them to decimals',
		'here would reintroduce exactly the problem that avoids.',
		'',
		'Tables:',
		listed,
		'',
		'Nothing has been withheld, and no export is ever deleted from your account.'
	].join('\n');
}
