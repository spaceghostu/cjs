import { describe, expect, it } from 'vitest';
import { initialsOf, tenantSubtitle } from './identity';

describe('initialsOf', () => {
	it('takes the first and last word', () => {
		expect(initialsOf('Thornhill Joinery')).toBe('TJ');
		expect(initialsOf('Bright Coast Electrical')).toBe('BE');
	});

	it('gives a one-word name two letters rather than one', () => {
		expect(initialsOf('Thornhill')).toBe('TH');
	});

	it('survives the whitespace a form lets through', () => {
		expect(initialsOf('  Thornhill   Joinery  ')).toBe('TJ');
	});

	it('counts a character, not a code unit', () => {
		// Naive `name[0]` splits a surrogate pair and renders half a glyph.
		expect(initialsOf('Élan Ateliers')).toBe('ÉA');
		expect(initialsOf('🪚Workshop')).toBe('🪚W');
	});

	it('returns nothing for nothing, rather than inventing a placeholder', () => {
		expect(initialsOf('')).toBe('');
		expect(initialsOf('   ')).toBe('');
	});
});

describe('tenantSubtitle', () => {
	it('is the design’s "Owner · Cape Town"', () => {
		expect(tenantSubtitle('owner', 'Cape Town')).toBe('Owner · Cape Town');
	});

	it('leaves no dangling separator when the address is empty', () => {
		expect(tenantSubtitle('staff', null)).toBe('Staff');
	});
});
