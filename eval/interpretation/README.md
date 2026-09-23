# Interpretation fixtures

Replay one coherent taxpayer through the deterministic report seam (`buildReport`) and assert
what the pipeline makes of it: which rows land in which category, with which amounts, and **how
many**. Runs under `npm test`. No API key, no network.

The pipeline between extraction and the report has good per-module coverage and still lost a
real position (#99), because no test compared how many rows went in with how many came out.
This tier closes that gap. The perception eval (`eval/fixtures/`, ADR 0010) measures
_reading_; an Interpretation fixture skips reading and measures _interpretation_.

## Layout

```
eval/interpretation/
├── README.md
└── aangifte-2023/
    ├── scenario.json                      # which documents, in which order
    ├── jaaropgave-ing-partner-a.json      # hand-written: shapes the perception set lacks
    ├── jaaropgave-ing-partner-b.json
    ├── jaaropgave-asn-themabeleggen.json
    └── expected.json                      # the recorded report summary
```

### `scenario.json`

- `taxReturn.fixture` — a perception fixture whose `expected.json` is a `TaxReturnData`.
- `taxReturn.extraEntries` — aangifte rows the perception PDF does not print. Appended to the
  fixture's entries. Use this, not an edit to the perception `expected.json`: that file must
  keep matching its PDF.
- `bewijsstukken` — `{ "fixture": "<name>" }` reuses `eval/fixtures/<name>/expected.json`;
  `{ "file": "<name>.json" }` reads a document from the scenario directory. A document with an
  `accounts` array is a jaaropgave; one with a `documentKind` is a property bewijsstuk (or
  `unrecognized`).

The order is arbitrary but fixed: it is the order handed to `buildReport`, and `reconcile()`
depends on it (#180). The summary sorts rows, so a pure order change does not fail the replay;
a change in _which_ copy of a duplicated account matches does.

### `expected.json`

`summarizeReport` (`lib/eval/interpretation.ts`) output:

- `covered`, `amountMismatches`, `missingStatement`, `notFilledIn`, `propertyStatements` —
  `{ count, rows }`, every row with its rekeningnummer and amounts
- `findings` — `{ count, byKind }`
- `rulePoints` — `{ count, accountNumbers }`

No titles, details or explanations: those are language-dependent, and a translation edit must
not fail the replay. Replay uses `nl`.

## The `aangifte-2023` scenario

The `aangifte-2023` aangifte, all seven `jaaropgave-*` fixtures and the three property
fixtures, plus the #99 shape, added by hand:

- **Two components on one account.** An ASN Themabeleggen jaaropgave with a geldrekening
  (`bank.balance` 17630) and a beleggingen (`broker.balance` 2140) component, and a second
  aangifte row with the same field and the same rekeningnummer. Both rows must be covered —
  this is the exact collision that lost a row in #99.
- **One account in two jaaropgaves.** Both fiscal partners' ING jaaropgaves list the joint
  account `NL22INGB0673345785`, written differently. The aangifte row is covered once; the
  second copy is not reported as not filled in.

## Known-wrong marker

A row the pipeline gets wrong today is recorded as-is, with a marker linking the issue:

```json
{ "field": "DEGIRO", "…": "…", "knownWrong": { "issue": 182, "note": "…" } }
```

The marker changes no assertion — the replay strips it and compares the row like any other.
So the suite stays green, the bug stays visible, and the fix must update the row and remove
the marker. Never edit an input document to hide wrong behaviour.

## What the suite asserts

`lib/eval/interpretation-replay.test.ts`:

1. Every scenario replays to its `expected.json`.
2. Removing any single input row (aangifte entry, jaaropgave account, property statement)
   changes the summary. Rows the report is designed not to show (a calculated field, a
   mortgage repaid mid-year, the second copy of a joint account) are listed by name, with the
   reason, and must leave the summary unchanged.
3. The #99 shape explicitly: both ASN components survive, and the joint account is covered
   exactly once.

## Updating `expected.json`

When a change moves a row on purpose, update `expected.json` by hand and explain the change in
the PR. Keep every existing `knownWrong` marker whose row did not change. A marker whose row
the change fixes is removed with it.

## Adding a scenario

1. Create `eval/interpretation/<name>/scenario.json`. Reuse perception fixtures where they fit;
   add hand-written documents for the rest. Synthetic data only.
2. Write `expected.json` from current behaviour, then review every row. Mark a wrong row with
   `knownWrong` and open an issue for it.
3. The replay picks the directory up automatically. The row-removal test (2 above) is
   per-scenario; add it for the new scenario if it has rows worth guarding.
