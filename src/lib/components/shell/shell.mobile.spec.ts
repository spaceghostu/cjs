/**
 * THE PHONE ASSERTIONS.
 *
 * Runs in a real Chromium at 390 × 844 — the design's reference frame — under the `mobile`
 * Vitest project. Four of the five things asserted here cannot be checked any other way:
 * a computed height, a scrollWidth, a resolved outline width and the difference between
 * `sticky` and `fixed` are all facts about layout and the cascade, and a unit test that
 * asserted the CLASS `h-11` would pass while a parent's `line-height` quietly made the row
 * 38px. Only the count in 3 is a fact about markup.
 *
 * The five:
 *   1. Every touch target is at least 44px.
 *   2. Nothing overflows 390px horizontally.
 *   3. The bottom nav renders five items and no more, whatever the business owns.
 *   4. The primary action comes to rest below the last row, never over it.
 *   5. The bottom nav is operable from the keyboard: every slot resolves a real focus ring,
 *      the More sheet follows its own trigger in document order, and closing the sheet puts
 *      focus back on the button that opened it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createRawSnippet, mount, unmount, type Component } from 'svelte';
// The real stylesheet. Without it every `h-11` is inert and a height assertion measures
// nothing but the default line box — which would pass for the wrong reason.
import '../../../routes/layout.css';
import { NO_ACCESS, type AccessMap, type ModuleKey } from '$lib/core/modules/catalogue';
import { MOBILE_SLOTS, mobileNav } from './nav';
import MobileHeader from './MobileHeader.svelte';
import MobileNavComponent from './MobileNav.svelte';
import PrimaryAction from './PrimaryAction.svelte';

/** The design's minimum. Apple's HIG and the WCAG 2.2 target-size floor agree on it. */
const TOUCH_MINIMUM = 44;
const PHONE_WIDTH = 390;
/** The design's reference frame, and the height the `mobile` project runs Chromium at. */
const PHONE_HEIGHT = 844;

function owning(...keys: ModuleKey[]): AccessMap {
	return { ...NO_ACCESS, ...Object.fromEntries(keys.map((k) => [k, 'write' as const])) };
}

const THORNHILL = owning('quoting', 'invoicing', 'inventory');

let target: HTMLElement | null = null;
let instance: Record<string, unknown> | null = null;

/**
 * Generic over the component's own props, so a story-shaped typo — a renamed prop, a
 * missing one — fails the type check rather than rendering an empty box that then passes a
 * height assertion for the wrong reason.
 */
function render<P extends Record<string, unknown>>(component: Component<P>, props: P): HTMLElement {
	target = document.createElement('div');
	// The frame the shell actually gives these components: full width, nothing wider.
	target.style.width = `${PHONE_WIDTH}px`;
	document.body.style.margin = '0';
	document.body.append(target);
	instance = mount(component, { target, props }) as Record<string, unknown>;
	return target;
}

/**
 * The primary action in the frame it actually lives in: last child of the ONE element that
 * scrolls, under a list long enough to need scrolling.
 *
 * The scroller FILLS THE VIEWPORT, as `<main>` does in the shell, and that detail is the
 * test. In a short scroller floating in a tall page a `fixed` button parks at the bottom of
 * the WINDOW, hundreds of pixels clear of the list, and an overlap assertion passes on the
 * broken thing. Full height is the only geometry where `fixed` and `sticky` disagree.
 */
const ROW_COUNT = 40;
const ROW_HEIGHT = 40;

function mountInScroller(): HTMLElement {
	target = document.createElement('div');
	target.style.cssText = `width:${PHONE_WIDTH}px;height:${PHONE_HEIGHT}px;overflow-y:auto`;
	document.body.style.margin = '0';
	document.body.append(target);

	for (let i = 0; i < ROW_COUNT; i++) {
		const row = document.createElement('div');
		row.style.height = `${ROW_HEIGHT}px`;
		if (i === ROW_COUNT - 1) row.dataset.lastRow = '';
		target.append(row);
	}

	instance = mount(PrimaryAction, {
		target,
		props: {
			href: '/invoicing/new',
			children: createRawSnippet(() => ({ render: () => '<span>Send invoice</span>' }))
		}
	}) as Record<string, unknown>;
	return target;
}

afterEach(() => {
	if (instance) unmount(instance);
	target?.remove();
	instance = null;
	target = null;
});

/** Everything a thumb can hit. */
function targets(root: HTMLElement): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>('a, button')];
}

describe('bottom navigation', () => {
	it('is five items wide and never more', () => {
		const root = render(MobileNavComponent, { nav: mobileNav(THORNHILL), pathname: '/' });
		expect(targets(root)).toHaveLength(MOBILE_SLOTS);
	});

	it('stays five items wide when the business owns everything', () => {
		const everything = owning(
			'quoting',
			'invoicing',
			'bookings',
			'inventory',
			'scheduling',
			'payroll'
		);
		const root = render(MobileNavComponent, { nav: mobileNav(everything), pathname: '/' });
		expect(targets(root)).toHaveLength(MOBILE_SLOTS);
	});

	it('gives every item at least 44px', () => {
		const root = render(MobileNavComponent, { nav: mobileNav(THORNHILL), pathname: '/' });

		for (const element of targets(root)) {
			expect(element.getBoundingClientRect().height).toBeGreaterThanOrEqual(TOUCH_MINIMUM);
		}
	});

	it('does not overflow 390px', () => {
		const root = render(MobileNavComponent, { nav: mobileNav(THORNHILL), pathname: '/' });
		expect(root.scrollWidth).toBeLessThanOrEqual(PHONE_WIDTH);
	});
});

describe('mobile header', () => {
	const props = {
		tradingName: 'Thornhill Joinery',
		initials: 'TJ',
		userInitials: 'BC',
		userName: 'Bongani Cele',
		aiEnabled: true,
		onSearch: () => {}
	};

	it('gives the search field a 44px target, not a 34px hint', () => {
		const root = render(MobileHeader, props);
		const field = root.querySelector('button');

		expect(field).not.toBeNull();
		expect(field!.getBoundingClientRect().height).toBeGreaterThanOrEqual(TOUCH_MINIMUM);
	});

	it('removes the field when AI is off, and nothing else', () => {
		const root = render(MobileHeader, { ...props, aiEnabled: false });

		expect(root.querySelector('button')).toBeNull();
		expect(root.textContent).toContain('Thornhill Joinery');
	});

	it('does not overflow 390px, even with a long business name', () => {
		const root = render(MobileHeader, {
			...props,
			tradingName: 'Thornhill Joinery and Bespoke Cabinetmaking Services'
		});

		expect(root.scrollWidth).toBeLessThanOrEqual(PHONE_WIDTH);
	});
});

describe('primary action', () => {
	it('is the design’s 50px, above the 44px floor', () => {
		const root = render(PrimaryAction, {
			href: '/invoicing/new',
			children: createRawSnippet(() => ({ render: () => '<span>Send invoice</span>' }))
		});

		const button = root.querySelector('a, button');
		expect(button).not.toBeNull();
		expect(button!.getBoundingClientRect().height).toBeGreaterThanOrEqual(TOUCH_MINIMUM);
	});

	/**
	 * The criterion the component's `sticky` exists to satisfy. A `fixed` button would pass
	 * every other assertion in this file and still sit on top of the last invoice in the list
	 * — which is the one you scrolled all that way to read.
	 *
	 * Scrolled to the very bottom, because that is the only position where the two can
	 * collide: anywhere above it the button is stuck to the viewport edge with more content
	 * still to come, and overlapping there is the point.
	 */
	it('comes to rest below the last row rather than over it', () => {
		const scroller = mountInScroller();
		scroller.scrollTop = scroller.scrollHeight;

		const lastRow = scroller.querySelector('[data-last-row]');
		const button = scroller.querySelector('a, button');
		expect(lastRow).not.toBeNull();
		expect(button).not.toBeNull();

		// A pixel of slack: sub-pixel layout makes an exact comparison a flake waiting to
		// happen, and one pixel of overlap is not a row anyone would call obscured. The
		// failure this guards against is the button's full 50px sitting over the row.
		expect(lastRow!.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			button!.getBoundingClientRect().top + 1
		);
	});
});

/**
 * THE KEYBOARD, which is the half of the bottom nav a thumb never exercises.
 *
 * This lives here rather than in a story because a focus ring is a fact about the CASCADE,
 * not about a class string — the same argument the header above makes about `h-11`. It is
 * also not something Storybook's a11y addon can cover: axe checks names, roles and colour
 * contrast, and has no opinion at all about whether an element shows a focus indicator or
 * where it sits in the tab order. MobileNav already appears in two stories, so the addon
 * already sees it; these three assertions are what the addon cannot make.
 *
 * On what is asserted about the ring, and what deliberately is NOT: `layout.css` applies
 * `* { @apply border-border outline-ring/50 }` in its base layer, so EVERY element in the
 * document already resolves a non-empty `outlineColor`. Asserting on the colour would
 * therefore have passed identically before and after the rings were added — a test that
 * proves nothing while looking like it proves everything. `outlineWidth` discriminates,
 * because the base layer sets no width and the UA default for a focused control is `auto`
 * rather than 2px.
 */
describe('bottom navigation — keyboard', () => {
	/** Every slot in the bar: the five links plus More. */
	function bar(root: HTMLElement): HTMLElement[] {
		return [...root.querySelectorAll<HTMLElement>('ul a, ul button')];
	}

	function moreTrigger(root: HTMLElement): HTMLElement {
		const trigger = bar(root).at(-1);
		if (!trigger) throw new Error('No More button rendered');
		return trigger;
	}

	it('shows the design’s 2px ring on every slot under real keyboard focus', async () => {
		const root = render(MobileNavComponent, { nav: mobileNav(THORNHILL), pathname: '/' });
		const slots = bar(root);
		expect(slots).toHaveLength(MOBILE_SLOTS);

		for (const slot of slots) {
			// Driven with a real Tab rather than `slot.focus()`, so the browser's own
			// focus-visible heuristic is what decides — the same decision it makes for a
			// person on a keyboard. The `:focus-visible` check is a loud guard: if the
			// modality rule ever changes, this fails visibly instead of the width assertion
			// below passing against an unfocused element.
			await userEvent.tab();
			expect(document.activeElement, 'tab order skipped a slot').toBe(slot);
			expect(slot.matches(':focus-visible'), 'focused but not focus-visible').toBe(true);

			const style = getComputedStyle(slot);
			expect(style.outlineStyle, 'no outline style').not.toBe('none');
			expect(style.outlineWidth, 'not the design’s 2px ring').toBe('2px');
		}
	});

	it('puts the More sheet after its own trigger in document order', async () => {
		// Stated as the invariant rather than as a keystroke, because that is what actually
		// governs forward-Tab. Declared before the trigger — which is where the sheet used to
		// live — Tab from More left the nav entirely and the rows were reachable only by
		// shift-Tabbing back through all five links.
		const root = render(MobileNavComponent, { nav: mobileNav(THORNHILL), pathname: '/' });
		const trigger = moreTrigger(root);

		trigger.click();
		await Promise.resolve();

		const sheetRow = root.querySelector<HTMLElement>('nav > div a');
		expect(sheetRow, 'the sheet rendered no rows').not.toBeNull();

		const position = trigger.compareDocumentPosition(sheetRow!);
		expect(position & Node.DOCUMENT_POSITION_FOLLOWING, 'the sheet precedes its trigger').toBe(
			Node.DOCUMENT_POSITION_FOLLOWING
		);
	});

	it('returns focus to More when Escape closes the sheet', async () => {
		// Everything inside the sheet is destroyed when it closes, so without an explicit
		// restore the browser drops focus on <body> and the next Tab starts over from the top
		// of the document.
		const root = render(MobileNavComponent, { nav: mobileNav(THORNHILL), pathname: '/' });
		const trigger = moreTrigger(root);

		trigger.focus();
		trigger.click();
		await Promise.resolve();

		await userEvent.keyboard('{Escape}');

		expect(root.querySelector('nav > div')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});
});
