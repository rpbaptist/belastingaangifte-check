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
    └── aangifte-2023/
        ├── source.html      # hand-authored, every text run absolutely positioned
        ├── aangifte-2023.pdf # rendered from source.html (committed)
        └── expected.json     # the known-correct TaxReturnData for that PDF
```

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

## Re-rendering the PDFs

The PDFs are committed, but you can re-render them from source:

```
npm run eval:render
```

This prints each `eval/fixtures/<name>/source.html` to `eval/fixtures/<name>/<name>.pdf`.

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
