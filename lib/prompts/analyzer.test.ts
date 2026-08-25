import { describe, expect, it } from "vitest";
import { buildAnalyzerPrompt, buildUserMessage } from "./analyzer";

describe("buildAnalyzerPrompt", () => {
  it("includes the Dutch example when language is 'nl'", () => {
    const prompt = buildAnalyzerPrompt("Some rules", "nl");
    expect(prompt).toContain("Bedrag wijkt af");
    expect(prompt).toContain("Hypotheekverstrekker");
  });

  it("includes the English example when language is 'en'", () => {
    const prompt = buildAnalyzerPrompt("Some rules", "en");
    expect(prompt).toContain("Amount differs");
    expect(prompt).toContain("Mortgage provider");
  });

  it("adds the English language directive when language is 'en'", () => {
    const prompt = buildAnalyzerPrompt("Some rules", "en");
    expect(prompt).toContain(
      "Write the `title` and `explanation` values in the output JSON in English"
    );
  });

  it("does not add the language directive when language is 'nl'", () => {
    const prompt = buildAnalyzerPrompt("Some rules", "nl");
    expect(prompt).not.toContain("Write the `title` and `explanation` values");
  });

  it("includes the rules in the prompt", () => {
    const prompt = buildAnalyzerPrompt("Flag anything over €10.000.");
    expect(prompt).toContain("Flag anything over €10.000.");
  });

  it("defaults to Dutch when no language is provided", () => {
    const prompt = buildAnalyzerPrompt("Some rules");
    expect(prompt).toContain("Bedrag wijkt af");
  });

  it("requires raw JSON output", () => {
    const prompt = buildAnalyzerPrompt("", "en");
    expect(prompt).toContain("nothing before the opening brace");
    expect(prompt).toContain('{"attentionPoints": []}');
  });

  it("includes the retrieved-context section in Dutch when provided", () => {
    const prompt = buildAnalyzerPrompt("Some rules", "nl", "### Voorbeeldbron\n\nInhoud.");
    expect(prompt).toContain("Officiële bronnen");
    expect(prompt).toContain("Voorbeeldbron");
  });

  it("includes the retrieved-context section in English when provided", () => {
    const prompt = buildAnalyzerPrompt("Some rules", "en", "### Example source\n\nContent.");
    expect(prompt).toContain("Official sources");
    expect(prompt).toContain("Example source");
  });

  it("omits the retrieved-context section when retrievedContext is empty", () => {
    const promptNl = buildAnalyzerPrompt("Some rules", "nl", "");
    const promptEn = buildAnalyzerPrompt("Some rules", "en", "");
    expect(promptNl).not.toContain("Officiële bronnen");
    expect(promptEn).not.toContain("Official sources");
  });

  it("omits the retrieved-context section when no retrievedContext is passed at all", () => {
    const prompt = buildAnalyzerPrompt("Some rules", "nl");
    expect(prompt).not.toContain("Officiële bronnen");
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
