/**
 * "EXPORT CSV" — the invoice list's own export.
 *
 * Distinct from `/settings/export`, which zips every table this business owns. This one is the
 * list you are looking at, as a spreadsheet: the same filter, the same order, the columns the
 * screen shows. Somebody clicking Export next to `Unpaid 6` expects six rows, and giving them a
 * zip of the whole database instead would be technically more generous and practically useless.
 *
 * `read`, not `write`. A REMOVED module's invoices stay readable and exportable — that is the
 * whole point of the middle access state, and "Yours to take, any time" is the sentence printed
 * next to this button.
 *
 * BOUNDED. `MAX_PAGE_SIZE` rows, not the whole table: an unbounded query is a defect waiting for
 * a successful customer, and it is exactly as true of a download as of a page. When the bound is
 * hit the CSV says so in a final row rather than silently stopping — a truncated export that
 * looks complete is worse than one that admits it.
 */
import { withModule } from '$lib/server/core/ctx';
import { toCsv } from '$lib/server/core/export';
import { isInvoiceFilter, statusCopy, type InvoiceFilter } from '$lib/core/invoicing';
import { todayIn } from '$lib/core/calendar';
import { moneyToDecimalString } from '$lib/core/money';
import { MAX_PAGE_SIZE, listInvoices } from '$lib/server/modules/invoicing/queries';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const filter: InvoiceFilter = isInvoiceFilter(event.url.searchParams.get('filter'))
		? (event.url.searchParams.get('filter') as InvoiceFilter)
		: 'all';

	const now = new Date();
	const today = todayIn(now);

	const { csv, filename } = await withModule(event, 'invoicing', 'read', async (ctx) => {
		const page = await listInvoices(ctx.tx, { filter, page: 1, pageSize: MAX_PAGE_SIZE, now });

		const columns = [
			'Invoice',
			'Client',
			'Issued',
			'Due',
			'Status',
			'Amount',
			'Outstanding'
		] as const;

		const rows = page.items.map((invoice) => ({
			Invoice: invoice.number ?? 'Draft',
			Client: invoice.customerName ?? '',
			Issued: invoice.issueDate ?? '',
			Due: invoice.dueDate ?? '',
			// The same words the screen shows, from the same function — so a spreadsheet and the
			// list cannot describe one invoice two ways.
			Status: statusCopy(
				{
					status: invoice.status,
					dueDate: invoice.dueDate,
					paidOn: invoice.paidOn,
					hasAmount: invoice.hasAmount
				},
				today
			).text,
			// A plain decimal, not `formatZar`: this column is going into a spreadsheet, and
			// "R24 150,00" with a non-breaking space is text that will not sum.
			Amount: invoice.total ? moneyToDecimalString(invoice.total) : '',
			Outstanding: invoice.outstanding ? moneyToDecimalString(invoice.outstanding) : ''
		}));

		const truncated = page.total > page.items.length;
		const body = toCsv(columns, rows);

		return {
			csv: truncated
				? `${body}"Showing the first ${page.items.length} of ${page.total}. Use Export your data in Settings for everything.","","","","","",""\r\n`
				: body,
			filename: `${
				ctx.business.tradingName
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-|-$/g, '')
					.slice(0, 40) || 'business'
			}-invoices-${filter}-${today}.csv`
		};
	});

	// A UTF-8 BOM. Excel on Windows opens a CSV as the system codepage unless it finds one, which
	// turns a client called "Müller" into "MÃ¼ller" on the spreadsheet somebody sends their
	// accountant. Three bytes, and the whole class of complaint goes away.
	// eslint-disable-next-line no-irregular-whitespace -- U+FEFF, deliberately: see above
	return new Response(`﻿${csv}`, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'no-store'
		}
	});
};
