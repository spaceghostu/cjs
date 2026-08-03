/**
 * The command bar's one call. A GET, and it reads.
 *
 * `withBusiness` rather than `withModule`: search spans whatever this business has, and the
 * per-module gating happens inside `searchBusiness` where each source knows its own key. It
 * is also what makes the tenant scope structural — the handler never sees a business id, so
 * there is no parameter here that could be pointed at somebody else's records.
 *
 * No caching headers. Results reflect rows that change while a person is typing, and a
 * cached search result is a stale answer about their own data.
 */
import { json } from '@sveltejs/kit';
import { withBusiness } from '$lib/server/core/ctx';
import { searchBusiness } from '$lib/server/core/search';
import type { RequestHandler } from './$types';

/** Long enough for a customer's full name; short enough that nobody is posting an essay. */
const MAX_QUERY_LENGTH = 120;

export const GET: RequestHandler = async (event) => {
	const query = (event.url.searchParams.get('q') ?? '').slice(0, MAX_QUERY_LENGTH);

	return withBusiness(event, async (ctx) => {
		return json(await searchBusiness(ctx, query));
	});
};
