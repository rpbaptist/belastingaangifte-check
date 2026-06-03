import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export function handleAnthropicError(err: unknown): NextResponse {
  if (err instanceof Anthropic.AuthenticationError) {
    return NextResponse.json({ error: "Ongeldige API-sleutel" }, { status: 401 });
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return NextResponse.json({ error: "Geen toegang met deze API-sleutel" }, { status: 403 });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return NextResponse.json(
      { error: "Te veel verzoeken, probeer het later opnieuw" },
      { status: 429 }
    );
  }
  if (err instanceof Anthropic.APIError && err.status >= 500) {
    return NextResponse.json(
      { error: "Anthropic-serverfout, probeer het later opnieuw" },
      { status: 502 }
    );
  }
  const message = err instanceof Error ? err.message : "Er is een onbekende fout opgetreden";
  return NextResponse.json({ error: message }, { status: 500 });
}
