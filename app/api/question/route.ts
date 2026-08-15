import { NextRequest, NextResponse } from "next/server";
import { classifyError } from "@/lib/anthropic-error";
import type { QuestionRequest, QuestionResponse } from "@/lib/types";
import { buildQuestionMessages, buildQuestionSystem } from "@/lib/prompts/question";
import { createClient, extractResponseText, QUESTION_MODEL } from "@/lib/llm";
import { translate, type Language } from "@/lib/translations";

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

  const messages = buildQuestionMessages(question, attentionPoint, taxYear, history, language);

  try {
    const response = await client.messages.create({
      model: QUESTION_MODEL,
      max_tokens: 1024,
      system: [
        { type: "text", text: buildQuestionSystem(language), cache_control: { type: "ephemeral" } },
      ],
      messages,
    });

    const text = extractResponseText(response);
    if (!text) {
      return NextResponse.json({ error: translate("noAnswerReceived", language) }, { status: 500 });
    }

    const result: QuestionResponse = { answer: text };
    return NextResponse.json(result);
  } catch (err) {
    const { status, message } = classifyError(err, language);
    return NextResponse.json({ error: message }, { status });
  }
}
