/**
 * HOME, ASSEMBLED.
 *
 * Five panels, four of which arrive when they are ready. The page's `load` returns promises;
 * SvelteKit streams them; each panel holds its own skeleton until its own data lands. That is
 * not a nicety — it is the only shape in which "one slow module cannot block the rest of the
 * page" is true, and this screen reads from every module a business owns.
 *
 * THREE RULES, AND WHY EACH ONE IS NOT NEGOTIABLE
 * ----------------------------------------------
 * ONE TRANSACTION PER MODULE, BOUNDED. `fanout.ts` opens with the arithmetic: seven modules
 * times four simultaneous dashboards is twenty-eight connections wanted from a pool of ten,
 * and the failure lands on every OTHER request in the process. So the fan-out is bounded and
 * the excess queues. `fanoutEach` keeps that bound while handing each module's result back
 * the moment it settles, rather than when the last one does.
 *
 * THE REQUEST'S OWN `tx` IS NEVER CAPTURED. `loadHome` is called inside `withBusiness` and
 * takes a `Ctx`, and it must never reach for `ctx.tx` — that transaction is committed and its
 * connection returned before a single streamed promise resolves. Every contributor opens its
 * own scoped transaction through the same front door, which is also what keeps tenancy,
 * attribution and entitlement applied to each one.
 *
 * A MODULE THAT DOES NOT ANSWER IS NOT AN ERROR PAGE. A rejected streamed promise takes the
 * whole panel down with an exception; a module that hangs takes the panel down with nothing at
 * all. Both resolve to `failed` here instead, the panel renders what it does have, and the
 * standing panel names what it could not reach — because "you're all clear" is the one claim
 * on this screen that must never be made on incomplete information.
 */
import { fanoutEach } from '../fanout';
import { withBusiness, type Ctx } from '../ctx';
import { composeAgenda, composeFigures, composeResume, composeStanding } from './compose';
import { greeting } from './greeting';
import { modulesPanel, platformAgenda } from './platform';
import { contributorsFor, feeding } from './registry';
import type { RequestEvent } from '@sveltejs/kit';
import type { AgendaRow, ModulesPanel, MonthCard, ResumeCard, StandingPanel } from '$lib/core/home';
import type { ModuleKey } from '$lib/core/modules/catalogue';
import type { Contribution, ModuleSummary, PanelKey } from './types';
import type { FanoutResult } from '../fanout';

/**
 * How long a module gets before Home stops waiting for it.
 *
 * Not a query timeout — the statement keeps running and its transaction still ends properly.
 * This is the promise the PAGE makes: five seconds is long enough for a slow query on a cold
 * connection and short enough that nobody sits watching a skeleton wondering if it is broken.
 * What arrives after the deadline is discarded rather than raced onto the screen, because a
 * panel that rewrites itself once somebody has started reading is worse than one that was
 * honest about the gap.
 */
export const MODULE_DEADLINE_MS = 5_000;

/** What the route hands the page. Four promises, and two things that need no query at all. */
export type HomeData = {
	readonly greeting: string;
	readonly modules: ModulesPanel;
	readonly standing: Promise<StandingPanel>;
	readonly resume: Promise<readonly ResumeCard[]>;
	readonly figures: Promise<readonly MonthCard[]>;
	readonly agenda: Promise<readonly AgendaRow[]>;
};

export function loadHome(event: RequestEvent, ctx: Ctx, now: Date): HomeData {
	const { business, access } = ctx;
	const contributors = contributorsFor(access);

	// One task per owned contributor, each in its own short scoped transaction.
	const scheduled = fanoutEach(contributors, (contributor) =>
		withBusiness(event, (scoped) =>
			contributor.summarise({
				tx: scoped.tx,
				business: scoped.business,
				access: scoped.access,
				now
			})
		)
	);

	const byModule = new Map<ModuleKey, Promise<Contribution>>(
		contributors.map((contributor, index) => [
			contributor.module,
			settle(contributor.module, scheduled[index])
		])
	);

	/** A panel waits for the modules that feed it, and for no others. */
	function panel(key: PanelKey): Promise<readonly Contribution[]> {
		return Promise.all(
			feeding(contributors, key).flatMap((contributor) => {
				const contribution = byModule.get(contributor.module);
				return contribution ? [contribution] : [];
			})
		);
	}

	return {
		greeting: greeting(now, business.locale, event.locals.user?.name ?? null),
		modules: modulesPanel(access),
		standing: panel('standing').then(composeStanding),
		resume: panel('resume').then(composeResume),
		figures: panel('figures').then((cs) => composeFigures(cs, access, now, business.locale)),
		agenda: panel('agenda').then((cs) =>
			composeAgenda(cs, platformAgenda(access, now), business.locale)
		)
	};
}

/**
 * A scheduled task's outcome as a contribution — never a rejection, never a hang.
 *
 * The deadline and the failure collapse into the same answer deliberately. From the screen's
 * point of view "Inventory threw" and "Inventory is still thinking" are one thing: a module
 * that has not told us how it is. The panel says so in those words rather than in two.
 */
function settle(
	module: ModuleKey,
	result: Promise<FanoutResult<ModuleSummary>>
): Promise<Contribution> {
	return new Promise<Contribution>((resolve) => {
		const timer = setTimeout(() => resolve({ status: 'failed', module }), MODULE_DEADLINE_MS);

		void result.then((settled) => {
			clearTimeout(timer);
			resolve(
				settled.status === 'ok'
					? { status: 'ok', module, summary: settled.value }
					: { status: 'failed', module }
			);
		});
	});
}
