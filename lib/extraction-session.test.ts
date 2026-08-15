import { describe, expect, it } from "vitest";
import { formatSessionFailure } from "./extraction-session";

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
