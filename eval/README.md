# Perception eval harness

Measures whether a change to an **extraction** prompt made reading a document better or
worse, instead of eyeballing a cached analysis. Every accuracy fix in this repo's history was
verified by hand; ADRs 0002 and 0004 exist to end that practice, and #100 deletes prompt
rules — deleting them without a number repeats it. This harness produces the number.

See [ADR 0010](../docs/adr/0010-perception-eval-harness.md) for the design and rationale.

## What's here

```
eval/
├── README.md
└── fixtures/
    ├── aangifte-2023/
    │   ├── source.html      # hand-authored, every text run absolutely positioned
    │   ├── aangifte-2023.pdf # rendered from source.html (committed)
    │   └── expected.json     # the known-correct TaxReturnData for that PDF
    ├── notarisafrekening-2023/
    ├── woz-beschikking-2023/
    ├── makelaarsnota-2023/
    │   ├── source.html      # same positioned-run rule, no table markup
    │   ├── <name>.pdf        # rendered from source.html
    │   └── expected.json     # the known-correct PropertyStatementData for that PDF
    ├── jaaropgave-rabobank-multi/
    ├── jaaropgave-broker-cash-portfolio/
    ├── jaaropgave-degiro-masked/
    ├── jaaropgave-employer-nl/
    ├── jaaropgave-employer-en/
    ├── jaaropgave-mortgage-repaid/
    └── jaaropgave-two-balance-columns/
        ├── source.html      # same positioned-run rule, no table markup
        ├── <name>.pdf        # rendered from source.html
        └── expected.json     # the known-correct AnnualStatementData for that PDF
```

A fixture whose `expected.json` has an `amounts` array (the three property fixtures) is a
`PropertyStatementData` fixture; one with an `accounts` array (the seven `jaaropgave-*`
fixtures) is an `AnnualStatementData` fixture — both run through `extractStatement`. One with
an `entries` array (`aangifte-2023`) is a `TaxReturnData` fixture and runs through
`extractTaxReturn`. The runner (`scripts/eval/run.ts`) picks the right extractor and diff
(`lib/eval/diff.ts`, `lib/eval/annual-statement-diff.ts`) automatically by inspecting
`expected.json` — this is the "second diff shape" ADR 0010 anticipated when extraction grew
beyond the aangifte.

Fixtures are **synthetic** — every name, BSN, IBAN and amount is invented, so the expected
output is known exactly and no real financial data is involved.

### No tables, on purpose

Fixtures use **no table markup**. Every run of text is an absolutely positioned `<div>`.
A table printed to PDF produces a clean text layer where columns are genuinely delimited;
real financial PDFs place text at coordinates and columns exist only to the eye — which is why
the parser in #97 failed. A table-based fixture would pass while real documents keep failing,
so it is prohibited.

### The `aangifte-2023` fixture

One document that exercises the expensive misreads at once (this is the document where a
misread costs the most):

- **A wrapped identifier** — the ING account's IBAN breaks across two lines and its amount
  sits on the continuation line, not next to the account name.
- **Two rows sharing a label** — two employers both under `Loon in Nederland`, which must
  never be merged into one row.
- **Enough rows to span multiple pages** — Box 3 runs across three pages, the savings list
  continues past a page break, and the final row is pinned to the bottom of the last page, so
  stopping early misses it.

It also folds in a broker identifier spread across "columns" (DEGIRO) and a dividend
sub-entry that must not be collapsed into the balance above it.

### The property bewijsstuk fixtures (#109)

`notarisafrekening-2023`, `woz-beschikking-2023` and `makelaarsnota-2023` exercise the
extraction prompt's document-kind classification and the closed amount-kind vocabulary
(ADR 0002 amendment) rather than page-layout hazards:

- Each carries an amount whose label fits none of the five closed kinds (`Kadasterkosten`,
  `Advertentiekosten Funda`) — extraction must report `kind: null` with the raw label
  preserved, never invent a new key.
- `notarisafrekening-2023` also prints a payment-reference IBAN in prose ("Uitbetaling
  verkoopopbrengst … op rekeningnummer …") — the one hazard specific to this kind, since it is
  the exact shape of text that used to get misread as the document's account number before
  #109. `PropertyStatementData` has no `accountNumber` field at all, so a correct extraction
  cannot carry one regardless.

### The jaaropgave fixtures (#106)

Seven layouts, each tied to an observed extraction defect for `AnnualStatementData`, all
belonging to one taxpayer (J. Fictief / johndoe) whose bewijsstukken reconcile against
`aangifte-2023` — the Rabobank savings balance, both employers' wages, and the ABN AMRO
savings balance are the same figures declared there:

- `jaaropgave-rabobank-multi` — one document reporting both a savings account and two
  hypotheken; a single document-level `institutionType` can't describe every account it
  contains.
- `jaaropgave-broker-cash-portfolio` — a broker's cash and portfolio balance at the same date
  on the same account, which must stay two amount fields, not one merged number or two
  accounts.
- `jaaropgave-degiro-masked` — DEGIRO's beleggingsrekening identifier arrives already masked
  by the issuer (`******ist`); the correct reading copies the mask verbatim.
- `jaaropgave-employer-nl` / `jaaropgave-employer-en` — the same jaaropgave loonheffingen
  shape with Dutch and English labels (some payroll providers issue an English statement for
  expat staff); the numeral convention stays Dutch either way. Together they cover the two
  employers `aangifte-2023` deliberately keeps under one shared `Loon in Nederland` label.
- `jaaropgave-mortgage-repaid` — a mortgage repaid mid-year via the home sale
  `notarisafrekening-2023` settles, reporting the year-end debt as an explicit "Nihil" rather
  than a numeral zero.
- `jaaropgave-two-balance-columns` — start-of-year and end-of-year balances printed side by
  side; Box 3 uses the 1 January peildatum, so the correct reading takes the left column, not
  the right one or an average of the two.

## Interpretation fixtures

The `expected.json` files here also feed the **Interpretation fixture** replay under
`eval/interpretation/` (#104), which runs them through `buildReport` under `npm test`. Changing
an `expected.json` here can therefore fail that replay; see
[`eval/interpretation/README.md`](interpretation/README.md).

## Re-rendering the PDFs

The PDFs are committed, but you can re-render them from source:

```
npm run eval:render
```

This prints each `eval/fixtures/<name>/source.html` to `eval/fixtures/<name>/<name>.pdf`.

> **Status:** the three property-bewijsstuk fixtures above currently ship `source.html` and
> `expected.json` only — their PDFs have not been rendered because no WeasyPrint-capable
> environment was available when they were authored. Run `npm run eval:render` on a machine
> with WeasyPrint installed and commit the resulting `<name>.pdf` files before relying on
> `npm run eval` for these three; `aangifte-2023.pdf` and the seven `jaaropgave-*.pdf` files
> are unaffected and already committed.

**Requires [WeasyPrint](https://weasyprint.org/)** (a standalone HTML→PDF renderer). It is not
an npm dependency and does not run in CI or on build. Install it once, e.g.:

```
pipx install weasyprint          # recommended
# or: pip install --user weasyprint
```

WeasyPrint lays every absolutely-positioned run at its coordinate, so the text layer carries
no column delimiters — the property that makes these fixtures resemble real Belastingdienst
PDFs.

## Running the eval

```
ANTHROPIC_API_KEY=... npm run eval                    # all fixtures
ANTHROPIC_API_KEY=... npm run eval -- aangifte-2023   # one fixture
```

The runner extracts each fixture PDF with the current extraction prompt, diffs the result
against `expected.json`, and prints per-field misreads (wrong amount, wrong account, dropped
or hallucinated rows). Account-number spacing and field-label casing are normalised away, so
only genuine misreads are scored.

It is **opt-in**: it calls the Anthropic API (a real cost), requires `ANTHROPIC_API_KEY`, and
is never part of `npm test`. It exits non-zero if any fixture has a mismatch, so it doubles as
a pass/fail gate when comparing a prompt change against the recorded baseline.

The diff logic itself (`lib/eval/diff.ts`) is pure and unit-tested, so the scoring rules are
covered by CI even though the API-calling runner is not.

## Baseline

The whole point is a number to measure #100's prompt-rule deletions against. Record the
baseline result of `npm run eval -- aangifte-2023` against current code as a comment on the
originating issue before closing it. Because the runner needs an API key it is run outside the
sandbox/CI, on a machine with a key.

The seven `jaaropgave-*` fixtures need the same treatment for #106: record
`npm run eval -- jaaropgave-rabobank-multi jaaropgave-broker-cash-portfolio jaaropgave-degiro-masked jaaropgave-employer-nl jaaropgave-employer-en jaaropgave-mortgage-repaid jaaropgave-two-balance-columns`
(or a plain `npm run eval` for the whole set) against current code as a comment on #106 before
closing it.
