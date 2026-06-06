"use client";

import { useState, useEffect } from "react";

export function useApiKeyStorage(isEnvKey: boolean): [string, (v: string) => void] {
  const [apiKey, setApiKey] = useState<string>(process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? "");

  useEffect(() => {
    if (isEnvKey) return;
    const stored = sessionStorage.getItem("apiKey");
    if (stored) setApiKey(stored);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isEnvKey && apiKey) sessionStorage.setItem("apiKey", apiKey);
  }, [apiKey, isEnvKey]);

  return [apiKey, setApiKey];
}
