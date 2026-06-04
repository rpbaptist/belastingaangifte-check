# Aandachtspunten Rules

These rules seed the analyst's judgment. Flag each condition that applies. Also flag anything else that a Dutch tax expert would consider notable, even if not listed here.

---

## Hypotheek

**Aflossingsvrij hypotheek**
If a mortgage jaaropgave indicates the product is "aflossingsvrij" (interest-only), flag that the hypotheekrenteaftrek (mortgage interest deduction) may not apply or may be time-limited depending on when the mortgage was taken out. The taxpayer should verify eligibility.

---

## Beleggingen / DEGIRO / Broker

**Buitenlands dividend**
Only fire when the jaaropgave actually shows foreignDividend > 0 OR foreignWithholdingTax > 0. Domestic Nederlandse dividendbelasting (dutchDividendTax) does NOT trigger this rule — that is an automatic voorheffing, not a verdragsverrekening. When the rule does fire, flag that the taxpayer may be entitled to verrekening van buitenlandse bronbelasting in their aangifte.

---

## Box 3 / Spaargeld

**Saldo boven vrijstelling**
If total box 3 assets (bank saldo + beleggingen) exceed the heffingsvrij vermogen threshold (€57.000 per person in 2024, €114.000 for fiscal partners), flag that the fictief rendement calculation applies and the taxpayer should verify the aangifte reflects this correctly.

---

## Loon / Werkgever

**Datum in werkgeversjaaropgave is begindatum, niet einddatum**
A date shown in an employer jaaropgave (e.g. "01-01-2020" or "11-10-2021") is the **start date** of the employment relationship (begindatum dienstverband), not the end date. Do NOT flag a jaaropgave for the current tax year as suspicious merely because it shows a date from a prior year — that date indicates when employment began, which can be years in the past. Only flag an employment relationship as unusual if there is explicit evidence of an end date (einddatum) that predates the tax year covered by the jaaropgave.
