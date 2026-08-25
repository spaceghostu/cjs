/**
 * A signed-in developer, in one command.
 *
 *   bun run db:seed
 *
 * Sign-in is a magic link whose email is printed to the dev server's console when SMTP is
 * unset (`$lib/server/core/mail`), which is correct for the product and tedious for the
 * fifteenth `db:dev:reset` of an afternoon. This mints the account the password form on
 * `/sign-in` already accepts, plus the business that keeps `handleGuard` from bouncing the
 * session to `/onboarding`.
 *
 * IT DOES NOT GO AROUND ANYTHING
 * ------------------------------
 * There is no dev-only bypass in the application — no `?dev_login=`, no branch on `dev` in
 * a route. Everything here is written through the SAME doors the product uses: the password
 * is hashed by better-auth's own `hashPassword`, so the credential is indistinguishable from
 * one created by sign-up; and the business and membership are inserted as the unprivileged
 * `cjs_app` role under `cjs.business_id`, which is exactly what `withNewBusiness` does in
 * `src/routes/onboarding/+page.server.ts`. If a tenant policy would refuse the real
 * onboarding write, it refuses this one too.
 *
 * LOCAL ONLY
 * ----------
 * It refuses to run against anything but a loopback host. A seeded account with a known
 * password is a back door if it ever reaches a shared database, and the check is on the
 * connection string rather than on NODE_ENV because that is the thing that decides which
 * database actually gets written to.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from 'better-auth/crypto';

/** Overridable so a second developer, or a second business, is one env var away. */
const EMAIL = process.env.SEED_EMAIL || 'dev@cjs.local';
const PASSWORD = process.env.SEED_PASSWORD || 'devpassword';
const NAME = process.env.SEED_NAME || 'Dev Developer';
const BUSINESS = process.env.SEED_BUSINESS || 'Dev Workshop';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * better-auth's identifier for an email+password credential. The `account` row is what
 * `signInEmail` looks up; a `user` row on its own can be found and never signed in as.
 */
const CREDENTIAL_PROVIDER = 'credential';

export type SeedResult = {
	email: string;
	password: string;
	userId: string;
	businessId: string;
	/** False when the account and business were already there and nothing was inserted. */
	created: boolean;
};

function assertLocal(connectionString: string): void {
	// `new URL` handles the ipv6 brackets and the credentials in the userinfo section, both
	// of which defeat a naive string match.
	const host = new URL(connectionString).hostname;
	if (LOOPBACK.has(host)) return;

	throw new Error(
		`Refusing to seed: DATABASE_URL points at "${host}", which is not a loopback address. ` +
			`This script creates an account with a known password — it belongs on a developer's ` +
			`machine and nowhere else.`
	);
}

/**
 * The identity half. No tenancy here: `identity` is the one schema without RLS, because a
 * person has to be findable before any business context exists.
 *
 * Re-running is an UPDATE rather than a failure, so `SEED_PASSWORD=... bun run db:seed`
 * is also how you change it.
 */
async function upsertUser(client: pg.Client): Promise<{ userId: string; created: boolean }> {
	const existing = await client.query<{ id: string }>(
		'select id from identity."user" where email = $1',
		[EMAIL]
	);

	const hash = await hashPassword(PASSWORD);

	if (existing.rows[0]) {
		const userId = existing.rows[0].id;
		// The credential can be missing even when the user is not — an identity created by a
		// magic link has no password until one is set.
		const updated = await client.query(
			`update identity."account" set password = $3, updated_at = now()
			  where user_id = $1 and provider_id = $2`,
			[userId, CREDENTIAL_PROVIDER, hash]
		);

		if (updated.rowCount === 0) {
			await client.query(
				`insert into identity."account" (id, account_id, provider_id, user_id, password)
				 values ($1, $2, $3, $2, $4)`,
				[randomUUID(), userId, CREDENTIAL_PROVIDER, hash]
			);
		}

		return { userId, created: false };
	}

	const userId = randomUUID();
	await client.query(
		`insert into identity."user" (id, name, email, email_verified) values ($1, $2, $3, true)`,
		[userId, NAME, EMAIL]
	);
	await client.query(
		`insert into identity."account" (id, account_id, provider_id, user_id, password)
		 values ($1, $2, $3, $2, $4)`,
		[randomUUID(), userId, CREDENTIAL_PROVIDER, hash]
	);

	return { userId, created: true };
}

/**
 * The tenant half, through the floor rather than around it.
 *
 * `cjs.user_id` alone is what `runAsUser` sets, and it is enough to read one's own
 * membership via `member_sees_own_membership`. Creating a business additionally adopts the
 * new id as `cjs.business_id` BEFORE the insert, so `tenant_isolation`'s WITH CHECK passes
 * on a row that does not exist yet — the same sequence as `withNewBusiness`.
 */
async function ensureBusiness(
	client: pg.Client,
	userId: string
): Promise<{ businessId: string; created: boolean }> {
	await client.query('select set_config($1, $2, true)', ['cjs.user_id', userId]);

	const membership = await client.query<{ business_id: string }>(
		'select business_id from core_member where user_id = $1 limit 1',
		[userId]
	);

	if (membership.rows[0]) {
		const businessId = membership.rows[0].business_id;
		// Adopt the tenant context on the ALREADY-EXISTS path too, not only when minting.
		// `tenant_isolation` is FORCEd, which binds the owner role as well, so anything seeded
		// after this point — stock, and whatever the next module adds — would otherwise be
		// refused on a second run with a message about a policy rather than about a mistake.
		await client.query('select set_config($1, $2, true)', ['cjs.business_id', businessId]);
		return { businessId, created: false };
	}

	const businessId = randomUUID();
	await client.query('select set_config($1, $2, true)', ['cjs.business_id', businessId]);

	await client.query(
		`insert into core_business (business_id, trading_name, city, country)
		 values ($1, $2, 'Cape Town', 'ZA')`,
		[businessId, BUSINESS]
	);
	// Owner, not staff — the seeded developer has to be able to add and remove modules.
	await client.query(
		`insert into core_member (business_id, user_id, role) values ($1, $2, 'owner')`,
		[businessId, userId]
	);

	return { businessId, created: true };
}

/**
 * STOCK, so the Inventory screens have something true to show.
 *
 * Written through `tenant_isolation` like everything else — `cjs.business_id` is already set by
 * `ensureBusiness` on this connection, and it has to be: the policy is FORCEd, which binds the
 * owner role too, so a seed that reached for a privileged path would be testing a path the
 * application does not have.
 *
 * QUANTITIES ARE MOVEMENTS, HERE AS EVERYWHERE. There is no level to seed. Each item gets one
 * `opening` movement, and the quantity the screens show is the sum of them.
 *
 * The numbers are the design's own, so the screens can be checked against a published figure
 * rather than against whatever looked plausible: European oak at R1 780 a board, sitting at 18,
 * which is the "expected 18" a stock count snapshots. Three items are deliberately at or under
 * their reorder point so the running-low state, the badge, the tab count and the header sentence
 * are all exercised by default — and one of those is exactly AT its point, which is the boundary
 * `isBelowReorderPoint` is tested on and the one a careless change would break first.
 *
 * FORTY-EIGHT ITEMS, AND THAT NUMBER IS LOAD-BEARING. T24's worked count is "47 of 48 counted",
 * and `prepareCount` snapshots one line per INVENTORY LEVEL ROW — per item per place it is held —
 * so a sheet of 48 needs 48 level rows. Every item below is opened in exactly one place, which
 * makes the two counts the same number and keeps the arithmetic checkable by hand.
 *
 * THE THIRTY-SEVEN ADDED FOR THAT ARE ALL STRICTLY ABOVE THEIR REORDER POINTS, deliberately. The
 * three at-or-under above are the complete set, and the one exactly AT its point is Sash clamp at
 * 4 of 4. Adding a fourth low item would silently change the tab count, the badge count and the
 * header sentence that `inventory.test.ts` and SPA-6's screens are written against.
 */
const PLACES = ['Rack A', 'Rack B', 'Bin 4', 'Bin 9', 'Finishing room', 'Yard'] as const;

/** name, unit, cost in rand, reorder point, opening quantity, place. */
const STOCK: readonly [string, string, number, number, number, string][] = [
	// ── The design's own ten. Five of these carry the worked count's variances. ──────────
	['European oak, 40mm board', 'board', 1780, 10, 18, 'Rack A'],
	['Blackened steel bracket, 300mm', 'each', 96, 40, 120, 'Bin 4'],
	['Danish oil, 5L', 'litre', 420, 12, 8, 'Finishing room'],
	['Birch ply, 18mm sheet', 'sheet', 400, 6, 9, 'Rack B'],
	['Brass countersunk screws, 4x40', 'box', 96, 5, 40, 'Bin 9'],
	['Sash clamp, 900mm', 'each', 650, 4, 4, 'Finishing room'],
	['Iroko, 25mm board', 'board', 1240, 8, 22, 'Yard'],
	['Beeswax polish, 1L', 'litre', 180, 6, 2, 'Finishing room'],
	['Piano hinge, 1800mm', 'each', 310, 3, 11, 'Bin 4'],
	['Walnut veneer sheet', 'sheet', 540, 5, 14, 'Rack B'],

	// ── Timber and board ────────────────────────────────────────────────────────────────
	['Tulipwood, 25mm board', 'board', 620, 8, 26, 'Rack B'],
	['Maple, 32mm board', 'board', 980, 6, 15, 'Rack A'],
	['Ash, 20mm board', 'board', 540, 8, 30, 'Rack A'],
	['Sapele, 38mm board', 'board', 1420, 4, 12, 'Yard'],
	['MDF, 18mm sheet', 'sheet', 320, 10, 35, 'Rack B'],
	['MDF, 12mm sheet', 'sheet', 240, 10, 28, 'Rack B'],
	['Marine ply, 12mm sheet', 'sheet', 690, 4, 11, 'Rack B'],
	['Melamine board, white', 'sheet', 430, 6, 19, 'Rack B'],
	['Worktop, oak 3m', 'each', 3200, 2, 5, 'Yard'],
	['Worktop, walnut 3m', 'each', 4100, 1, 3, 'Yard'],
	['Softwood batten, 38x38', 'metre', 42, 60, 240, 'Yard'],

	// ── Finishing ───────────────────────────────────────────────────────────────────────
	['Edge banding, oak 22mm', 'roll', 180, 3, 9, 'Bin 9'],
	['Edge banding, walnut 22mm', 'roll', 210, 3, 7, 'Bin 9'],
	['Wood glue, 5L', 'litre', 260, 4, 14, 'Finishing room'],
	['Contact adhesive, 1L', 'litre', 145, 4, 10, 'Finishing room'],
	['Polyurethane lacquer, 5L', 'litre', 780, 3, 8, 'Finishing room'],
	['Sanding sealer, 5L', 'litre', 520, 3, 7, 'Finishing room'],
	['Shrink wrap, 500mm', 'roll', 190, 3, 8, 'Finishing room'],
	['Protective blanket', 'each', 260, 4, 11, 'Finishing room'],

	// ── Abrasives and cutters ───────────────────────────────────────────────────────────
	['Abrasive discs, 120 grit', 'box', 240, 5, 22, 'Bin 4'],
	['Abrasive discs, 240 grit', 'box', 240, 5, 18, 'Bin 4'],
	['Abrasive belts, 80 grit', 'box', 310, 4, 12, 'Bin 4'],
	['Router bit, 12mm straight', 'each', 480, 2, 6, 'Bin 4'],
	['Router bit, 45 degree chamfer', 'each', 620, 2, 5, 'Bin 4'],
	['Forstner bit, 35mm', 'each', 290, 2, 8, 'Bin 4'],
	['Domino tenons, 6x40', 'box', 320, 3, 9, 'Bin 4'],
	['Biscuits, No. 20', 'box', 96, 4, 15, 'Bin 4'],

	// ── Ironmongery and fixings ─────────────────────────────────────────────────────────
	['Concealed hinge, 110 degree', 'each', 62, 40, 260, 'Bin 9'],
	['Hinge mounting plate', 'each', 28, 40, 300, 'Bin 9'],
	['Drawer runner, 450mm', 'each', 210, 20, 84, 'Bin 9'],
	['Drawer runner, 550mm', 'each', 245, 20, 66, 'Bin 9'],
	['Push-to-open catch', 'each', 74, 25, 120, 'Bin 9'],
	['Cabinet handle, brushed brass', 'each', 165, 20, 74, 'Bin 9'],
	['Cabinet knob, blackened', 'each', 98, 20, 96, 'Bin 9'],
	['Confirmat screws, 7x50', 'box', 128, 5, 26, 'Bin 9'],
	['Pocket-hole screws, 32mm', 'box', 142, 5, 21, 'Bin 9'],
	['Dowel pins, 8x40', 'box', 86, 4, 17, 'Bin 9']
];

async function seedInventory(client: pg.Client, businessId: string): Promise<boolean> {
	const already = await client.query('select 1 from inventory_item limit 1');
	if (already.rows.length > 0) return false;

	const places = new Map<string, string>();
	for (const name of PLACES) {
		const id = randomUUID();
		places.set(name, id);
		await client.query(
			'insert into inventory_location (id, business_id, name) values ($1, $2, $3)',
			[id, businessId, name]
		);
	}

	for (const [name, unit, costRand, reorder, opening, place] of STOCK) {
		const itemId = randomUUID();
		const locationId = places.get(place)!;

		await client.query(
			`insert into inventory_item
			   (id, business_id, name, unit, cost_micros, sell_micros,
			    reorder_point_e6, default_location_id)
			 values ($1, $2, $3, $4, $5, $6, $7, $8)`,
			[
				itemId,
				businessId,
				name,
				unit,
				// Rand -> millionths of a rand. Integers throughout; nothing here is a float.
				costRand * 1_000_000,
				Math.trunc(costRand * 1.6) * 1_000_000,
				reorder * 1_000_000,
				locationId
			]
		);

		await client.query(
			`insert into inventory_movement
			   (business_id, item_id, location_id, qty_e6, reason, unit_cost_micros, occurred_on)
			 values ($1, $2, $3, $4, 'opening', $5, current_date - 30)`,
			[businessId, itemId, locationId, opening * 1_000_000, costRand * 1_000_000]
		);
	}

	// One item with no cost recorded, so the valuation's "n items have no cost" line is real
	// rather than theoretical, and `Blank` gets exercised on the detail screen.
	const uncostedId = randomUUID();
	await client.query(
		`insert into inventory_item (id, business_id, name, unit, reorder_point_e6, default_location_id)
		 values ($1, $2, 'Offcuts, assorted', 'box', 0, $3)`,
		[uncostedId, businessId, places.get('Yard')!]
	);
	await client.query(
		`insert into inventory_movement
		   (business_id, item_id, location_id, qty_e6, reason, occurred_on)
		 values ($1, $2, $3, $4, 'opening', current_date - 30)`,
		[businessId, uncostedId, places.get('Yard')!, 6 * 1_000_000]
	);

	return true;
}

/**
 * A STOCK COUNT SOMEBODY IS HALFWAY THROUGH — T24's worked example, seeded so the four-step
 * screen has something true to open on.
 *
 * 48 lines: 42 that matched exactly, 5 that differ, and one shelf nobody has reached. The five
 * are the design's own, and their arithmetic is fixed rather than plausible:
 *
 *     European oak, 40mm board       18 -> 14   −4 x R1 780  = −R7 120
 *     Birch ply, 18mm sheet           9 -> 12   +3 x R400    = +R1 200
 *     Sash clamp, 900mm               4 ->  2   −2 x R650    = −R1 300
 *     Brass countersunk screws        40 -> 45  +5 x R96     =   +R480
 *     Danish oil, 5L                  8 ->  5   −3 x R420    = −R1 260
 *                                                             ─────────
 *                                                             −R8 000
 *
 * "47 of 48 counted", "Review 5 changes", "net effect on stock value −R8 000". Every figure on
 * the design's screen, from real rows.
 *
 * THE ONE UNCOUNTED LINE IS A COSTED ITEM ON PURPOSE. Its "Value effect" column then reads "—"
 * because nobody has counted it, not because nobody knows what it is worth — two different
 * absences that the review step words differently, and the seeded state should exercise the one
 * the design draws.
 *
 * IT IS BUILT THROUGH THE SAME SEQUENCE `prepareCount` USES, and it has to be: the database
 * refuses anything else. `app.freeze_count_snapshot()` only lets a line be INSERTed while the
 * count is still `preparing`, and `inventory_stock_count_line_counted_complete` refuses a counted
 * quantity with no timestamp beside it. So: header at `preparing`, lines, flip to `counting`,
 * then the counted quantities.
 *
 * AND THE NUMBER COMES OFF THE SAME COUNTER. `SC-0001` is allocated by the statement in
 * `src/lib/server/core/db/numbering.ts`, reproduced verbatim below rather than hardcoded —
 * writing the row without touching `core_document_number` would hand `SC-0001` out a second time
 * to the next count somebody starts in the app.
 */
const COUNTED_DIFFERENTLY: readonly [string, number][] = [
	['European oak, 40mm board', 14],
	['Birch ply, 18mm sheet', 12],
	['Sash clamp, 900mm', 2],
	['Brass countersunk screws, 4x40', 45],
	['Danish oil, 5L', 5]
];

/** The shelf nobody has reached. Out in the yard, which is exactly where that happens. */
const NOT_YET_COUNTED = 'Worktop, walnut 3m';

async function seedStockCount(
	client: pg.Client,
	businessId: string,
	userId: string
): Promise<boolean> {
	const already = await client.query('select 1 from inventory_stock_count limit 1');
	if (already.rows.length > 0) return false;

	// The figures above are arithmetic over THIS stock list. A database holding somebody else's
	// items would produce a count with the same shape and different numbers, which is worse than
	// no count at all — the screen would look right and be wrong.
	const stocked = await client.query<{ n: number }>(
		'select count(*)::int as n from inventory_item where archived_at is null'
	);
	if (stocked.rows[0].n !== STOCK.length + 1) return false;

	// Verbatim from `allocateDocumentNumber` — see the note above. `SC`, start 1, pad 4.
	const numbered = await client.query<{ value: string; prefix: string; pad: number }>(
		`insert into core_document_number (business_id, doc_type, prefix, pad, next_value)
		 values ($1, 'stock_count', 'SC', 4, 2)
		 on conflict (business_id, doc_type) do update
		    set next_value = core_document_number.next_value + 1, updated_at = now()
		 returning next_value - 1 as value, prefix, pad`,
		[businessId]
	);

	const { value, prefix, pad } = numbered.rows[0];
	const countId = randomUUID();

	// Last calendar month, so the seeded count is titled "Stock count · <last month>" whenever it
	// is run rather than being stuck in whichever July it was written in.
	await client.query(
		`insert into inventory_stock_count
		   (id, business_id, number_prefix, number_value, number_formatted,
		    period_start, period_end, status, started_at, started_by_user_id)
		 values ($1, $2, $3, $4, $5,
		         (date_trunc('month', current_date) - interval '1 month')::date,
		         (date_trunc('month', current_date)::date - 1),
		         'preparing', now() - interval '3 days', $6)`,
		[
			countId,
			businessId,
			prefix,
			Number(value),
			`${prefix}-${String(value).padStart(pad, '0')}`,
			userId
		]
	);

	// One line per level row, ordered by item name — `prepareCount`'s own shape. Every seeded item
	// is held somewhere, so there is no "no movements anywhere" case to fall through to here.
	await client.query(
		`insert into inventory_stock_count_line
		   (business_id, stock_count_id, item_id, location_id, position,
		    expected_qty_e6, unit_cost_micros, currency)
		 select $1, $2, lv.item_id, lv.location_id,
		        (row_number() over (order by i.name) - 1)::int,
		        lv.qty_e6, i.cost_micros, i.currency
		   from inventory_level lv
		   join inventory_item i on i.id = lv.item_id
		  where i.archived_at is null`,
		[businessId, countId]
	);

	// Only now does the sheet close, exactly as `prepareCount` closes it.
	await client.query(`update inventory_stock_count set status = 'counting' where id = $1`, [
		countId
	]);

	const untouched = [...COUNTED_DIFFERENTLY.map(([name]) => name), NOT_YET_COUNTED];

	// The 42 that matched. `counted_at` moves with the quantity or the CHECK refuses the row.
	await client.query(
		`update inventory_stock_count_line l
		    set counted_qty_e6 = l.expected_qty_e6,
		        counted_at = now() - interval '2 days',
		        counted_by_user_id = $2
		  where l.stock_count_id = $1
		    and l.item_id in (select id from inventory_item where name <> all($3::text[]))`,
		[countId, userId, untouched]
	);

	// The five the design draws.
	for (const [name, counted] of COUNTED_DIFFERENTLY) {
		await client.query(
			`update inventory_stock_count_line l
			    set counted_qty_e6 = $3,
			        counted_at = now() - interval '2 days',
			        counted_by_user_id = $2
			  where l.stock_count_id = $1
			    and l.item_id = (select id from inventory_item where name = $4)`,
			[countId, userId, counted * 1_000_000, name]
		);
	}

	return true;
}

/** Exported so an integration test can assert the seeded account actually signs in. */
export async function seed(connectionString: string): Promise<SeedResult> {
	assertLocal(connectionString);

	const client = new pg.Client({ connectionString });
	await client.connect();

	try {
		// One transaction: a user with no business would be seeded straight into onboarding,
		// which is the state this script exists to avoid.
		await client.query('begin');
		const { userId, created: userCreated } = await upsertUser(client);
		const { businessId, created: businessCreated } = await ensureBusiness(client, userId);
		const stockCreated = await seedInventory(client, businessId);
		const countCreated = await seedStockCount(client, businessId, userId);
		await client.query('commit');

		return {
			email: EMAIL,
			password: PASSWORD,
			userId,
			businessId,
			created: userCreated || businessCreated || stockCreated || countCreated
		};
	} catch (error) {
		await client.query('rollback').catch(() => {});
		throw error;
	} finally {
		await client.end();
	}
}

async function main(): Promise<never> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error('Set DATABASE_URL. `bun run db:dev` starts a local Postgres and prints it.');
		process.exit(2);
	}

	try {
		const result = await seed(url);
		console.info(
			`\n${result.created ? '✓ Seeded' : '✓ Already seeded'} — sign in at /sign-in with:\n\n` +
				`  email:    ${result.email}\n` +
				`  password: ${result.password}\n\n` +
				`  business: ${BUSINESS} (${result.businessId})\n`
		);
		process.exit(0);
	} catch (error) {
		console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	}
}

// Only when executed directly — importing this from a test must not exit the process.
if (import.meta.main) await main();
