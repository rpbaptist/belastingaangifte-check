import type { AccountAmounts, MissingStatementItem, NotFilledInItem, TaxReturnEntry } from "./types";
import type { UnmatchedJaaropgave } from "./account-matcher";

export function buildMissingStatement(onlyInAangifte: TaxReturnEntry[]): MissingStatementItem[] {
  return onlyInAangifte.map((e) => ({
    field: e.field,
    accountNumber: e.accountNumber,
    amount: e.amount,
    box: e.box,
  }));
}

export function buildNotFilledIn(onlyInJaaropgave: UnmatchedJaaropgave[]): NotFilledInItem[] {
  return onlyInJaaropgave
    .map(({ statement, account }) => {
      const amount = primaryAmount(account.amounts);
      if (!amount) return null;
      return {
        accountNumber: account.accountNumber,
        institution: statement.institution,
        description: account.description,
        amount,
      };
    })
    .filter((item): item is NotFilledInItem => item !== null);
}

function primaryAmount(amounts: AccountAmounts): number | null {
  const bank = amounts["bank"];
  const broker = amounts["broker"];
  const mortgage = amounts["mortgage"];
  const wage = amounts["wage"];
  const other = amounts["other"];

  // Box 3 assets: sum balance values if present
  const box3 = (bank?.["balance"] ?? 0) + (broker?.["balance"] ?? 0);
  if (box3 !== 0) return box3;

  // Box 1 mortgage interest deduction
  if (mortgage?.["interestPaid"]) return mortgage["interestPaid"];
  if (mortgage?.["remainingDebt"]) return mortgage["remainingDebt"];

  // Box 1 wage / insurance
  if (wage?.["taxableWage"]) return wage["taxableWage"];
  if (wage?.["grossWage"]) return wage["grossWage"];
  if (other?.["premiumPaid"]) return other["premiumPaid"];

  // Fallback: first non-zero value across all fields
  for (const group of Object.values(amounts)) {
    for (const val of Object.values(group)) {
      if (val !== 0) return val;
    }
  }

  return null;
}
