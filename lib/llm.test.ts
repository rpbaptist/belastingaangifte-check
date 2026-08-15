import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { extractResponseText } from "./llm";

function makeResponse(content: Anthropic.Message["content"]): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5-20251001",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
    content,
  } as Anthropic.Message;
}

describe("extractResponseText", () => {
  it("returns the text of the first text block", () => {
    const response = makeResponse([{ type: "text", text: "Het antwoord is...", citations: null }]);
    expect(extractResponseText(response)).toBe("Het antwoord is...");
  });

  it("returns undefined when the response has no text block", () => {
    const response = makeResponse([
      { type: "tool_use", id: "toolu_1", name: "lookup", input: {} },
    ] as unknown as Anthropic.Message["content"]);
    expect(extractResponseText(response)).toBeUndefined();
  });

  it("returns an empty string rather than undefined for an empty text block", () => {
    const response = makeResponse([{ type: "text", text: "", citations: null }]);
    expect(extractResponseText(response)).toBe("");
  });
});
