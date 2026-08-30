/**
 * WHAT THE EDITOR IS HOLDING WHILE SOMEBODY TYPES.
 *
 * The boundary between text and exact integers, and the awkward cases are the whole point: a
 * cleared field, a trailing comma, a line somebody has started and not described yet.
 */
import { describe, expect, it } from 'vitest';
import { percent, quantity, unitPrice } from '$lib/core/money/ctor';
import { parseUnitPriceInput, ZAR } from '$lib/core/money';
import {
	blankLine,
	blockersToSending,
	depositIssue,
	DESCRIPTION_MAX,
	differencesFromRecord,
	editorFromQuote,
	lineFromItem,
	patchFromEditor,
	priceIssue,
	priceQuote,
	qtyIssue,
	quoteFromEditor,
	type EditorState,
	type Quote
} from './index';

function baseQuote(over: Partial<Quote> = {}): Quote {
	return {
		id: 'q1',
		status: 'draft',
		number: null,
		customer: {
			customerId: 'c1',
			name: 'Fynbos Interiors',
			contactPerson: 'Renske Malan',
			email: 'renske@fynbosinteriors.co.za',
			phone: null,
			vatNumber: null,
			addressLine1: null,
			addressLine2: null,
			city: null,
			postalCode: null,
			country: 'ZA'
		},
		sendTo: { name: 'Renske Malan', email: 'renske@fynbosinteriors.co.za' },
		validUntil: '2026-08-22',
		deposit: { kind: 'rate', rate: percent(50) },
		pricing: { mode: 'exclusive', engine: 'za_vat', vatRate: percent(15), policy: 'v1' },
		lines: [
			{
				id: 'l1',
				position: 0,
				description: 'Solid oak kitchen island top',
				provenance: null,
				documentDescription: null,
				qty: quantity(1_000_000),
				unitPrice: unitPrice(24_800_000_000, ZAR),
				taxTreatment: 'standard',
				vatRate: percent(15),
				sourceItemId: null
			}
		],
		savedAt: new Date('2026-08-04T19:47:00Z'),
		sentAt: null,
		...over
	};
}

describe('opening a saved quote', () => {
	it('shows numbers the way a person would have typed them', () => {
		const state = editorFromQuote(baseQuote());

		// Not "1,000000" and not "24800.000000". Nobody typed those.
		expect(state.lines[0].qty).toBe('1');
		expect(state.lines[0].unitPrice).toBe('24800');
		expect(state.deposit).toEqual({ kind: 'rate', rate: '50', amount: '' });
	});

	it('keeps a fractional quantity and a fractional price', () => {
		const state = editorFromQuote(
			baseQuote({
				lines: [
					{
						...baseQuote().lines[0],
						qty: quantity(2_500_000),
						unitPrice: unitPrice(33_333_333, ZAR)
					}
				]
			})
		);

		expect(state.lines[0].qty).toBe('2,5');
		expect(state.lines[0].unitPrice).toBe('33,333333');
	});

	it('turns nulls into empty fields rather than the word null', () => {
		const state = editorFromQuote(
			baseQuote({ customer: { ...baseQuote().customer, vatNumber: null, city: null } })
		);
		expect(state.vatNumber).toBe('');
		expect(state.city).toBe('');
	});
});

describe('a half-typed field', () => {
	/**
	 * The preview is a live picture of a document being made, and a document with one price
	 * still to be typed is a real state. Freezing on the last valid keystroke would be worse:
	 * the person would be looking at a number that is no longer what they typed.
	 */
	it('is worth zero to the preview, not an error and not a freeze', () => {
		const quote = baseQuote();
		const state = editorFromQuote(quote);
		// Not "24 8" — spaces are thousands separators, so that parses perfectly well as 248.
		// This is a price somebody is part-way through typing as words.
		state.lines[0].unitPrice = 'twenty-f';

		const live = quoteFromEditor(quote, state);
		expect(priceQuote(live).total.cents).toBe(0);
	});

	it('says so under the field, once there is something to say', () => {
		// An empty field is not a complaint. Somebody who has cleared a price is mid-edit.
		expect(qtyIssue('')).toBeNull();
		expect(priceIssue('   ')).toBeNull();

		expect(qtyIssue('two')).toMatch(/amount/i);
		// Six decimals is the limit for a UNIT price — "R100 for 3" is R33,333333 each — so the
		// value that is too precise has seven.
		expect(priceIssue('10,0000005')).toMatch(/six decimals/);
		expect(depositIssue({ kind: 'rate', rate: '120', amount: '' })).toMatch(/more than 100/);
		expect(depositIssue({ kind: 'none', rate: '', amount: '' })).toBeNull();
	});
});

describe('the autosave payload', () => {
	it('leaves out a line nobody has described yet', () => {
		const quote = baseQuote();
		const state = editorFromQuote(quote);
		state.lines = [...state.lines, blankLine('l2')];

		// The empty row somebody clicked "Add a line" to get. The database refuses a blank
		// description, so sending it would turn a normal moment in editing into a failed save
		// and a red indicator.
		expect(patchFromEditor(state).lines).toHaveLength(1);
	});

	it('renumbers positions from what is actually there', () => {
		const quote = baseQuote();
		const state = editorFromQuote(quote);
		state.lines = [blankLine('l0'), ...state.lines];

		const patch = patchFromEditor(state);
		expect(patch.lines.map((l) => l.position)).toEqual([0]);
	});

	it('sends exact integers, never text', () => {
		const quote = baseQuote();
		const state = editorFromQuote(quote);
		state.lines[0].unitPrice = '1 250,50';
		state.lines[0].qty = '2,5';

		const patch = patchFromEditor(state);
		expect(patch.lines[0].unitPriceMicros).toBe(1_250_500_000);
		expect(patch.lines[0].qtyE6).toBe(2_500_000);
	});

	it('reads a cleared field as absent, not as an empty string', () => {
		const quote = baseQuote();
		const state = editorFromQuote(quote);
		state.vatNumber = '   ';

		expect(patchFromEditor(state).customer.vatNumber).toBeNull();
	});

	it('reads a cleared deposit as no deposit', () => {
		const quote = baseQuote();
		const state = editorFromQuote(quote);
		state.deposit = { kind: 'none', rate: '', amount: '' };

		expect(patchFromEditor(state).deposit).toEqual({ kind: 'none' });
	});
});

describe('before you send', () => {
	it('names what is missing, rather than greying a button out', () => {
		const empty: EditorState = {
			...editorFromQuote(baseQuote()),
			customerId: null,
			sendToEmail: '',
			lines: []
		};

		expect(blockersToSending(empty)).toEqual([
			'Choose the client this quote is for.',
			'Add an email address to send it to.',
			'Add at least one line.'
		]);
	});

	it('is empty when the quote is ready', () => {
		expect(blockersToSending(editorFromQuote(baseQuote()))).toEqual([]);
	});

	it('counts a row with no description as no line', () => {
		const state = editorFromQuote(baseQuote());
		state.lines = [blankLine('l1')];
		expect(blockersToSending(state)).toContain('Add at least one line.');
	});
});

describe('what differs from the address book', () => {
	const record = {
		name: 'Fynbos Interiors',
		contactPerson: 'Renske Malan',
		email: 'renske@fynbosinteriors.co.za',
		phone: null,
		vatNumber: null,
		addressLine1: null,
		addressLine2: null,
		city: null,
		postalCode: null
	};

	it('finds nothing when nothing changed', () => {
		// Somebody who changed nothing is never interrupted.
		expect(differencesFromRecord(editorFromQuote(baseQuote()), record)).toEqual([]);
	});

	it('shows both values, so the person can answer the question', () => {
		const state = editorFromQuote(baseQuote());
		state.vatNumber = '4110998877';

		expect(differencesFromRecord(state, record)).toEqual([
			{ field: 'vatNumber', label: 'VAT number', was: null, now: '4110998877' }
		]);
	});

	it('treats clearing a field as a difference', () => {
		const state = editorFromQuote(baseQuote());
		state.contactPerson = '';

		expect(differencesFromRecord(state, record)).toEqual([
			{ field: 'contactPerson', label: 'Contact person', was: 'Renske Malan', now: null }
		]);
	});
});

describe('a line picked from Inventory', () => {
	/**
	 * The pick is a SNAPSHOT, not a link. Everything the item contributes is copied onto the
	 * line at this moment — repricing the item later must not touch a quote already made,
	 * which is the guarantee the FK-less `sourceItemId` column exists to keep.
	 */
	const oak = {
		id: '0b95e7b4-1111-4222-8333-444455556666',
		name: 'European oak, 40mm',
		unitOfMeasure: 'board',
		sellPrice: unitPrice(1_780_000_000, ZAR)
	};

	it('copies the name, remembers the item, and starts at one', () => {
		const line = lineFromItem(oak, 'fresh-id');

		expect(line.id).toBe('fresh-id');
		expect(line.description).toBe('European oak, 40mm');
		expect(line.sourceItemId).toBe(oak.id);
		expect(line.qty).toBe('1');
		expect(line.taxTreatment).toBe('standard');
	});

	it('leaves the client-facing description alone', () => {
		// `documentDescription` prints verbatim on the client's document and no quoting
		// surface can edit or clear it — so nothing third-hand is ever copied into it.
		expect(lineFromItem(oak, 'l1').documentDescription).toBeNull();
	});

	it('prefills the price the way the field convention writes one', () => {
		// No thousands grouping: the field convention `editorFromQuote` already uses.
		const line = lineFromItem(oak, 'l1');
		expect(line.unitPrice).toBe('1780');

		// And what the field shows parses back to the exact micros that were snapshotted.
		const parsed = parseUnitPriceInput(line.unitPrice);
		expect(parsed.ok && parsed.value.micros).toBe(1_780_000_000);
	});

	it('leaves the price empty when the item has none — and when it is zero', () => {
		// "We have not recorded what this sells for" is not zero, and a zero sell price is
		// not a price worth prefilling either. The person types the real one.
		expect(lineFromItem({ ...oak, sellPrice: null }, 'l1').unitPrice).toBe('');
		expect(lineFromItem({ ...oak, sellPrice: unitPrice(0, ZAR) }, 'l1').unitPrice).toBe('');
	});

	it('says where the line came from, and what one of it is', () => {
		// A quote line has no unit column, so "per board" travels in the provenance text —
		// without it, a per-board price on a line quantified in boards is ambiguous.
		expect(lineFromItem(oak, 'l1').provenance).toBe(
			'From Inventory · European oak, 40mm · per board'
		);
	});

	it('drops the unit suffix when a unit is the unremarkable one', () => {
		const hinge = { ...oak, name: 'Hinge pair', unitOfMeasure: 'each' };
		expect(lineFromItem(hinge, 'l1').provenance).toBe('From Inventory · Hinge pair');
	});

	it('clamps a boundless item name to what the wire will take', () => {
		// An item name has no cap, but the server refuses line text past `DESCRIPTION_MAX` —
		// and refuses the WHOLE autosave when one field fails. An unclamped pick would leave
		// the draft unsaveable, with no quoting surface able to shorten the provenance.
		const longNamed = { ...oak, name: 'x'.repeat(DESCRIPTION_MAX + 500) };
		const line = lineFromItem(longNamed, 'l1');

		expect(line.description.length).toBe(DESCRIPTION_MAX);
		expect(line.provenance?.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
		// Truncated, not replaced: what survives is still the head of the real name.
		expect(line.provenance?.startsWith('From Inventory · xxx')).toBe(true);
	});

	it('survives the autosave payload with its provenance intact', () => {
		const quote = baseQuote();
		const state = editorFromQuote(quote);
		state.lines = [...state.lines, lineFromItem(oak, 'picked-1')];

		const patch = patchFromEditor(state);
		const sent = patch.lines.find((l) => l.id === 'picked-1');

		// A picked line has a description, so it is not filtered out as an empty row.
		expect(sent).toBeDefined();
		expect(sent?.sourceItemId).toBe(oak.id);
		expect(sent?.unitPriceMicros).toBe(1_780_000_000);
		expect(sent?.provenance).toBe('From Inventory · European oak, 40mm · per board');
	});
});
