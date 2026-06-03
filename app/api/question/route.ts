import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { QuestionRequest, QuestionResponse } from "@/lib/types";

export const maxDuration = 60;

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `Je bent een Nederlandse belastingadviseur. Je beantwoordt vragen over aandachtspunten die zijn gevonden in een belastingaangifte-analyse.

Richtlijnen:
- Antwoord altijd in het Nederlands
- Wees beknopt en praktisch — maximaal 3 alinea's
- Geef concrete vervolgstappen waar van toepassing
- Als iets afhankelijk is van persoonlijke omstandigheden, geef dan aan welke informatie nodig is
- Verwijs niet naar je eigen beperkingen als AI — geef gewoon het beste advies`;

export async function POST(request: NextRequest) {
  let body: QuestionRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const apiKey = request.headers.get("x-api-key") ?? undefined;
  const client = new Anthropic(apiKey ? { apiKey } : {});
  const { question, attentionPoint, taxYear, history } = body;

  if (!question?.trim()) {
    return NextResponse.json({ error: "Geen vraag ontvangen" }, { status: 400 });
  }

  const context = `## Aandachtspunt (belastingjaar ${taxYear})\n\n${JSON.stringify(attentionPoint, null, 2)}`;

  const messages: Anthropic.MessageParam[] = history.length
    ? [
        { role: "user", content: `${context}\n\n## Vraag\n\n${history[0].content}` },
        ...history.slice(1).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: question },
      ]
    : [{ role: "user", content: `${context}\n\n## Vraag\n\n${question}` }];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages,
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json({ error: "Geen antwoord ontvangen" }, { status: 500 });
  }

  const result: QuestionResponse = { answer: textBlock.text };
  return NextResponse.json(result);
}
