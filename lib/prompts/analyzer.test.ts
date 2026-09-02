import { describe, expect, it } from "vitest";
import { buildAnalyzerPrompt, buildAnalyzerPromptSuffix, buildUserMessage } from "./analyzer";

describe("buildAnalyzerPrompt", () => {
  it("includes the rules in the prompt", () => {
    const prompt = buildAnalyzerPrompt("Flag anything over €10.000.");
    expect(prompt).toContain("Flag anything over €10.000.");
  });

  it("uses the Dutch persona when language is 'nl'", () => {
    const prompt = buildAnalyzerPrompt("Some rules", "nl");
    expect(prompt).toContain("Nederlandse belastinganalist");
  });

  it("uses the English persona when language is 'en'", () => {
    const prompt = buildAnalyzerPrompt("Some rules", "en");
    expect(prompt).toContain("tax analyst specialized in Dutch tax law");
  });

  it("defaults to Dutch when no language is provided", () => {
    const prompt = buildAnalyzerPrompt("Some rules");
    expect(prompt).toContain("Nederlandse belastinganalist");
  });

  it("never includes the output-format section", () => {
    const prompt = buildAnalyzerPrompt("Some rules", "en");
    expect(prompt).not.toContain("nothing before the opening brace");
  });

  it("never includes the retrieved-context section", () => {
    const prompt = buildAnalyzerPrompt("Some rules", "nl");
    expect(prompt).not.toContain("Officiële bronnen");
  });
});

describe("buildAnalyzerPromptSuffix", () => {
  it("includes the Dutch example when language is 'nl'", () => {
    const suffix = buildAnalyzerPromptSuffix("", "nl");
    expect(suffix).toContain("Bedrag wijkt af");
    expect(suffix).toContain("Hypotheekverstrekker");
  });

  it("includes the English example when language is 'en'", () => {
    const suffix = buildAnalyzerPromptSuffix("", "en");
    expect(suffix).toContain("Amount differs");
    expect(suffix).toContain("Mortgage provider");
  });

  it("adds the English language directive when language is 'en'", () => {
    const suffix = buildAnalyzerPromptSuffix("", "en");
    expect(suffix).toContain(
      "Write the `title` and `explanation` values in the output JSON in English"
    );
  });

  it("does not add the language directive when language is 'nl'", () => {
    const suffix = buildAnalyzerPromptSuffix("", "nl");
    expect(suffix).not.toContain("Write the `title` and `explanation` values");
  });

  it("defaults to Dutch when no language is provided", () => {
    const suffix = buildAnalyzerPromptSuffix("");
    expect(suffix).toContain("Bedrag wijkt af");
  });

  it("requires raw JSON output", () => {
    const suffix = buildAnalyzerPromptSuffix("", "en");
    expect(suffix).toContain("nothing before the opening brace");
    expect(suffix).toContain('{"attentionPoints": []}');
  });

  it("includes the retrieved-context section in Dutch when provided", () => {
    const suffix = buildAnalyzerPromptSuffix("### Voorbeeldbron\n\nInhoud.", "nl");
    expect(suffix).toContain("Officiële bronnen");
    expect(suffix).toContain("Voorbeeldbron");
  });

  it("includes the retrieved-context section in English when provided", () => {
    const suffix = buildAnalyzerPromptSuffix("### Example source\n\nContent.", "en");
    expect(suffix).toContain("Official sources");
    expect(suffix).toContain("Example source");
  });

  it("omits the retrieved-context section when retrievedContext is empty", () => {
    const suffixNl = buildAnalyzerPromptSuffix("", "nl");
    const suffixEn = buildAnalyzerPromptSuffix("", "en");
    expect(suffixNl).not.toContain("Officiële bronnen");
    expect(suffixEn).not.toContain("Official sources");
  });

  it("omits the retrieved-context section when no retrievedContext is passed at all", () => {
    const suffix = buildAnalyzerPromptSuffix(undefined, "nl");
    expect(suffix).not.toContain("Officiële bronnen");
  });
});

describe("buildUserMessage", () => {
  it("serialises amount mismatches as JSON in Dutch", () => {
    const mismatches = [
      {
        aangifte: { box: "1" as const, field: "Loon", accountNumber: "NL01TEST", amount: 50000 },
        jaaropgave: {
          statement: {
            institution: "Employer",
            institutionType: "other" as const,
            taxYear: 2024,
            accounts: [],
            metadata: {},
          },
          account: {
            accountNumber: "NL01TEST",
            description: "Salary",
            amounts: { salary: { wage: 52000 } },
          },
        },
        amountStatement: 52000,
      },
    ];

    const msg = buildUserMessage(mismatches, [], "nl");
    expect(msg).toContain("NL01TEST");
    expect(msg).toContain("Bedragsverschillen");
  });

  it("serialises amount mismatches as JSON in English", () => {
    const mismatches = [
      {
        aangifte: { box: "1" as const, field: "Loon", accountNumber: "NL01TEST", amount: 50000 },
        jaaropgave: {
          statement: {
            institution: "Employer",
            institutionType: "other" as const,
            taxYear: 2024,
            accounts: [],
            metadata: {},
          },
          account: {
            accountNumber: "NL01TEST",
            description: "Salary",
            amounts: { salary: { wage: 52000 } },
          },
        },
        amountStatement: 52000,
      },
    ];

    const msg = buildUserMessage(mismatches, [], "en");
    expect(msg).toContain("NL01TEST");
    expect(msg).toContain("Amount mismatches");
  });

  it("includes covered accounts section in Dutch", () => {
    const covered = [{ accountNumber: "NL02TEST", institution: "TestBank" }];
    const msg = buildUserMessage([], covered, "nl");
    expect(msg).toContain("Gedekte rekeningen");
    expect(msg).toContain("TestBank");
    expect(msg).toContain("NL02TEST");
  });

  it("includes covered accounts section in English", () => {
    const covered = [{ accountNumber: "NL02TEST", institution: "TestBank" }];
    const msg = buildUserMessage([], covered, "en");
    expect(msg).toContain("Covered accounts");
    expect(msg).toContain("TestBank");
    expect(msg).toContain("NL02TEST");
  });
});
