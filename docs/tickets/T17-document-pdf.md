# T17 — Document preview and PDF

**Depends on:** T01 (`--paper-*`), T03, T15
**Blocks:** T18, T21.

## Context

One renderer serves three places: the live preview in the quote editor, the document panel
in the invoice detail, and the PDF the client receives. They must be the same code, or they
will drift, and the client will receive something the business never saw.

The design specifies the paper precisely, and it is **always light** — it is what a client
opens or prints, so it does not follow the interface theme.

## Scope

### Paper tokens

| Token                | Value     | Role              |
| -------------------- | --------- | ----------------- |
| `--paper-bg`         | `#FBFBF9` | Sheet             |
| `--paper-ink`        | `#1A1A1A` | Primary text      |
| `--paper-ink-muted`  | `#7A7A76` | Labels, footnotes |
| `--paper-rule`       | `#E4E2DC` | Section rules     |
| `--paper-rule-light` | `#EFEDE7` | Line-item rules   |

Sheet padding `34px 32px`, radius `8px` on screen.

### Structure

**Masthead.** Trading name at 14/600 with `0.14em` tracking, uppercase — "THORNHILL
JOINERY". Beneath, at 11px with `1.6` line-height: street address, then VAT number and
phone. Right-aligned: the document type at 11px with `0.1em` tracking — `QUOTE` or **`TAX
INVOICE`** — and the number in mono at 13px.

`TAX INVOICE` is not a label choice. A South African tax invoice has statutory content
requirements, and the wording is part of them.

**Parties.** Above a `--paper-rule`: "Prepared for" / "Billed to" with the customer name at
13px and the contact or address at 11px. Right: "Valid until" or "Due" with the date.

**Lines.** Grid `1fr 40px 88px` (quote) or `1fr 40px 92px` (invoice) — DESCRIPTION, QTY,
AMOUNT at 10px `0.08em` uppercase. Each line: description at 12px `1.5` line-height, then
qty and amount in mono, right-aligned, **two decimals**.

The document description is fuller than the editor's — the editor shows "Solid oak kitchen
island top, 2400 × 900", the document shows "…, 40mm European oak, oiled finish". Model both.

**Totals.** Right-aligned stack: "Before VAT", "VAT 15%", then above a `--paper-rule`,
"Total" / "Amount due" at 16px mono.

**Footer.** Terms at 10px `1.7` line-height — quotes carry "50% deposit to begin · balance
on completion / Banking details on acceptance"; invoices carry banking details and a thank
you. Right: "Page 1 of 1".

### PDF

Server-rendered, from the same component. Must be byte-stable for the same input — a
regenerated PDF of an unchanged document should not differ, or the audit trail is noise.

No PDF library is in `package.json` yet. Evaluate before choosing; the constraints are
South African paper sizing, embedded Inter and JetBrains Mono, and no headless browser at
runtime if it can be avoided.

## Out of scope

Emailing (T18). Per-tenant logo upload — the design says "Your branding, applied" but shows
only a wordmark; treat a logo as a later addition.

## Acceptance criteria

- [ ] One renderer produces the editor preview, the detail panel and the PDF.
- [ ] Paper stays light in dark theme, everywhere it appears.
- [ ] Invoices render `TAX INVOICE` and carry the statutory fields.
- [ ] Amounts show two decimals; numerals are mono and tabular; columns align.
- [ ] Regenerating an unchanged document produces an identical PDF.
- [ ] Fonts are embedded; the PDF renders correctly with no system fonts available.
- [ ] Golden-file tests for the design's two worked documents (QT-1043, INV-1042).
- [ ] `bun run check` clean.

## Files

- `src/lib/components/document/**`
- `src/lib/server/core/pdf.ts`
- `src/routes/(app)/documents/[id]/pdf/+server.ts`
- golden fixtures + tests
