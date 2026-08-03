# T18 — Send and accept a quote

**Depends on:** T13, T16, T17
**Blocks:** T19 (quote → invoice).

## Context

The catalogue describes Quoting as "Branded quotes clients can accept online", so
acceptance is a client-facing surface outside the authenticated shell — the one part of the
product a person who is not a user ever sees.

The design shows the outcome of acceptance, not the client's screen: "Quote QT-1041 was
accepted by Waterkant Property Group", followed by the contextual add from T13.

## Scope

### Sending

"Send to client" transitions draft → sent, freezes a document snapshot, allocates the
number if not already allocated, and emails the customer contact with the PDF and a link.

`mail.ts` already has the decided failure behaviour: refused in production when SMTP is
unconfigured, never silently dropped. A quote that could not be sent must not show as sent.

### The client-facing page

Unauthenticated, reached by an unguessable token. Shows the document on paper (T17) and
offers Accept and Decline.

**Not designed.** Build it from the foundations, keep it to the document plus two actions,
and mark it as awaiting a design pass — same treatment as T06.

Security is the real work here: a long random token, no enumeration, rate limiting, no
tenant data beyond the single document, and an expiry that respects the quote's valid-until
date.

### Status and tracking

`sent` → `viewed` on first open → `accepted` / `declined` / `expired`. Each transition is an
event with a timestamp, feeding the activity timeline in T21 and the "Opened it twice"
copy in the design.

Expiry follows valid-until. An expired quote can still be viewed; it cannot be accepted.

### After acceptance

The business sees the acceptance, and — per the design — is offered the next step:

- **Invoicing owned:** "Turn it into an invoice", carrying lines, customer and totals
  across (T19).
- **Invoicing not owned:** the T13 contextual add, _including_ the escape hatch —
  "Or download the accepted quote as a PDF and invoice it yourself — no module needed."

That escape hatch must work. It is the design's proof that modules are not hostage-taking.

## Out of scope

Client-side payment. Counter-offers or negotiation. A designed client page.

## Acceptance criteria

- [ ] A failed send never leaves a quote marked sent.
- [ ] Accept tokens are unguessable, rate-limited, and expire with the quote.
- [ ] The client page exposes exactly one document and no other tenant data — verified by
      an integration test that attempts traversal.
- [ ] An expired quote is viewable but not acceptable.
- [ ] Every status transition writes a timestamped event.
- [ ] With Invoicing unowned, the PDF escape hatch is present and functional.
- [ ] The client page is marked as awaiting design.
- [ ] `bun run check` clean.

## Files

- `src/routes/q/[token]/**` (public)
- `src/lib/server/core/quoting/send.ts`
- `src/lib/server/core/quoting/accept.ts`
- `src/lib/server/core/mail.ts`
