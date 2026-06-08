"use client";

import { useState } from "react";
import type { AttentionPoint, ChatMessage, QuestionRequest } from "@/lib/types";
import { QuestionResponseSchema, ApiErrorSchema } from "@/lib/schemas";
import { authHeaders } from "@/lib/apiUtils";

export function useChatQuestion(
  item: AttentionPoint,
  taxYear: number,
  apiKey: string,
  initialMessages: ChatMessage[] = []
) {
  const [history, setHistory] = useState<ChatMessage[]>(initialMessages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendQuestion(text: string): Promise<boolean> {
    if (!text.trim() || loading) return false;
    setLoading(true);
    setError(null);
    try {
      const body: QuestionRequest = { question: text, attentionPoint: item, taxYear, history };
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = ApiErrorSchema.parse(await res.json().catch(() => ({})));
        throw new Error(error ?? `Serverfout ${res.status}`);
      }
      const data = QuestionResponseSchema.parse(await res.json());
      setHistory((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: data.answer },
      ]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er is een fout opgetreden.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  return { history, loading, error, sendQuestion };
}
