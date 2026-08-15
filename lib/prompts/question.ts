import type Anthropic from "@anthropic-ai/sdk";
import type { AttentionPoint } from "../types";
import type { Language } from "../translations";

const QUESTION_SYSTEM_NL = `Je bent een Nederlandse belastingadviseur. Je beantwoordt vragen over aandachtspunten die zijn gevonden in een belastingaangifte-analyse.

Richtlijnen:
- Antwoord altijd in het Nederlands
- Wees beknopt en praktisch — maximaal 3 alinea's
- Geef concrete vervolgstappen waar van toepassing
- Als iets afhankelijk is van persoonlijke omstandigheden, geef dan aan welke informatie nodig is
- Verwijs niet naar je eigen beperkingen als AI — geef gewoon het beste advies`;

const QUESTION_SYSTEM_EN = `You are a Dutch tax advisor. You answer questions about attention points found in a tax return analysis.

Guidelines:
- Always respond in English
- Be concise and practical — maximum 3 paragraphs
- Give concrete next steps where applicable
- If something depends on personal circumstances, indicate what information is needed
- Don't refer to your own limitations as an AI — just give the best advice`;

export function buildQuestionSystem(language: Language = "nl"): string {
  return language === "en" ? QUESTION_SYSTEM_EN : QUESTION_SYSTEM_NL;
}

export function buildQuestionMessages(
  question: string,
  attentionPoint: AttentionPoint,
  taxYear: number,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  language: Language
): Anthropic.MessageParam[] {
  const contextHeading =
    language === "en"
      ? `Attention Point (tax year ${taxYear})`
      : `Aandachtspunt (belastingjaar ${taxYear})`;
  const questionHeading = language === "en" ? "Question" : "Vraag";
  const context = `## ${contextHeading}\n\n${JSON.stringify(attentionPoint, null, 2)}`;

  return history.length
    ? [
        { role: "user", content: `${context}\n\n## ${questionHeading}\n\n${history[0].content}` },
        ...history.slice(1).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: question },
      ]
    : [{ role: "user", content: `${context}\n\n## ${questionHeading}\n\n${question}` }];
}
