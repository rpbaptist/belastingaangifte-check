"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Icon } from "@/app/Icon";
import type { AttentionPoint, ChatMessage } from "@/lib/types";
import { useChatQuestion } from "@/app/hooks/useChatQuestion";

const markdownComponents = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p style={{ margin: "0.25em 0" }} {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul style={{ margin: "0.25em 0", paddingLeft: "1.2em" }} {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol style={{ margin: "0.25em 0", paddingLeft: "1.2em" }} {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => <strong {...props} />,
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a target="_blank" rel="noreferrer" {...props} />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => <code {...props} />,
};

export function AttentionPointCard({
  item,
  taxYear,
  apiKey,
  initialMessages = [],
}: {
  item: AttentionPoint;
  taxYear: number;
  apiKey: string;
  initialMessages?: ChatMessage[];
}) {
  const [open, setOpen] = useState(initialMessages.length > 0);
  const [question, setQuestion] = useState("");
  const [resolved, setResolved] = useState(false);
  const { history, loading, error, sendQuestion } = useChatQuestion(
    item,
    taxYear,
    apiKey,
    initialMessages
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await sendQuestion(question);
    if (ok) setQuestion("");
  }

  async function handleMoreDetail() {
    setOpen(true);
    await sendQuestion("Geef een uitgebreidere uitleg over dit aandachtspunt.");
  }

  const toggleLabel = open
    ? "Verberg gesprek"
    : history.length > 0
      ? "Bekijk gesprek"
      : "Stel een vraag";

  return (
    <div className={`acard${resolved ? " resolved" : ""}`}>
      <div className="head">
        <span className="chip">
          <Icon name={resolved ? "check" : "flag"} size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t">{item.title}</div>
          <div className="x">{item.explanation}</div>
          {(item.institution || item.accountNumber) && (
            <div className="meta">
              {[item.institution, item.accountNumber].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>

      <div className="actions">
        <button className="gbtn" onClick={() => setOpen((v) => !v)}>
          <Icon name="message" size={14} /> {toggleLabel}
        </button>
        {history.length === 0 && initialMessages.length === 0 && (
          <button className="gbtn" onClick={handleMoreDetail} disabled={loading}>
            {loading ? "Bezig…" : "Meer uitleg"}
          </button>
        )}
        <button
          className={`gbtn mute${resolved ? " on" : ""}`}
          onClick={() => setResolved((v) => !v)}
        >
          <Icon name="check-circle" size={14} /> {resolved ? "Opgelost" : "Markeer als opgelost"}
        </button>
      </div>

      {open && (
        <div className="thread">
          {history.map((msg, i) => (
            <div key={`${msg.role}-${i}`} className={`bubble ${msg.role === "user" ? "u" : "a"}`}>
              {msg.role === "user" ? (
                msg.content
              ) : (
                <ReactMarkdown components={markdownComponents} rehypePlugins={[rehypeSanitize]}>
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
          ))}
          {loading && <div className="typing">Bezig met antwoorden…</div>}
          <form className="chatin" onSubmit={handleSubmit}>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void sendQuestion(question).then((ok) => {
                    if (ok) setQuestion("");
                  });
                }
              }}
              placeholder={history.length > 0 ? "Vervolgvraag…" : "Typ je vraag…"}
              rows={1}
            />
            <button type="submit" disabled={!question.trim() || loading} aria-label="Verstuur">
              <Icon name="send" size={16} />
            </button>
          </form>
          {error && (
            <p style={{ fontSize: 12, color: "var(--warn)", margin: "4px 2px 0" }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
