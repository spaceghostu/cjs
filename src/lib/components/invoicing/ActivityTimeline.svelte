<script lang="ts">
	/**
	 * "WHAT'S HAPPENED" — the right rail's story of one invoice.
	 *
	 * The design draws it exactly:
	 *
	 *   ● Opened by Baraka Café · Twice · last 26 Jul, 08:41
	 *   ○ Emailed to accounts@barakacafe.co.za · 18 Jul, 09:12
	 *   ○ Created from quote QT-1036 · 18 Jul, 09:04 · by you
	 *
	 * Reverse-chronological, a 6px dot each — settled green for the most recent, `#565963` for
	 * the rest — a 13px line and a 12px timestamp.
	 *
	 * OPENS ARE COUNTED, NOT LISTED. A client who opened an invoice five times did one thing five
	 * times, and a timeline that says so five times has buried everything else. So the `opened`
	 * events collapse into a single line carrying the count and the latest timestamp, which is
	 * also exactly what the design's "Twice · last 26 Jul, 08:41" is.
	 *
	 * "BY YOU" is real attribution, not a label. It comes from `actor_user_id` — the audit actor
	 * `ctx.ts` puts on the session — compared against whoever is reading the screen, so the same
	 * event reads "by you" to the person who did it and "by Alice" to their colleague.
	 */
	import { openCountPhrase, type InvoiceEvent, type InvoiceEventKind } from '$lib/core/invoicing';

	let {
		events,
		viewerUserId,
		clientName,
		memberNames = {}
	}: {
		events: readonly InvoiceEvent[];
		viewerUserId: string;
		clientName: string | null;
		/** userId -> display name, for events somebody else caused. */
		memberNames?: Readonly<Record<string, string>>;
	} = $props();

	type Entry = {
		id: string;
		text: string;
		at: Date;
		/** "by you", "by Alice", or nothing at all for something the client did. */
		by: string | null;
	};

	/** "18 Jul, 09:12". Hand-formatted for the same reason the money core does not use `Intl`. */
	const MONTHS = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];

	function stamp(at: Date): string {
		const day = at.getDate();
		const month = MONTHS[at.getMonth()];
		const hh = String(at.getHours()).padStart(2, '0');
		const mm = String(at.getMinutes()).padStart(2, '0');
		return `${day} ${month}, ${hh}:${mm}`;
	}

	function actorSuffix(event: InvoiceEvent): string | null {
		if (event.actor !== 'business') return null;
		if (!event.actorUserId) return null;
		return event.actorUserId === viewerUserId
			? 'by you'
			: `by ${memberNames[event.actorUserId] ?? 'a colleague'}`;
	}

	/** The sentence for one event. The client's opens are handled separately — see below. */
	function describe(kind: InvoiceEventKind, detail: string | null): string {
		switch (kind) {
			case 'created':
				return detail ? `Created ${detail}` : 'Created';
			case 'issued':
				return 'Issued';
			case 'emailed':
				return detail ? `Emailed to ${detail}` : 'Emailed';
			case 'reminded':
				return detail ? `Reminder sent to ${detail}` : 'Reminder sent';
			case 'paid':
				return detail ? `Paid in full · ${detail}` : 'Paid in full';
			case 'part_paid':
				return detail ? `Part payment recorded · ${detail}` : 'Part payment recorded';
			case 'payment_reversed':
				return 'Payment undone';
			case 'cancelled':
				return detail ? `Cancelled · ${detail}` : 'Cancelled';
			case 'opened':
				// Never reached: opens are collapsed before this runs.
				return 'Opened';
		}
	}

	const entries = $derived.by(() => {
		const opens = events.filter((e) => e.kind === 'opened');
		const rest = events.filter((e) => e.kind !== 'opened');

		const list: Entry[] = rest.map((event) => ({
			id: event.id,
			text: describe(event.kind, event.detail),
			at: event.occurredAt,
			by: actorSuffix(event)
		}));

		if (opens.length > 0) {
			const latest = opens.reduce((a, b) => (a.occurredAt > b.occurredAt ? a : b));
			list.push({
				id: `opened-${latest.id}`,
				text: `Opened${clientName ? ` by ${clientName}` : ''} · ${openCountPhrase(opens.length)} · last ${stamp(latest.occurredAt)}`,
				at: latest.occurredAt,
				by: null
			});
		}

		// Most recent first — the order somebody scanning for "what just happened" reads in.
		return list.sort((a, b) => b.at.getTime() - a.at.getTime());
	});
</script>

<section>
	<h2 class="text-ui font-medium text-ink">What's happened</h2>

	{#if entries.length === 0}
		<p class="mt-2 text-helper text-ink-muted">Nothing yet.</p>
	{:else}
		<ol class="mt-3 flex flex-col gap-3">
			{#each entries as entry, i (entry.id)}
				<li class="flex gap-2.5">
					<!--
						The most recent entry's dot is settled green; the rest are inert. That is the
						design's rule, and it does the work a "latest" label would otherwise need.
					-->
					<span
						class="mt-1.5 size-1.5 shrink-0 rounded-full {i === 0
							? 'bg-settled'
							: 'bg-decoration-quiet'}"
						aria-hidden="true"
					></span>
					<div class="min-w-0">
						<p class="text-[13px] text-ink">{entry.text}</p>
						<p class="mt-0.5 text-helper text-ink-muted">
							{stamp(entry.at)}{entry.by ? ` · ${entry.by}` : ''}
						</p>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>
