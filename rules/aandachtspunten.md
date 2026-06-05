# Aandachtspunten Rules

These rules seed the analyst's judgment. Flag each condition that applies. Also flag anything else that a Dutch tax expert would consider notable, even if not listed here.

---

## Hypotheek

**Afgesloten hypotheek — geen aandachtspunt**
If a matched mortgage pair shows an amount mismatch, consider whether the mortgage was discharged mid-year. A strong indicator: the interest in the jaaropgave is very small relative to the remaining debt (e.g. €104 interest on €89,956 debt ≈ 0.1% — consistent with only a few weeks of interest before payoff). In that case, do NOT generate an attention point about the mismatch.

---

## Loon / Werkgever

**Datum in werkgeversjaaropgave is begindatum, niet einddatum**
A date shown in an employer jaaropgave (e.g. "01-01-2020" or "11-10-2021") is the **start date** of the employment relationship (begindatum dienstverband), not the end date. Do NOT flag a jaaropgave for the current tax year as suspicious merely because it shows a date from a prior year — that date indicates when employment began, which can be years in the past. Only flag an employment relationship as unusual if there is explicit evidence of an end date (einddatum) that predates the tax year covered by the jaaropgave.
