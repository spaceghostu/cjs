import type { Preview } from '@storybook/sveltekit';
import '../src/routes/layout.css';

/**
 * Theme switching for stories.
 *
 * The app applies `.light` to <html> via mode-watcher; there is no mode-watcher inside a
 * story, so this decorator does the same thing by hand. See the theme-switching note at
 * the top of `src/routes/layout.css` for why light is the class and dark is the absence
 * of one.
 *
 * `vite.config.ts` runs the story suite twice — `stories-light` on these defaults and
 * `stories-dark` with `initialGlobals: { theme: 'dark' }` — so every story is asserted in
 * both themes.
 */
type Theme = 'light' | 'dark';

function applyTheme(theme: Theme): void {
	const root = document.documentElement;
	root.classList.toggle('light', theme === 'light');
	root.classList.toggle('dark', theme === 'dark');
	root.style.colorScheme = theme;

	// A story iframe body is white and transparent by default, which makes every dark
	// screenshot and every a11y contrast check wrong about what is actually behind the
	// component.
	document.body.style.backgroundColor = 'var(--surface-base)';
	document.body.style.color = 'var(--text-primary)';
}

const preview: Preview = {
	initialGlobals: {
		theme: 'light'
	},

	globalTypes: {
		theme: {
			description: 'Colour theme',
			toolbar: {
				title: 'Theme',
				icon: 'contrast',
				items: [
					{ value: 'light', title: 'Light' },
					{ value: 'dark', title: 'Dark' }
				],
				dynamicTitle: true
			}
		}
	},

	decorators: [
		(story, context) => {
			applyTheme(context.globals.theme === 'dark' ? 'dark' : 'light');
			return story();
		}
	],

	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i
			}
		},

		a11y: {
			// A violation fails the run, in both themes. This is stricter than the shipped
			// default ('todo', which only reports) and it is the point: contrast, labels and
			// focus order are cheap to hold and expensive to retrofit.
			//
			// T27's sweep of the flows no story can reach is done — shell, Home, quoting and
			// invoicing — and what it found is recorded where it was found: the token floors
			// in `token-contrast.test.ts`, the naming contract in `layout.css`, the bottom
			// nav's keyboard behaviour in `shell.mobile.spec.ts`, and the two colour-alone
			// verdicts in the components carrying the dots. Everything a story CAN reach
			// stays held here, by this line.
			//
			// Worth knowing about its limits, because they are the reason those other files
			// exist: axe checks names, roles, structure and colour contrast. It has no
			// opinion on whether a focus ring actually renders, or on tab order — which is
			// exactly where this codebase's real defects turned out to be.
			test: 'error'
		}
	}
};

export default preview;
