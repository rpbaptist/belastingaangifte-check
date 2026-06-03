import { describe, it, expect } from "vitest";
import { parseLlmJson } from "./parse-llm-json";

describe("parseLlmJson", () => {
  it("parses a plain JSON object", () => {
    expect(parseLlmJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    expect(parseLlmJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips plain ``` fences", () => {
    expect(parseLlmJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("handles leading/trailing whitespace", () => {
    expect(parseLlmJson('  \n  {"a":1}  \n  ')).toEqual({ a: 1 });
  });

  it("throws with the model text on invalid JSON", () => {
    expect(() => parseLlmJson("Dit document is geen jaaropgave.")).toThrow(
      "Dit document is geen jaaropgave."
    );
  });

  it("throws a fallback message on empty input", () => {
    expect(() => parseLlmJson("")).toThrow("Model heeft geen gestructureerde data teruggegeven");
  });

  it("throws a fallback message on whitespace-only input", () => {
    expect(() => parseLlmJson("   \n  ")).toThrow(
      "Model heeft geen gestructureerde data teruggegeven"
    );
  });

  it("parses an array", () => {
    expect(parseLlmJson("[1,2,3]")).toEqual([1, 2, 3]);
  });
});
