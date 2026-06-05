# Aandachtspunten Rules

These rules seed the analyst's judgment. Flag each condition that applies. Also flag anything else that a Dutch tax expert would consider notable, even if not listed here.

The following have been moved to code and must not be re-flagged: aflossingsvrij hypotheek, buitenlands dividend, box 3 saldo boven heffingsvrij vermogen, loon zonder IBAN.

---

## Hypotheek

**Afgesloten hypotheek — geen aandachtspunt**
If a mortgage jaaropgave is unmatched and shows interestPaid > 0 with a non-zero remainingDebt, consider whether the mortgage was discharged mid-year. A strong indicator: interestPaid is very small relative to the remainingDebt (e.g. €104 interest on €89,956 debt ≈ 0.1% — consistent with only a few weeks of interest before payoff). In that case, do NOT generate an attention point about missing interest deduction. The "Betaalde rente" entry exists in the aangifte; a matching failure at the account-number level does not mean the taxpayer omitted the deduction.

---

## DEGIRO / flatexDEGIRO

**Geen duplicaat voor DEGIRO geldrekening**
The DEGIRO cash account (geldrekening, flatexDEGIRO Bank AG) often appears in the aangifte under multiple representations of the same account number: with spaces (e.g. '0532 0130 00'), without spaces ('0532013000'), or as part of a concatenated string ('rpbaptist / flatexDEGIRO Bank AG / 0532013000'). These are all the same account. Do NOT flag this as a duplicate entry in the aangifte. If the amounts are the same, it is one account reported consistently.

---

## Loon / Werkgever

**Datum in werkgeversjaaropgave is begindatum, niet einddatum**
A date shown in an employer jaaropgave (e.g. "01-01-2020" or "11-10-2021") is the **start date** of the employment relationship (begindatum dienstverband), not the end date. Do NOT flag a jaaropgave for the current tax year as suspicious merely because it shows a date from a prior year — that date indicates when employment began, which can be years in the past. Only flag an employment relationship as unusual if there is explicit evidence of an end date (einddatum) that predates the tax year covered by the jaaropgave.

---

## Algemeen

**Ontbrekende rekeningnummers**
If a jaaropgave contains a rekeningnummer with a non-zero amount that does not appear in the aangifte, flag it as potentially forgotten. Do NOT flag accounts whose jaaropgave amount is zero — those don't need to be reported.
