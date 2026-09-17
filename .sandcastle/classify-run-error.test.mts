import { describe, it, expect } from "vitest";
import {
  classifyRunError,
  CheckpointTimeoutError,
  formatCheckpointDuration,
} from "./classify-run-error.mts";

describe("classifyRunError", () => {
  it("classifies a CheckpointTimeoutError as checkpoint-timeout", () => {
    expect(classifyRunError(new CheckpointTimeoutError(90 * 60 * 1000))).toBe("checkpoint-timeout");
  });

  it("classifies any other Error as other", () => {
    expect(classifyRunError(new Error("sandbox exploded"))).toBe("other");
  });

  it("classifies a non-Error thrown value as other", () => {
    expect(classifyRunError("some string rejection")).toBe("other");
    expect(classifyRunError(undefined)).toBe("other");
    expect(classifyRunError({ message: "looks like an error but isn't one" })).toBe("other");
  });

  it("classifies an unrelated AbortError as other (not our ceiling)", () => {
    expect(classifyRunError(new DOMException("aborted", "AbortError"))).toBe("other");
  });
});

describe("formatCheckpointDuration", () => {
  it("formats milliseconds as whole minutes", () => {
    expect(formatCheckpointDuration(90 * 60 * 1000)).toBe("90m");
    expect(formatCheckpointDuration(60 * 1000)).toBe("1m");
  });
});

describe("CheckpointTimeoutError", () => {
  it("embeds the sentinel and duration in its message", () => {
    const err = new CheckpointTimeoutError(5400000);
    expect(err.message).toContain("RALPH_CHECKPOINT_TIMEOUT_HIT");
    expect(err.message).toContain("90m");
    expect(err.message).toContain("5400000ms");
  });
});
