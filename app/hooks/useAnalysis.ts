"use client";

import { useState, useRef, useEffect } from "react";
import type { AnalysisReport, ExtractedData } from "@/lib/types";
import { AnalyseResponseSchema, ApiErrorSchema } from "@/lib/schemas";
import { authHeaders, languageHeaders } from "@/lib/apiUtils";
import { translate, type Language } from "@/lib/translations";

export function useAnalysis(apiKey: string, language: Language) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incrementalLoading, setIncrementalLoading] = useState(false);
  const [incrementalError, setIncrementalError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function analyze(aangifte: File, jaaropgaves: File[]) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setReport(null);
    setExtractedData(null);
    setError(null);
    try {
      const body = new FormData();
      body.append("taxReturn", aangifte);
      for (const f of jaaropgaves) {
        body.append("annualStatements", f);
      }
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { ...authHeaders(apiKey), ...languageHeaders(language) },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        const { error: msg } = ApiErrorSchema.parse(await res.json().catch(() => ({})));
        throw new Error(msg ?? `${translate("serverErrorPrefix", language)} ${res.status}`);
      }
      const data = AnalyseResponseSchema.parse(await res.json());
      setReport(data.report);
      setExtractedData(data.extractedData);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : translate("clientUnknownError", language));
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }

  async function analyzeIncremental(files: File[]): Promise<void> {
    if (!extractedData) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIncrementalLoading(true);
    setIncrementalError(null);
    try {
      const body = new FormData();
      for (const f of files) {
        body.append("annualStatements", f);
      }
      body.append("extractedData", JSON.stringify(extractedData));
      const res = await fetch("/api/analyze/incremental", {
        method: "POST",
        headers: { ...authHeaders(apiKey), ...languageHeaders(language) },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        const { error: msg } = ApiErrorSchema.parse(await res.json().catch(() => ({})));
        throw new Error(msg ?? `${translate("serverErrorPrefix", language)} ${res.status}`);
      }
      const data = AnalyseResponseSchema.parse(await res.json());
      setReport(data.report);
      setExtractedData(data.extractedData);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setIncrementalError(
        err instanceof Error ? err.message : translate("clientUnknownError", language)
      );
    } finally {
      if (abortRef.current === controller) setIncrementalLoading(false);
    }
  }

  function reset() {
    abortRef.current?.abort();
    setReport(null);
    setExtractedData(null);
    setError(null);
  }

  return {
    loading,
    report,
    extractedData,
    error,
    incrementalLoading,
    incrementalError,
    analyze,
    analyzeIncremental,
    reset,
  };
}
