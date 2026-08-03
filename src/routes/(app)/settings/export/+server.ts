/**
 * STUB AWAITING DESIGN (T06). The download itself, from the sidebar footer's "Export your
 * data".
 *
 * A GET rather than a form action: it changes nothing, it is safe to retry, and it can be
 * bookmarked or scripted by someone who wants their own backups. It still goes through
 * `withBusiness`, so a signed-out request is sent to sign-in and the export is bounded by
 * the same Row Level Security as every other read in the product.
 */
import { withBusiness } from '$lib/server/core/ctx';
import { exportBusiness } from '$lib/server/core/export';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const { filename, zip } = await withBusiness(event, (ctx) => exportBusiness(ctx));

	return new Response(zip as BodyInit, {
		headers: {
			'content-type': 'application/zip',
			'content-length': String(zip.byteLength),
			'content-disposition': `attachment; filename="${filename}"`,
			// Somebody's tax records. Not for a shared proxy to keep a copy of.
			'cache-control': 'private, no-store'
		}
	});
};
