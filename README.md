# CJs

A modular business platform — quoting, invoicing, inventory, jobs — built on SvelteKit with
Svelte 5 runes, drizzle-orm on Postgres (Neon, RLS tenancy in one database), Tailwind v4 and
shadcn-svelte. Package manager is [bun](https://bun.sh).

## Developing

```sh
bun install
bun run dev          # start the dev server
```

## Testing

```sh
bun run check        # svelte-check, must be clean
bun run lint         # prettier + eslint (bun run format fixes prettier)
bun run test         # the unit project — needs a configured .env.test (cjs_app role)
bun run test:stories # every Storybook story, light and dark, axe at error severity
bun run test:mobile  # the *.mobile.spec.ts suites: 44px floors and 390px layout facts
```

## Accessibility gate

Every `*.stories.svelte` file is executed by `bun run test:stories` in BOTH themes with axe
at error severity — a story with any violation fails the suite. The mechanism and its
recorded limits live in `.storybook/preview.ts` (`a11y.test: 'error'`); the full WHY prose
stays there rather than here.

New components must ship Storybook stories (client decision Q14, 29 Aug 2026) — which is how
they enter the gate: a component without a story is a component axe never sees.

The 44px touch floors and the no-sideways-scroll facts at 390px are asserted by the
`*.mobile.spec.ts` files under `bun run test:mobile`, in a real Chromium, against the real
stylesheet.

Both suites run in CI (`.github/workflows/ci.yml`) with no secrets and no database.

## Recreating this project

To recreate this project with the same configuration:

```sh
bun x sv@0.16.6 create --template minimal --types ts --add prettier eslint tailwindcss="plugins:typography,forms" drizzle="database:postgresql+postgresql:neon" better-auth="demo:password" storybook mcp="ide:claude-code+setup:remote" --install bun cjs
```
