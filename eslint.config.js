// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

/**
 * ── ARCHITECTURE ZONES ────────────────────────────────────────────────────────────────
 *
 * These rules are not style. They are the boundaries that make the architecture real: a
 * module author cannot reach the unscoped database handle, cannot import another module's
 * internals, cannot declare a float money column, and cannot construct Money by hand.
 *
 * Several point at directories that do not exist yet (they land in M2–M4). That is
 * deliberate — a boundary has to be in place before the first line of code inside it, not
 * retrofitted after something has already crossed it.
 */
const architectureZones = [
	// 1. Nobody outside db/ may touch the unscoped connection.
	//
	//    `ctx.ts` is on this list because it IS the exception the architecture describes:
	//    the one module that takes the unscoped handle, establishes tenancy, attribution and
	//    entitlement on it, and hands out a branded `Tx`. `hooks.server.ts` is here for the
	//    single query that must run before a tenant exists — resolving which business a
	//    signed-in person is acting for.
	{
		files: ['src/**/*.{ts,js,svelte}'],
		ignores: [
			'src/lib/server/core/db/**',
			'src/lib/server/core/ctx.ts',
			// The second door, and the only other one: the public quote page, for a client who
			// is not a user. Kept as its own file so the blast radius of the one
			// unauthenticated path in the product is visible in the file list.
			'src/lib/server/core/share.ts',
			'src/lib/server/auth.ts',
			'src/hooks.server.ts'
		],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['**/core/db/client', '$lib/server/core/db/client'],
							message:
								'Never import unsafeDb. Take a Ctx from withModule(event, key, intent) — the only route to the database, and what applies tenancy, entitlement and audit.'
						}
					]
				}
			]
		}
	},

	// 2. Modules import UI from $lib/ui only, so every module looks like the product.
	{
		files: ['src/lib/modules/**', 'src/routes/(app)/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['$lib/components/ui/*', '$lib/components/ui'],
							message:
								'Modules import UI from $lib/ui only. $lib/components/ui is vendored shadcn — wrap it in the design system first, so all twelve modules change together.'
						}
					]
				}
			]
		}
	},

	// 3. Modules never import each other except through <module>/public.ts.
	{
		files: ['src/lib/server/modules/**', 'src/lib/modules/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								'$lib/server/modules/*/queries',
								'$lib/server/modules/*/schema',
								'$lib/server/modules/*/effects',
								'$lib/server/modules/*/summary'
							],
							message:
								'Cross-module server imports go through <module>/public.ts only. Anything else couples two modules and breaks graceful degradation when one is not owned.'
						}
					]
				}
			]
		}
	},
	{
		// A module's own internals may import each other freely.
		files: [
			'src/lib/server/modules/*/public.ts',
			'src/lib/server/modules/*/queries.ts',
			'src/lib/server/modules/*/effects.ts',
			'src/lib/server/modules/*/summary.ts',
			'src/lib/server/modules/*/printable.ts',
			'src/lib/server/modules/*/firstrun.ts'
		],
		rules: { 'no-restricted-imports': 'off' }
	},

	// 4. Float column types cannot even be declared. Money is int8 cents.
	{
		files: ['src/lib/server/**/schema*.ts', 'src/lib/server/**/schema/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'drizzle-orm/pg-core',
							importNames: ['real', 'doublePrecision', 'numeric', 'decimal', 'money'],
							message:
								'Money is integer cents in int8. Use cents()/micros()/qtyE6()/ppm() from $lib/server/core/db/base.'
						}
					]
				}
			]
		}
	},

	// 5. Money constructors are reachable from three places only.
	{
		files: ['src/**/*.{ts,js,svelte}'],
		ignores: [
			'src/lib/core/money/**',
			'src/lib/server/core/db/map.ts',
			'src/**/*.test.ts',
			'src/**/*.spec.ts'
		],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['$lib/core/money/ctor', '**/core/money/ctor'],
							message:
								'Money is constructed by db/map.ts (from rows) or parseMoneyInput (from user input). There is no third way in.'
						}
					]
				}
			]
		}
	},

	// 6. Float-money smoke alarm. A BACKSTOP, not the lock — the lock is the type system.
	//    A legitimate non-money use needs an explicit eslint-disable with a reason.
	{
		files: ['src/**/*.{ts,js,svelte}'],
		ignores: ['src/lib/core/money/**'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: "CallExpression[callee.name='parseFloat']",
					message: 'Money is integer cents. Use parseMoneyInput from $lib/core/money/parse.'
				},
				{
					selector: "MemberExpression[property.name='toFixed']",
					message: 'Use formatZar()/formatQty() from $lib/core/money/format.'
				},
				{
					selector:
						"MemberExpression[object.name='Math'][property.name=/^(round|floor|ceil|trunc)$/]",
					message:
						'Rounding money goes through roundDiv from $lib/core/money/math — the single rounding function in this codebase. For genuinely non-money maths, disable this rule on the line with a reason.'
				}
			]
		}
	},

	// 7. Only the billing adapter may import a payment provider SDK.
	{
		files: ['src/**/*.{ts,js,svelte}'],
		ignores: ['src/lib/server/core/billing/adapters/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{ name: 'stripe', message: 'Provider SDKs live inside their adapter.' },
						{ name: 'paystack-sdk', message: 'Provider SDKs live inside their adapter.' },
						{ name: '@paystack/inline-js', message: 'Provider SDKs live inside their adapter.' }
					]
				}
			]
		}
	},

	// 8. The system principal is for background jobs only. It runs without a user and
	//    without entitlement checks, so its blast radius is bounded by this list rather
	//    than by convention.
	{
		files: ['src/**/*.{ts,js,svelte}'],
		ignores: [
			'src/lib/server/core/system.ts',
			'src/lib/server/core/sweeper.ts',
			'src/lib/server/core/billing/reconciler.ts',
			'src/lib/server/core/export-cron.ts',
			'src/routes/api/billing/webhook/+server.ts',
			'src/**/*.test.ts'
		],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['$lib/server/core/system', '**/core/system'],
							message:
								'withSystem() runs without a user and without entitlement checks. It belongs to background jobs only — add the file to the allowlist in eslint.config.js if it genuinely is one.'
						}
					]
				}
			]
		}
	},

	// 9. Test fixtures connect as the DDL role and delete rows — two things the application
	//    must never do. They are useful enough to be tempting as a seeding shortcut, so the
	//    boundary is a rule rather than a comment.
	{
		files: ['src/**/*.{ts,js,svelte}'],
		ignores: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['$lib/server/core/db/fixtures', '**/core/db/fixtures', './fixtures'],
							message:
								'db/fixtures is test-only: it connects as the DDL role and deletes rows. Application code goes through withBusiness()/withModule().'
						}
					]
				}
			]
		}
	},

	// 10. Anti-dark-pattern: no countdowns anywhere near billing. The undo window shows a
	//     DATE, never a ticking clock. Manufactured urgency is off the table.
	{
		files: ['src/lib/server/core/billing/**', 'src/routes/(app)/settings/modules/**'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: "CallExpression[callee.name='setInterval']",
					message:
						'No timers in billing UI. A countdown is manufactured urgency — show the date the window closes.'
				}
			]
		}
	}
];

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{
		// Vendored shadcn-svelte primitives. Not ours to lint or to hold to our zones.
		ignores: ['src/lib/components/ui/**']
	},
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	storybook.configs['flat/recommended'],
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	...architectureZones
);
