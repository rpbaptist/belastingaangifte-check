import { describe, expect, it, vi } from "vitest";
import {
  buildRetrievalQuery,
  formatRetrievedContext,
  retrieveKennisbankContext,
} from "./retrieval";
import type { AmountMismatch } from "../categorizer";
import type { ScoredChunk } from "./types";

function makeMismatch(overrides: Partial<AmountMismatch> = {}): AmountMismatch {
  return {
    aangifte: {
      box: "3",
      field: "Hypotheekrente",
      accountNumber: "NL01TEST0000000001",
      amount: 1000,
    },
    jaaropgave: {
      statement: {
        institution: "Test Bank",
        institutionType: "mortgage",
        taxYear: 2024,
        accounts: [],
        metadata: {},
      },
      account: {
        accountNumber: "NL01TEST0000000001",
        description: "Test",
        amounts: { mortgage: { interestPaid: 900 } },
      },
    },
    amountStatement: 900,
    ...overrides,
  };
}

describe("buildRetrievalQuery", () => {
  it("includes the aangifte field and institution type from each mismatch", () => {
    const query = buildRetrievalQuery([makeMismatch()]);
    expect(query).toContain("Hypotheekrente");
    expect(query).toContain("mortgage");
  });

  it("includes mortgage-type metadata when present on the mismatch's statement", () => {
    const mismatch = makeMismatch({
      jaaropgave: {
        statement: {
          institution: "Test Bank",
          institutionType: "mortgage",
          taxYear: 2024,
          accounts: [],
          metadata: { mortgageType: "aflossingsvrij" },
        },
        account: {
          accountNumber: "NL01TEST0000000001",
          description: "Test",
          amounts: { mortgage: { interestPaid: 900 } },
        },
      },
    });

    const query = buildRetrievalQuery([mismatch]);
    expect(query).toContain("hypotheek aflossingsvrij");
  });

  it("does not leak topics from unrelated statements not part of any mismatch", () => {
    // Regression guard for the grilled decision: query is built only from the
    // mismatches themselves, not from a separately-passed list of all annual statements.
    const query = buildRetrievalQuery([makeMismatch()]);
    expect(query).not.toContain("dividend");
  });
});

describe("formatRetrievedContext", () => {
  it("returns an empty string for no chunks", () => {
    expect(formatRetrievedContext([])).toBe("");
  });

  it("renders source title, URL, and text for each chunk", () => {
    const chunks: ScoredChunk[] = [
      {
        score: 0.9,
        chunk: {
          id: "https://example.org/a#0",
          sourceUrl: "https://example.org/a",
          sourceTitle: "Voorbeeldpagina",
          text: "Inhoud van de pagina.",
        },
      },
    ];

    const formatted = formatRetrievedContext(chunks);
    expect(formatted).toContain("Voorbeeldpagina");
    expect(formatted).toContain("https://example.org/a");
    expect(formatted).toContain("Inhoud van de pagina.");
  });

  it("uses the Dutch source label by default", () => {
    const chunks: ScoredChunk[] = [
      {
        score: 0.9,
        chunk: {
          id: "https://example.org/a#0",
          sourceUrl: "https://example.org/a",
          sourceTitle: "Voorbeeldpagina",
          text: "Inhoud.",
        },
      },
    ];

    expect(formatRetrievedContext(chunks)).toContain("Bron:");
  });

  it("uses the English source label when language is 'en'", () => {
    const chunks: ScoredChunk[] = [
      {
        score: 0.9,
        chunk: {
          id: "https://example.org/a#0",
          sourceUrl: "https://example.org/a",
          sourceTitle: "Example page",
          text: "Content.",
        },
      },
    ];

    const formatted = formatRetrievedContext(chunks, "en");
    expect(formatted).toContain("Source:");
    expect(formatted).not.toContain("Bron:");
  });
});

describe("retrieveKennisbankContext", () => {
  it("embeds the query and delegates to the injected store with the requested k", async () => {
    const embed = vi.fn().mockResolvedValue([[1, 0, 0]]);
    const search = vi.fn().mockResolvedValue([]);

    await retrieveKennisbankContext([makeMismatch()], {
      k: 3,
      embeddingClient: { embed },
      store: { search },
    });

    expect(embed).toHaveBeenCalledWith([expect.stringContaining("Hypotheekrente")], "query");
    expect(search).toHaveBeenCalledWith([1, 0, 0], 3);
  });

  it("returns an empty array without embedding when there are no mismatches", async () => {
    const embed = vi.fn();
    const results = await retrieveKennisbankContext([], { embeddingClient: { embed } });

    expect(results).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it("returns an empty array instead of crashing when the embedding client returns nothing", async () => {
    const embed = vi.fn().mockResolvedValue([]);
    const search = vi.fn();

    const results = await retrieveKennisbankContext([makeMismatch()], {
      embeddingClient: { embed },
      store: { search },
    });

    expect(results).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });
});
