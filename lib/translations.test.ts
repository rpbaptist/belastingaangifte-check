import { describe, expect, it } from "vitest";
import {
  translate,
  formatTaxReturnProcessingError,
  formatExtractionFailed,
  formatAnalysisFailed,
} from "./translations";

describe("translate", () => {
  it("returns Dutch text for language 'nl'", () => {
    expect(translate("appTitle", "nl")).toBe("Aangifte Checker");
  });

  it("returns English text for language 'en'", () => {
    expect(translate("appTitle", "en")).toBe("Tax Return Checker");
  });

  it("returns Dutch for all keys when language is 'nl'", () => {
    expect(translate("invalidApiKey", "nl")).toBe("Ongeldige API-sleutel");
    expect(translate("analysisAbortedTooMany", "nl")).toContain("te veel");
    expect(translate("coveredLabel", "nl")).toBe("Gedekt");
  });

  it("returns English for all keys when language is 'en'", () => {
    expect(translate("invalidApiKey", "en")).toBe("Invalid API key");
    expect(translate("analysisAbortedTooMany", "en")).toContain("too many");
    expect(translate("coveredLabel", "en")).toBe("Covered");
  });

  it("returns assetsAboveThresholdTitle in both languages", () => {
    expect(translate("assetsAboveThresholdTitle", "nl")).toBe(
      "Vermogen boven heffingsvrij vermogen"
    );
    expect(translate("assetsAboveThresholdTitle", "en")).toBe("Assets above tax-free threshold");
  });

  it("returns assetsAboveThresholdExplanation with placeholders in both languages", () => {
    expect(translate("assetsAboveThresholdExplanation", "nl")).toContain("{total}");
    expect(translate("assetsAboveThresholdExplanation", "nl")).toContain("{threshold}");
    expect(translate("assetsAboveThresholdExplanation", "en")).toContain("{total}");
    expect(translate("assetsAboveThresholdExplanation", "en")).toContain("{threshold}");
  });
});

describe("formatTaxReturnProcessingError", () => {
  it("formats Dutch error message", () => {
    const result = formatTaxReturnProcessingError("test.pdf", "Onbekend bestand", "nl");
    expect(result).toBe('Aangifte "test.pdf" kon niet worden verwerkt: Onbekend bestand');
  });

  it("formats English error message", () => {
    const result = formatTaxReturnProcessingError("test.pdf", "Unknown file", "en");
    expect(result).toBe('Tax return "test.pdf" could not be processed: Unknown file');
  });

  it("includes filename in both languages", () => {
    const nl = formatTaxReturnProcessingError("aangifte-2024.pdf", "Fout", "nl");
    const en = formatTaxReturnProcessingError("aangifte-2024.pdf", "Error", "en");
    expect(nl).toContain("aangifte-2024.pdf");
    expect(en).toContain("aangifte-2024.pdf");
  });
});

describe("formatExtractionFailed", () => {
  it("formats Dutch error message", () => {
    expect(formatExtractionFailed("Time-out", "nl")).toBe("Extractie mislukt: Time-out");
  });

  it("formats English error message", () => {
    expect(formatExtractionFailed("Timeout", "en")).toBe("Extraction failed: Timeout");
  });
});

describe("formatAnalysisFailed", () => {
  it("formats Dutch error message", () => {
    expect(formatAnalysisFailed("Geen data", "nl")).toBe("Analyse mislukt: Geen data");
  });

  it("formats English error message", () => {
    expect(formatAnalysisFailed("No data", "en")).toBe("Analysis failed: No data");
  });
});
