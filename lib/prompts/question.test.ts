import { describe, expect, it } from "vitest";
import { buildQuestionMessages } from "./question";

describe("buildQuestionMessages", () => {
  it("builds a single user message with the context and question when there is no history", () => {
    const messages = buildQuestionMessages(
      "Moet ik dit opgeven?",
      { title: "Hypotheekrente", explanation: "Rente niet in aangifte" },
      2024,
      [],
      "nl"
    );

    expect(messages).toEqual([
      {
        role: "user",
        content:
          '## Aandachtspunt (belastingjaar 2024)\n\n{\n  "title": "Hypotheekrente",\n  "explanation": "Rente niet in aangifte"\n}\n\n## Vraag\n\nMoet ik dit opgeven?',
      },
    ]);
  });

  it("prepends the context to the first history entry and appends the new question", () => {
    const history: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: "Wat betekent dit?" },
      { role: "assistant", content: "Dit betekent dat..." },
    ];

    const messages = buildQuestionMessages(
      "En wat nu?",
      { title: "Hypotheekrente", explanation: "Rente niet in aangifte" },
      2024,
      history,
      "nl"
    );

    expect(messages).toEqual([
      {
        role: "user",
        content:
          '## Aandachtspunt (belastingjaar 2024)\n\n{\n  "title": "Hypotheekrente",\n  "explanation": "Rente niet in aangifte"\n}\n\n## Vraag\n\nWat betekent dit?',
      },
      { role: "assistant", content: "Dit betekent dat..." },
      { role: "user", content: "En wat nu?" },
    ]);
  });

  it("uses English headings when language is 'en'", () => {
    const messages = buildQuestionMessages(
      "Do I need to report this?",
      { title: "x", explanation: "y" },
      2024,
      [],
      "en"
    );

    expect(messages[0].content).toContain("## Attention Point (tax year 2024)");
    expect(messages[0].content).toContain("## Question");
  });
});
