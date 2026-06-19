import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildAnalysisRequest, parseAnalysisResponse } from "./analyzer";

const noMismatches: Parameters<typeof buildAnalysisRequest>[0] = [];
const noCovered: Parameters<typeof buildAnalysisRequest>[1] = [];
const rules = "Flag anything over €10.000.";

function makeResponse(
  overrides: Partial<Anthropic.Message> & { text?: string }
): Anthropic.Message {
  const { text, ...rest } = overrides;
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
    content: text != null ? [{ type: "text", text }] : [],
    ...rest,
  } as Anthropic.Message;
}

describe("buildAnalysisRequest", () => {
  it("uses the expected model and max_tokens", () => {
    const req = buildAnalysisRequest(noMismatches, noCovered, rules);
    expect(req.model).toBe("claude-sonnet-4-6");
    expect(req.max_tokens).toBe(4096);
  });

  it("embeds rules in the system message", () => {
    const req = buildAnalysisRequest(noMismatches, noCovered, rules);
    const system = Array.isArray(req.system) ? req.system : [];
    const systemText = system.map((b) => ("text" in b ? b.text : "")).join("");
    expect(systemText).toContain(rules);
  });

  it("sets cache_control ephemeral on the system block", () => {
    const req = buildAnalysisRequest(noMismatches, noCovered, rules);
    const system = Array.isArray(req.system) ? req.system : [];
    expect(system[0]).toMatchObject({ cache_control: { type: "ephemeral" } });
  });

  it("serialises mismatches into the user message", () => {
    const mismatch = {
      aangifte: { box: "3" as const, field: "Saldo", accountNumber: "NL01TEST", amount: 100 },
      jaaropgave: {
        statement: {
          institution: "TestBank",
          institutionType: "bank" as const,
          taxYear: 2024,
          accounts: [],
          metadata: {},
        },
        account: {
          accountNumber: "NL01TEST",
          description: "Test",
          amounts: { bank: { balance: 200 } },
        },
      },
      amountStatement: 200,
    };
    const req = buildAnalysisRequest([mismatch], noCovered, rules);
    const userContent = (req.messages[0] as { content: string }).content;
    expect(userContent).toContain("NL01TEST");
    expect(userContent).toContain("Saldo");
  });

  it("includes Dutch prompt by default", () => {
    const req = buildAnalysisRequest(noMismatches, noCovered, rules);
    const system = Array.isArray(req.system) ? req.system : [];
    const systemText = system.map((b) => ("text" in b ? b.text : "")).join("");
    expect(systemText).toContain("Bedrag wijkt af");
  });

  it("includes English prompt when language is 'en'", () => {
    const req = buildAnalysisRequest(noMismatches, noCovered, rules, "en");
    const system = Array.isArray(req.system) ? req.system : [];
    const systemText = system.map((b) => ("text" in b ? b.text : "")).join("");
    expect(systemText).toContain("Amount differs");
  });
});

describe("parseAnalysisResponse", () => {
  it("throws a Dutch error on max_tokens stop", () => {
    const res = makeResponse({ stop_reason: "max_tokens" });
    expect(() => parseAnalysisResponse(res)).toThrow("Analyse afgebroken");
  });

  it("throws an English error on max_tokens stop when language is 'en'", () => {
    const res = makeResponse({ stop_reason: "max_tokens" });
    expect(() => parseAnalysisResponse(res, "en")).toThrow("too many entries");
  });

  it("throws when there is no text block", () => {
    const res = makeResponse({});
    expect(() => parseAnalysisResponse(res)).toThrow("Geen reactie ontvangen");
  });

  it("throws an English error when there is no text block and language is 'en'", () => {
    const res = makeResponse({});
    expect(() => parseAnalysisResponse(res, "en")).toThrow("No response received");
  });

  it("throws on response that is not a JSON object", () => {
    // LLMAnalysisResponseSchema uses .catch([]) for attentionPoints items, so bad
    // item fields are swallowed. The Zod error path triggers when raw is not an object.
    const res = makeResponse({ text: "null" });
    expect(() => parseAnalysisResponse(res)).toThrow("Analyse mislukt");
  });

  it("throws an English error on bad JSON when language is 'en'", () => {
    const res = makeResponse({ text: "null" });
    expect(() => parseAnalysisResponse(res, "en")).toThrow("Analysis failed");
  });

  it("returns attentionPoints on a valid response", () => {
    const point = {
      title: "Bedrag wijkt af",
      explanation: "Verschil van €100.",
      institution: "TestBank",
      accountNumber: "NL01TEST",
    };
    const res = makeResponse({ text: JSON.stringify({ attentionPoints: [point] }) });
    const result = parseAnalysisResponse(res);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(point);
  });

  it("returns empty array for a response with no attention points", () => {
    const res = makeResponse({ text: '{"attentionPoints": []}' });
    expect(parseAnalysisResponse(res)).toEqual([]);
  });
});
