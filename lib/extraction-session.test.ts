import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  extractStatements,
  formatSessionFailure,
  runExtractionSession,
} from "./extraction-session";

// runExtractionSession/extractStatements call createClient() internally rather than taking a
// client, so the Anthropic client itself is mocked at the module boundary (lib/llm) — mirrors
// how lib/extractor.test.ts mocks the client passed directly to extract().
type Responder = (pdfBase64: string) => unknown;
let responder: Responder = () => ({});

vi.mock("./llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./llm")>();
  return {
    ...actual,
    createClient: () =>
      ({
        messages: {
          create: vi.fn(async (params: Anthropic.MessageCreateParamsNonStreaming) => {
            const content = params.messages[0]!.content;
            const doc = (
              content as Anthropic.ContentBlockParam[]
            )[0] as Anthropic.DocumentBlockParam;
            const source = doc.source as Anthropic.Base64PDFSource;
            const json = JSON.stringify(responder(source.data));
            return {
              id: "msg_test",
              type: "message",
              role: "assistant",
              model: "claude-haiku-4-5-20251001",
              stop_reason: "end_turn",
              stop_sequence: null,
              usage: { input_tokens: 1, output_tokens: 1 },
              content: [{ type: "text", text: json, citations: [] }],
            } as unknown as Anthropic.Message;
          }),
        },
      }) as unknown as Anthropic,
  };
});

const TAX_RETURN_JSON = { taxYear: 2024, entries: [] };

describe("runExtractionSession / extractStatements — statement kind splitting", () => {
  it("buckets a jaaropgave, a property bewijsstuk and an unrecognized document separately", async () => {
    responder = (pdfBase64) => {
      if (pdfBase64 === "aangifte") return TAX_RETURN_JSON;
      if (pdfBase64 === "jaaropgave") {
        return {
          documentKind: "jaaropgave",
          institution: "TestBank",
          institutionType: "bank",
          taxYear: 2024,
          accounts: [
            {
              accountNumber: "NL01TEST",
              description: "Betaal",
              amounts: { bank: { balance: 100 } },
            },
          ],
          metadata: {},
        };
      }
      if (pdfBase64 === "notaris") {
        return {
          documentKind: "notarisafrekening",
          institution: "Notaris Jansen",
          taxYear: 2024,
          amounts: [{ kind: "saleProceeds", label: "Verkoopopbrengst", amount: 425000 }],
        };
      }
      return { documentKind: "unrecognized", institution: "Onbekend BV", taxYear: 2024 };
    };

    const result = await runExtractionSession(
      "aangifte",
      [
        { data: "jaaropgave", filename: "jaaropgave.pdf" },
        { data: "notaris", filename: "notaris.pdf" },
        { data: "raadsel", filename: "raadsel.pdf" },
      ],
      "fake-key"
    );

    if (!result.ok) throw new Error(`expected ok session, got: ${result.message}`);
    expect(result.annualStatements).toHaveLength(1);
    expect(result.annualStatements[0].institution).toBe("TestBank");
    expect(result.propertyStatements).toHaveLength(1);
    expect(result.propertyStatements[0].documentKind).toBe("notarisafrekening");
    expect(result.unrecognizedDocuments).toEqual([{ institution: "Onbekend BV", taxYear: 2024 }]);
  });

  it("extractStatements (incremental path) buckets the same three ways", async () => {
    responder = (pdfBase64) => {
      if (pdfBase64 === "jaaropgave") {
        return {
          documentKind: "jaaropgave",
          institution: "TestBank",
          institutionType: "bank",
          taxYear: 2024,
          accounts: [],
          metadata: {},
        };
      }
      return { documentKind: "unrecognized", institution: "", taxYear: null };
    };

    const result = await extractStatements(
      [
        { data: "jaaropgave", filename: "jaaropgave.pdf" },
        { data: "raadsel", filename: "raadsel.pdf" },
      ],
      "fake-key"
    );

    expect(result.annualStatements).toHaveLength(1);
    expect(result.propertyStatements).toEqual([]);
    expect(result.unrecognizedDocuments).toEqual([{ institution: "", taxYear: null }]);
    expect(result.errors).toEqual([]);
  });
});

describe("formatSessionFailure", () => {
  it("maps a failed session to a 422 with a Dutch processing-error message", () => {
    const result = formatSessionFailure(
      "aangifte.pdf",
      { ok: false, message: "kon niet lezen" },
      "nl"
    );
    expect(result).toEqual({
      status: 422,
      message: 'Aangifte "aangifte.pdf" kon niet worden verwerkt: kon niet lezen',
    });
  });

  it("maps a failed session to a 422 with an English processing-error message", () => {
    const result = formatSessionFailure(
      "return.pdf",
      { ok: false, message: "could not read" },
      "en"
    );
    expect(result).toEqual({
      status: 422,
      message: 'Tax return "return.pdf" could not be processed: could not read',
    });
  });
});
