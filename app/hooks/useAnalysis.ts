"use client";

import { useState, useRef, useEffect } from "react";
import type { AnalysisReport, AnalyseRequest, ExtractedData, IncrementalRequest } from "@/lib/types";
import { AnalyseResponseSchema, ApiErrorSchema } from "@/lib/schemas";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Bestand kon niet worden gelezen"));
        return;
      }
      resolve(reader.result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function authHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { "x-api-key": apiKey } : {};
}

export function useAnalysis(apiKey: string) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incrementalLoading, setIncrementalLoading] = useState(false);
  const [incrementalError, setIncrementalError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function analyze(aangifte: File, jaaropgaves: File[]) {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setReport(null);
    setExtractedData(null);
    setError(null);
    try {
      const [taxReturnBase64, ...statementBase64s] = await Promise.all([
        fileToBase64(aangifte),
        ...jaaropgaves.map(fileToBase64),
      ]);
      const body: AnalyseRequest = {
        taxReturn: taxReturnBase64,
        taxReturnFilename: aangifte.name,
        annualStatements: jaaropgaves.map((f, i) => ({
          data: statementBase64s[i],
          filename: f.name,
        })),
      };
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const { error: msg } = ApiErrorSchema.parse(await res.json().catch(() => ({})));
        throw new Error(msg ?? `Serverfout ${res.status}`);
      }
      const data = AnalyseResponseSchema.parse(await res.json());
      setReport(data.report);
      setExtractedData(data.extractedData);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Er is een onbekende fout opgetreden.");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeIncremental(files: File[]): Promise<boolean | undefined> {
    if (!extractedData) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIncrementalLoading(true);
    setIncrementalError(null);
    try {
      const statementBase64s = await Promise.all(files.map(fileToBase64));
      const body: IncrementalRequest = {
        extractedData,
        additionalStatements: files.map((f, i) => ({
          data: statementBase64s[i],
          filename: f.name,
        })),
      };
      const res = await fetch("/api/analyze/incremental", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const { error: msg } = ApiErrorSchema.parse(await res.json().catch(() => ({})));
        throw new Error(msg ?? `Serverfout ${res.status}`);
      }
      const data = AnalyseResponseSchema.parse(await res.json());
      setReport(data.report);
      setExtractedData(data.extractedData);
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setIncrementalError(err instanceof Error ? err.message : "Er is een onbekende fout opgetreden.");
    } finally {
      setIncrementalLoading(false);
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
