# T06 — Stub screens: sign-in, onboarding, settings, export

**Depends on:** T01, T02, T05
**Blocks:** T07 (you cannot reach the shell without signing in).

## Context

The design covers the shell and three modules. It does **not** cover four things the
product cannot function without:

- **Sign-in.** `auth.ts` already wires email/password, magic link, Google and Microsoft.
- **Onboarding.** A signed-in user with no business has nowhere to go. Someone has to
  create `core_business` and become its `owner`.
- **Settings.** Linked from the sidebar footer in `AppSidebar.dc.html`.
- **Export your data.** Also in the sidebar footer, and load-bearing for the product's
  promise — the design says "Yours to take, any time" and "Export CSV" on the invoice list.

Agreed approach: **stub them.** Minimal, functional, built from T01/T02 so they are not
ugly, but not designed. They get a proper design pass later.

## Scope

### Sign-in

Email + magic link as the primary path, Google and Microsoft when configured — `env.ts`
already exposes a `features` object so a provider with no credentials must not render a
dead button. Password sign-in is enabled in `auth.ts`; include it.

Magic link delivery already has a decided behaviour in `mail.ts`: printed to the console in
development, **refused in production** when SMTP is unconfigured, never silently dropped.
The UI must reflect a refusal honestly rather than claiming a mail was sent.

### Onboarding

One screen: business name, VAT number (optional — not every small business is registered),
address, and brand colour from T01's four options. Creates `core_business` and a
`core_member` row with role `owner`. This is the only path that mints a business.

### Settings

A shell for later. Business details, the brand colour, members and their roles, and a
placeholder for billing that T12 fills in.

### Export

A single "export everything" action producing a zip of CSVs per table the business owns.
`fflate` is already a dependency. Must respect RLS — the export runs through `Ctx` like
everything else, so it can only ever contain the acting business's rows.

## Out of scope

Anything designed. Invitations and multi-user management beyond listing. Billing UI (T12).
Per-module export formats — one generic CSV per table is enough.

## Acceptance criteria

- [ ] A new user can sign in, create a business, and land on the shell.
- [ ] Unconfigured providers render nothing — no dead buttons.
- [ ] A magic link that cannot be delivered produces an honest error, never a false
      "check your email".
- [ ] A signed-in user with no business is redirected to onboarding from every route.
- [ ] Export produces a zip whose contents are provably scoped to one business.
- [ ] Every screen uses T01 tokens and T02 primitives; no raw hex, no bespoke controls.
- [ ] These four routes are marked in code as stubs awaiting design.
- [ ] `bun run check` clean.

## Files

- `src/routes/(auth)/**`
- `src/routes/(app)/onboarding/**`
- `src/routes/(app)/settings/**`
- `src/lib/server/core/export.ts`
