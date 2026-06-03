import { describe, expect, it } from "vitest";
import { normalize } from "./account-normalizer";

describe("normalize", () => {
  it("strips whitespace", () => {
    expect(normalize("NL22 INGB 0673 3457 85")).toBe("nl22ingb0673345785");
  });

  it("strips dots", () => {
    expect(normalize("1926.58.069")).toBe("192658069");
  });

  it("strips dashes", () => {
    expect(normalize("D553-483 60")).toBe("d55348360");
  });

  it("strips Nummer prefix", () => {
    expect(normalize("Nummer192658069")).toBe("192658069");
  });

  it("strips Nr prefix case-insensitively", () => {
    expect(normalize("NR192658069")).toBe("192658069");
  });

  it("handles combined: prefix + dots + whitespace", () => {
    expect(normalize("Nummer 1926.58.069")).toBe("192658069");
  });
});
