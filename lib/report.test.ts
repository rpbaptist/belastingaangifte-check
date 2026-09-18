import { describe, expect, it } from "vitest";
import type { AnnualStatementData, PropertyStatementData, TaxReturnData } from "./types";
import { buildReport } from "./report";

function makeTaxReturn(overrides: Partial<TaxReturnData> = {}): TaxReturnData {
  return {
    taxYear: 2024,
    entries: [
      { box: "3", field: "Saldo bankrekening", accountNumber: "NL01 TEST", amount: 1000 },
      { box: "3", field: "Saldo spaarrekening", accountNumber: "NL02TEST", amount: 500 },
    ],
    ...overrides,
  };
}

function makeStatements(overrides: Partial<AnnualStatementData> = {}): AnnualStatementData[] {
  return [
    {
      institution: "TestBank",
      institutionType: "bank",
      taxYear: 2024,
      accounts: [
        {
          accountNumber: "NL01TEST",
          description: "Betaalrekening",
          amounts: { bank: { balance: 1000 } },
        },
      ],
      metadata: {},
      ...overrides,
    },
  ];
}

describe("buildReport", () => {
  it("maps a Gedekt pair to covered with no mismatches or rule points", () => {
    const taxReturn = makeTaxReturn({ entries: [makeTaxReturn().entries[0]] });
    const result = buildReport(taxReturn, makeStatements(), [], [], "nl");

    expect(result.taxYear).toBe(2024);
    expect(result.covered).toHaveLength(1);
    expect(result.covered[0]).toMatchObject({
      field: "Saldo bankrekening",
      institution: "TestBank",
    });
    expect(result.amountMismatches).toEqual([]);
    expect(result.missingStatement).toEqual([]);
    expect(result.notFilledIn).toEqual([]);
    expect(result.rulePoints).toEqual([]);
  });

  it("places an unmatched aangifte entry in missingStatement (Jaaropgave ontbreekt)", () => {
    const result = buildReport(makeTaxReturn(), makeStatements(), [], [], "nl");

    expect(result.covered).toHaveLength(1);
    expect(result.missingStatement).toHaveLength(1);
    expect(result.missingStatement[0]).toMatchObject({
      field: "Saldo spaarrekening",
      amount: 500,
    });
    expect(result.amountMismatches).toEqual([]);
  });

  it("places a matched pair with >€1 difference in amountMismatches", () => {
    const taxReturn = makeTaxReturn({
      entries: [{ box: "3", field: "Saldo bankrekening", accountNumber: "NL01TEST", amount: 1000 }],
    });
    const statements = makeStatements({
      accounts: [
        {
          accountNumber: "NL01TEST",
          description: "Betaalrekening",
          amounts: { bank: { balance: 1100 } },
        },
      ],
    });

    const result = buildReport(taxReturn, statements, [], [], "nl");

    expect(result.covered).toEqual([]);
    expect(result.amountMismatches).toHaveLength(1);
    expect(result.amountMismatches[0].amountStatement).toBe(1100);
    expect(result.amountMismatches[0].aangifte.amount).toBe(1000);
  });

  it("places an unmatched jaaropgave account in notFilledIn (Niet ingevuld in aangifte)", () => {
    const taxReturn = makeTaxReturn({ entries: [] });
    const result = buildReport(taxReturn, makeStatements(), [], [], "nl");

    expect(result.notFilledIn).toHaveLength(1);
    expect(result.notFilledIn[0]).toMatchObject({
      institution: "TestBank",
      amount: 1000,
    });
  });

  it("suppresses zero-balance jaaropgave accounts from notFilledIn", () => {
    const taxReturn = makeTaxReturn({ entries: [] });
    const statements = makeStatements({
      accounts: [
        {
          accountNumber: "NL01TEST",
          description: "Betaalrekening",
          amounts: { bank: { balance: 0 } },
        },
      ],
    });

    const result = buildReport(taxReturn, statements, [], [], "nl");

    expect(result.notFilledIn).toEqual([]);
  });

  it("surfaces rule points from statements with a Dutch title by default", () => {
    const taxReturn = makeTaxReturn({ entries: [] });
    const statements = makeStatements({
      institutionType: "mortgage",
      metadata: { mortgageType: "aflossingsvrij" },
      accounts: [
        {
          accountNumber: "NL01TEST",
          description: "Hypotheek",
          amounts: { mortgage: { interestPaid: 8400, remainingDebt: 200000 } },
        },
      ],
    });

    const result = buildReport(taxReturn, statements, [], [], "nl");

    expect(result.rulePoints.some((p) => p.title === "Aflossingsvrij hypotheek")).toBe(true);
  });

  it("translates rule points when language is 'en'", () => {
    const taxReturn = makeTaxReturn({ entries: [] });
    const statements = makeStatements({
      institutionType: "mortgage",
      metadata: { mortgageType: "aflossingsvrij" },
      accounts: [
        {
          accountNumber: "NL01TEST",
          description: "Hypotheek",
          amounts: { mortgage: { interestPaid: 8400, remainingDebt: 200000 } },
        },
      ],
    });

    const result = buildReport(taxReturn, statements, [], [], "en");

    expect(result.rulePoints.some((p) => p.title === "Interest-only mortgage")).toBe(true);
  });

  it("handles multiple accounts across multiple statements", () => {
    const taxReturn = makeTaxReturn({
      entries: [{ box: "3", field: "Saldo bankrekening", accountNumber: "NL01TEST", amount: 1000 }],
    });
    const statements: AnnualStatementData[] = [
      ...makeStatements(),
      {
        institution: "OtherBank",
        institutionType: "bank",
        taxYear: 2024,
        accounts: [
          {
            accountNumber: "NL03TEST",
            description: "Spaarrekening",
            amounts: { bank: { balance: 2000 } },
          },
        ],
        metadata: {},
      },
    ];

    const result = buildReport(taxReturn, statements, [], [], "nl");

    expect(result.covered).toHaveLength(1);
    expect(result.notFilledIn).toHaveLength(1);
    expect(result.notFilledIn[0]).toMatchObject({ institution: "OtherBank", amount: 2000 });
  });

  it("reports an unresolvable matched amount as a finding, never as covered", () => {
    // A field nothing downstream can price (institution 'other', unmapped field) used to be
    // echoed back as covered. It must now be a finding, and the aangifte figure must not
    // reappear as a confirmed statement amount.
    const taxReturn = makeTaxReturn({
      entries: [{ box: "3", field: "Onbekend veld", accountNumber: "NL01TEST", amount: 99999 }],
    });
    const statements = makeStatements({
      institutionType: "other",
      accounts: [
        {
          accountNumber: "NL01TEST",
          description: "Overig",
          amounts: { other: { premiumPaid: 500 } },
        },
      ],
    });

    const result = buildReport(taxReturn, statements, [], [], "nl");

    expect(result.covered).toEqual([]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].kind).toBe("unresolvedAmount");
    expect(result.findings[0].field).toBe("Onbekend veld");
  });

  it("reports a bewijsstuk in a different tax year as a finding, not an attention point", () => {
    const taxReturn = makeTaxReturn({ entries: [] });
    const statements = makeStatements({ taxYear: 2023 });

    const result = buildReport(taxReturn, statements, [], [], "nl");

    expect(result.findings.some((f) => f.kind === "taxYearMismatch")).toBe(true);
    expect(result.rulePoints).toEqual([]);
  });

  it("surfaces a collapsed duplicate as a finding, separate from aandachtspunten", () => {
    // Pre-#107 this appeared as an attention point. A collapsed duplicate is about the tool's
    // reading, not the filer's position, so it belongs in findings.
    const taxReturn = makeTaxReturn({
      entries: [
        { box: "3", field: "Saldo bank en spaarrekeningen", accountNumber: null, amount: 100 },
        { box: "3", field: "Saldo bank en spaarrekeningen", accountNumber: null, amount: 100 },
      ],
    });

    const result = buildReport(taxReturn, [], [], [], "nl");

    expect(result.findings.some((f) => f.kind === "duplicateRow")).toBe(true);
    expect(result.rulePoints).toEqual([]);
  });

  it("is deterministic: repeated calls return deep-equal results", () => {
    const taxReturn = makeTaxReturn();
    const statements = makeStatements();
    const first = buildReport(taxReturn, statements, [], [], "nl");
    const second = buildReport(taxReturn, statements, [], [], "nl");

    expect(second).toEqual(first);
  });

  describe("property bewijsstukken", () => {
    function makePropertyStatement(
      overrides: Partial<PropertyStatementData> = {}
    ): PropertyStatementData {
      return {
        documentKind: "notarisafrekening",
        institution: "Notaris Jansen",
        taxYear: 2024,
        amounts: [
          { kind: "saleProceeds", label: "Verkoopopbrengst", amount: 398000 },
          { kind: "loanRepayment", label: "Aflossing hypotheek TestBank", amount: 1000 },
        ],
        ...overrides,
      };
    }

    it("lists a property bewijsstuk's amounts on the report without matching it", () => {
      const taxReturn = makeTaxReturn({ entries: [] });
      const result = buildReport(taxReturn, [], [makePropertyStatement()], [], "nl");

      expect(result.propertyStatements).toHaveLength(1);
      expect(result.propertyStatements[0].amounts).toHaveLength(2);
      expect(result.covered).toEqual([]);
      expect(result.missingStatement).toEqual([]);
      expect(result.notFilledIn).toEqual([]);
      expect(result.amountMismatches).toEqual([]);
    });

    it("never pairs a notarisafrekening against a jaaropgave bank account, even when amounts coincide", () => {
      // The notarisafrekening's loanRepayment amount (1000) intentionally matches the
      // jaaropgave's bank balance (1000) and the aangifte entry's accountNumber (NL01TEST) —
      // a false pair here would mean the property statement leaked into account matching.
      const taxReturn = makeTaxReturn({
        entries: [
          { box: "3", field: "Saldo bankrekening", accountNumber: "NL01TEST", amount: 1000 },
        ],
      });
      const statements = makeStatements();
      const propertyStatements = [makePropertyStatement()];

      const result = buildReport(taxReturn, statements, propertyStatements, [], "nl");

      expect(result.covered).toHaveLength(1);
      expect(result.covered[0].institution).toBe("TestBank");
      expect(result.amountMismatches).toEqual([]);
      expect(result.propertyStatements).toHaveLength(1);
    });

    it("never lets a payment-reference IBAN on a notarisafrekening become the row's identity", () => {
      // PropertyStatementData has no accountNumber field at all, so this is a structural
      // guarantee, not a heuristic — reflected here as an end-to-end report assertion.
      const taxReturn = makeTaxReturn({ entries: [] });
      const statements = makeStatements(); // jaaropgave for NL01TEST
      const propertyStatements = [
        makePropertyStatement({ institution: "Notaris Jansen (uitbetaling op NL01TEST)" }),
      ];

      const result = buildReport(taxReturn, statements, propertyStatements, [], "nl");

      // The jaaropgave's own NL01TEST balance is still unmatched and reported as notFilledIn —
      // it was never paired away by the property statement mentioning the same IBAN in prose.
      expect(result.notFilledIn).toHaveLength(1);
      expect(result.notFilledIn[0].institution).toBe("TestBank");
    });

    it("reports a property amount outside the closed kind set as a finding", () => {
      const taxReturn = makeTaxReturn({ entries: [] });
      const propertyStatements = [
        makePropertyStatement({
          amounts: [{ kind: null, label: "Administratiekosten", amount: 45 }],
        }),
      ];

      const result = buildReport(taxReturn, [], propertyStatements, [], "nl");

      expect(result.findings.some((f) => f.kind === "unknownAmountKind")).toBe(true);
    });

    it("reports an unrecognized document as a finding rather than having no effect", () => {
      const taxReturn = makeTaxReturn({ entries: [] });
      const result = buildReport(
        taxReturn,
        [],
        [],
        [{ institution: "Onbekend BV", taxYear: 2024 }],
        "nl"
      );

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].kind).toBe("unrecognizedDocument");
    });
  });
});
