# Aandachtspunten Rules

These rules seed the analyst's judgment. Flag each condition that applies. Also flag anything else that a Dutch tax expert would consider notable, even if not listed here.

---

## Hypotheek

**Aflossingsvrij hypotheek**
If a mortgage jaaropgave indicates the product is "aflossingsvrij" (interest-only), flag that the hypotheekrenteaftrek (mortgage interest deduction) may not apply or may be time-limited depending on when the mortgage was taken out. The taxpayer should verify eligibility.

**Afgesloten hypotheek — geen aandachtspunt**
If a mortgage jaaropgave shows a remaining debt of €0 at year-end (account closed during the year), and the jaaropgave shows interestPaid > 0, do NOT flag this as missing from the aangifte. A closed mortgage with paid interest will have a matching "Betaalde rente in [year]" entry in the aangifte under the same account number. The absence of a year-end balance is expected and correct.

If a mortgage jaaropgave is unmatched and shows interestPaid > 0 with a non-zero remainingDebt, consider whether the mortgage was discharged mid-year. A strong indicator: interestPaid is very small relative to the remainingDebt (e.g. €104 interest on €89,956 debt ≈ 0.1% — consistent with only a few weeks of interest before payoff). In that case, do NOT generate an attention point about missing interest deduction. The "Betaalde rente" entry exists in the aangifte; a matching failure at the account-number level does not mean the taxpayer omitted the deduction.

---

## Beleggingen / DEGIRO / Broker

**Buitenlands dividend**
Only fire when the jaaropgave actually shows foreignDividend > 0 OR foreignWithholdingTax > 0. Domestic Nederlandse dividendbelasting (dutchDividendTax) does NOT trigger this rule — that is an automatic voorheffing, not a verdragsverrekening. When the rule does fire, flag that the taxpayer may be entitled to verrekening van buitenlandse bronbelasting in their aangifte.

---

## Box 3 / Spaargeld

**Saldo boven vrijstelling**
If total box 3 assets (bank saldo + beleggingen) exceed the heffingsvrij vermogen threshold (€57.000 per person in 2024, €114.000 for fiscal partners), flag that the fictief rendement calculation applies and the taxpayer should verify the aangifte reflects this correctly.

---

## Algemeen

**Ontbrekende rekeningnummers**
If a jaaropgave contains a rekeningnummer with a non-zero amount that does not appear in the aangifte, flag it as potentially forgotten. Do NOT flag accounts whose jaaropgave amount is zero — those don't need to be reported.
