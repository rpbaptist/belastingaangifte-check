import { NextRequest, NextResponse } from "next/server";
import { classifyError } from "@/lib/anthropic-error";
import type { QuestionRequest, QuestionResponse } from "@/lib/types";
import { buildQuestionSystem } from "@/lib/prompts/question";
import { createClient, QUESTION_MODEL } from "@/lib/llm";
import { translate, type Language } from "@/lib/translations";
import type Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const language: Language = request.headers.get("x-language") === "en" ? "en" : "nl";

  let body: QuestionRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: translate("invalidRequest", language) }, { status: 400 });
  }

  const apiKey = request.headers.get("x-api-key") ?? undefined;
  const client = createClient(apiKey);
  const { question, attentionPoint, taxYear, history } = body;

  if (!question?.trim()) {
    return NextResponse.json({ error: translate("noQuestionReceived", language) }, { status: 400 });
  }

  const contextHeading =
    language === "en"
      ? `Attention Point (tax year ${taxYear})`
      : `Aandachtspunt (belastingjaar ${taxYear})`;
  const questionHeading = language === "en" ? "Question" : "Vraag";
  const context = `## ${contextHeading}\n\n${JSON.stringify(attentionPoint, null, 2)}`;

  const messages: Anthropic.MessageParam[] = history.length
    ? [
        { role: "user", content: `${context}\n\n## ${questionHeading}\n\n${history[0].content}` },
        ...history.slice(1).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: question },
      ]
    : [{ role: "user", content: `${context}\n\n## ${questionHeading}\n\n${question}` }];

  try {
    const response = await client.messages.create({
      model: QUESTION_MODEL,
      max_tokens: 1024,
      system: [
        { type: "text", text: buildQuestionSystem(language), cache_control: { type: "ephemeral" } },
      ],
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: translate("noAnswerReceived", language) }, { status: 500 });
    }

    const result: QuestionResponse = { answer: textBlock.text };
    return NextResponse.json(result);
  } catch (err) {
    const { status, message } = classifyError(err, language);
    return NextResponse.json({ error: message }, { status });
  }
}
