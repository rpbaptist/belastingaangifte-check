// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAnalysis } from "./useAnalysis";

describe("useAnalysis", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {}))
    );
  });

  it("aborts the previous in-flight request when analyze is triggered again", async () => {
    const { result } = renderHook(() => useAnalysis("test-key", "nl"));
    const file = new File(["content"], "aangifte.pdf");

    await act(async () => {
      result.current.analyze(file, []);
    });

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    const firstSignal = mockFetch.mock.calls[0][1].signal as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    await act(async () => {
      result.current.analyze(file, []);
    });

    expect(firstSignal.aborted).toBe(true);
  });

  it("aborts the previous in-flight request when analyzeIncremental is triggered again", async () => {
    const { result } = renderHook(() => useAnalysis("test-key", "nl"));

    // Seed extractedData so analyzeIncremental doesn't bail out early.
    const seedResponse = {
      report: {
        taxYear: 2023,
        covered: [],
        missingStatement: [],
        notFilledIn: [],
        attentionPoints: [],
        extractionErrors: [],
      },
      extractedData: {
        taxReturn: { taxYear: 2023, entries: [] },
        annualStatements: [],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(seedResponse), { status: 200 })))
    );
    const seedFile = new File(["content"], "aangifte.pdf");
    await act(async () => {
      await result.current.analyze(seedFile, []);
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {}))
    );
    const file = new File(["content"], "jaaropgave.pdf");

    await act(async () => {
      result.current.analyzeIncremental([file]);
    });

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    const firstSignal = mockFetch.mock.calls[0][1].signal as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    await act(async () => {
      result.current.analyzeIncremental([file]);
    });

    expect(firstSignal.aborted).toBe(true);
  });

  it("does not clobber loading state when a stale aborted request settles after a newer one has started", async () => {
    let rejectFirst!: (reason: unknown) => void;
    const firstFetch = new Promise<Response>((_, reject) => {
      rejectFirst = reject;
    });
    const secondFetch = new Promise<Response>(() => {});
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstFetch)
      .mockImplementationOnce(() => secondFetch);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAnalysis("test-key", "nl"));
    const file = new File(["content"], "aangifte.pdf");

    await act(async () => {
      result.current.analyze(file, []);
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      result.current.analyze(file, []);
      rejectFirst(new DOMException("Aborted", "AbortError"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(true);
  });
});
