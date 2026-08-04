/**
 * THE PHONE ASSERTIONS.
 *
 * Runs in a real Chromium at 390 × 844 — the design's reference frame — under the `mobile`
 * Vitest project. Two of the three things asserted here cannot be checked any other way:
 * a computed height and a scrollWidth are facts about layout, and a unit test that asserted
 * the CLASS `h-11` would pass while a parent's `line-height` quietly made the row 38px.
 *
 * The four:
 *   1. Every touch target is at least 44px.
 *   2. Nothing overflows 390px horizontally.
 *   3. The bottom nav renders five items and no more, whatever the business owns.
 *   4. The primary action comes to rest below the last row, never over it.
 */
import { afterEach, describe, expect, it } from 'vitest';
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
