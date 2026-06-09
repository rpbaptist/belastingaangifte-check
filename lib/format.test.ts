import { describe, expect, it } from "vitest";
import { formatEuro, formatMetadata, parseExtractionError } from "./format";

describe("formatEuro", () => {
  it("formats a whole number using Dutch thousands separator", () => {
    expect(formatEuro(3080)).toContain("3.080");
  });

  it("rounds to zero decimal places", () => {
    expect(formatEuro(3080.67)).toContain("3.081");
  });

  it("includes the euro sign", () => {
    expect(formatEuro(0)).toContain("€");
  });
});

describe("parseExtractionError", () => {
  it("parses a well-formed extraction error message", () => {
    const result = parseExtractionError(
      'Aangifte "mijn-aangifte.pdf" kon niet worden verwerkt: Geen belastingaangifte gevonden.'
    );
    expect(result).toEqual({
      filename: "mijn-aangifte.pdf",
      detail: "Geen belastingaangifte gevonden.",
    });
  });

  it("returns null for a message that does not match the pattern", () => {
    expect(parseExtractionError("Onbekende fout")).toBeNull();
  });

  it("captures multi-line detail text", () => {
    const result = parseExtractionError(
      'Aangifte "test.pdf" kon niet worden verwerkt: Regel 1\nRegel 2'
    );
    expect(result?.detail).toBe("Regel 1\nRegel 2");
  });
});

describe("formatMetadata", () => {
  it("joins two present values with a separator", () => {
    expect(formatMetadata(["ING Bank", "NL00INGB0000000001"])).toBe(
      "ING Bank · NL00INGB0000000001"
    );
  });

  it("omits null and undefined values", () => {
    expect(formatMetadata(["ING Bank", undefined, null])).toBe("ING Bank");
  });

  it("returns empty string when all values are absent", () => {
    expect(formatMetadata([undefined, null])).toBe("");
  });
});
