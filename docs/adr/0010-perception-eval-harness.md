# ADR 0010: Perception eval harness with positioned-HTML fixtures

## Status

Accepted

## Context

Whether a change to an **extraction** prompt made a document read better or worse has always
been answered by opening a cached analysis and looking at it. Every accuracy fix in this
repo's history was verified that way — the exact practice ADRs 0002 and 0004 were written to
end for the matching and categorization stages. #100 deletes extraction prompt rules, and
deleting a rule without a number to measure against repeats the pattern those ADRs closed.

The extraction step (`lib/extractor.ts`) reads a PDF sent as a native document block and
returns structured data. The failure modes that matter are perceptual: an identifier that
wraps mid-number, repeated row labels that get merged, and long documents truncated at a page
boundary (#97). A regression test for this needs real PDFs with those hazards and a known
correct answer.

## Decision

An opt-in eval harness under `eval/`, scored by a pure diff in `lib/eval/`.

- **Fixtures are synthetic, committed HTML → PDF.** Each fixture is `eval/fixtures/<name>/`
  with `source.html`, a rendered `<name>.pdf`, and `expected.json` (a `TaxReturnData`). Names,
  BSNs, IBANs and amounts are invented, so the expected output is known exactly and no real
  financial data is committed.
- **No table markup — every text run is absolutely positioned.** A table printed to PDF
  produces a clean, genuinely column-delimited text layer; real financial PDFs place text at
  coordinates and columns exist only to the eye, which is why the #97 parser failed. A
  table-based fixture would pass while real documents keep failing, so tables are prohibited.
- **The first fixture is `aangifte-2023`**, the document where a misread is most expensive. It
  exercises a wrapped IBAN (amount on the continuation line), two employers sharing one
  `Loon in Nederland` label, and a Box 3 list that spans three pages with the last row at the
  bottom of the final page — plus a multi-fragment broker identifier (DEGIRO) and a dividend
  sub-entry that must not collapse into its balance.
- **Rendering is a documented, manual command** (`npm run eval:render`) using WeasyPrint, a
  standalone HTML→PDF renderer that lays each positioned run at its coordinate. It is not an
  npm dependency and never runs in CI or on build.
- **The runner is opt-in** (`npm run eval`): it requires `ANTHROPIC_API_KEY`, calls the real
  API, is never part of `npm test`, and exits non-zero on any mismatch so it doubles as a
  pass/fail gate.
- **The scoring is a pure, unit-tested diff** (`lib/eval/diff.ts`). It normalises away
  differences that are not misreads (account-number spacing via `lib/account-normalizer`,
  field-label casing/whitespace) and reports the ones that are (wrong amount, wrong account,
  dropped/hallucinated rows). Keeping the diff in `lib/` means CI covers the scoring rules even
  though the API-calling runner does not run in CI.

## Alternatives considered

- **Keep eyeballing cached analyses**: rejected — this is exactly what ADRs 0002/0004 set out
  to end, and #100 needs a number, not a judgement call.
- **Table-based HTML fixtures**: rejected — they produce a delimited text layer that does not
  resemble the coordinate-placed text of real documents, so they would give false confidence.
- **Headless Chromium / Puppeteer for rendering**: viable but heavier (a browser download and
  its system libraries) for no gain here; WeasyPrint renders the same positioned text layer
  from the same HTML with a smaller, offline footprint. The fixtures are plain HTML, so the
  renderer can be swapped without touching them.
- **Generating the PDF's text layer directly (pdf-lib/pdfkit)**: rejected — it would move
  layout into imperative code and lose the readable HTML "source of truth" the acceptance
  criteria call for.
- **Running the eval in CI**: rejected — it costs money per run and depends on a live API and
  model behavior; CI stays deterministic and free. Only the pure diff is tested in CI.
- **Exact string comparison in the diff**: rejected — a wrapped IBAN legitimately rejoins with
  spaces and the model copies field labels with incidental casing, so exact comparison would
  score noise as regressions.

## Consequences

- New top-level `eval/` tree and two npm scripts (`eval:render`, `eval`). Neither is wired
  into CI; `eval:render` needs WeasyPrint installed locally.
- The baseline result against current code must be recorded on the originating issue before it
  closes; because the runner needs an API key it runs outside CI/sandbox.
- Adding a fixture is: author `source.html` (positioned runs only), write `expected.json`,
  `npm run eval:render`, commit all three. The runner and renderer discover fixtures by
  directory automatically.
- The diff currently covers `TaxReturnData` (aangifte). Extending it to jaaropgave extraction
  later means a second diff shape; the fixture/rendering/runner scaffolding is reusable as-is.

## Amendment (#109)

The second diff shape arrived for property bewijsstukken (notarisafrekening, WOZ-beschikking,
makelaarsnota) rather than jaaropgave, since #109 needed a perception baseline for those first.
`diffPropertyStatement` (`lib/eval/diff.ts`) matches amounts by `kind` — the closed vocabulary
that replaces rekeningnummer as these documents' identity (ADR 0002 amendment) — falling back
to label matching only when `kind` is null on both sides. `scripts/eval/run.ts` picks the diff
and extractor per fixture by inspecting `expected.json` (an `amounts` array means a property
fixture; `entries` means a tax-return fixture) rather than by filename convention, so the
scaffolding stays reusable for jaaropgave next. As with `aangifte-2023`, the three new
fixtures' PDFs still need `npm run eval:render` on a WeasyPrint-capable machine before their
baseline can be recorded — see `eval/README.md`.

## Amendment (#106)

The third diff shape covers jaaropgave (`AnnualStatementData`), the most common bewijsstuk
kind. `diffAnnualStatement` (`lib/eval/annual-statement-diff.ts`) matches accounts by
normalised rekeningnummer, falling back to closest total amount when the identifier itself is
the misread (e.g. a masked broker identifier read wrong), and then diffs each matched pair's
amount fields individually so a wrong balance on an otherwise-correct account is reported as a
misread, not a dropped-and-hallucinated pair. `scripts/eval/run.ts` extends its `expected.json`
sniff to a third case: an `accounts` array means a jaaropgave fixture. Seven fixtures
(`jaaropgave-rabobank-multi`, `jaaropgave-broker-cash-portfolio`, `jaaropgave-degiro-masked`,
`jaaropgave-employer-nl`, `jaaropgave-employer-en`, `jaaropgave-mortgage-repaid`,
`jaaropgave-two-balance-columns`), each tied to an observed extraction defect, share one
taxpayer whose balances and wages reconcile against `aangifte-2023` — unlike the property
fixtures, these also exercise the pipeline end-to-end rather than extraction alone. Their PDFs
are rendered and committed; the baseline still needs recording on #106 per `eval/README.md`.
