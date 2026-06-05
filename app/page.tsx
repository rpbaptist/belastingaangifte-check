"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Icon } from "./Icon";
import { ApiKeyInput } from "./components/ApiKeyInput";
import { DropZone } from "./components/DropZone";
import { SummaryBoxes, CoveredSection, MissingStatementSection, NotFilledInSection } from "./components/ReportSections";
import type {
  AnalysisReport,
  AnalyseRequest,
  AttentionPoint,
  ExtractionError,
  ExtractedData,
  IncrementalRequest,
  QuestionRequest,
} from "@/lib/types";
import { AnalyseResponseSchema, ApiErrorSchema, QuestionResponseSchema } from "@/lib/schemas";

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

/* ─── Brand / app bar ─────────────────────────────────────────────────────── */

function TopBar({ taxYear, onReset }: { taxYear?: number; onReset?: () => void }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <div className="logo">
            <Icon name="shield" size={19} />
          </div>
          <div>
            <div className="wm">Aangifte Checker</div>
            {taxYear && <div className="sub">Belastingjaar {taxYear}</div>}
          </div>
        </div>
        <div className="spacer" />
        {onReset && (
          <button className="ghostbtn" onClick={onReset}>
            <Icon name="refresh" size={15} /> <span className="lbl">Opnieuw analyseren</span>
          </button>
        )}
      </div>
    </header>
  );
}

/* ─── Markdown ────────────────────────────────────────────────────────────── */

const markdownComponents = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => <p style={{ margin: "0.25em 0" }} {...props} />,
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => <ul style={{ margin: "0.25em 0", paddingLeft: "1.2em" }} {...props} />,
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => <ol style={{ margin: "0.25em 0", paddingLeft: "1.2em" }} {...props} />,
  strong: (props: React.HTMLAttributes<HTMLElement>) => <strong {...props} />,
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a target="_blank" rel="noreferrer" {...props} />,
  code: (props: React.HTMLAttributes<HTMLElement>) => <code {...props} />,
};

/* ─── Aandachtspunt card ──────────────────────────────────────────────────── */

type Message = { role: "user" | "assistant"; content: string };

function AttentionPointCard({ item, taxYear, apiKey }: { item: AttentionPoint; taxYear: number; apiKey: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  async function sendQuestion(text: string): Promise<boolean> {
    if (!text.trim() || loading) return false;
    setLoading(true);
    setError(null);
    try {
      const body: QuestionRequest = { question: text, attentionPoint: item, taxYear, history };
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = ApiErrorSchema.parse(await res.json().catch(() => ({})));
        throw new Error(error ?? `Serverfout ${res.status}`);
      }
      const data = QuestionResponseSchema.parse(await res.json());
      setHistory((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: data.answer }]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er is een fout opgetreden.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await sendQuestion(question);
    if (ok) setQuestion("");
  }

  async function handleMoreDetail() {
    setOpen(true);
    await sendQuestion("Geef een uitgebreidere uitleg over dit aandachtspunt.");
  }

  const toggleLabel = open ? "Verberg gesprek" : history.length > 0 ? "Bekijk gesprek" : "Stel een vraag";

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
            <div className="meta">{[item.institution, item.accountNumber].filter(Boolean).join(" · ")}</div>
          )}
        </div>
      </div>

      <div className="actions">
        <button className="gbtn" onClick={() => setOpen((v) => !v)}>
          <Icon name="message" size={14} /> {toggleLabel}
        </button>
        {history.length === 0 && (
          <button className="gbtn" onClick={handleMoreDetail} disabled={loading}>
            {loading ? "Bezig…" : "Meer uitleg"}
          </button>
        )}
        <button className={`gbtn mute${resolved ? " on" : ""}`} onClick={() => setResolved((v) => !v)}>
          <Icon name="check-circle" size={14} /> {resolved ? "Opgelost" : "Markeer als opgelost"}
        </button>
      </div>

      {open && (
        <div className="thread">
          {history.map((msg, i) => (
            <div key={i} className={`bubble ${msg.role === "user" ? "u" : "a"}`}>
              {msg.role === "user" ? msg.content : (
                <ReactMarkdown components={markdownComponents} rehypePlugins={[rehypeSanitize]}>{msg.content}</ReactMarkdown>
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
                  void handleSubmit(e);
                }
              }}
              placeholder={history.length > 0 ? "Vervolgvraag…" : "Typ je vraag…"}
              rows={1}
            />
            <button type="submit" disabled={!question.trim() || loading} aria-label="Verstuur">
              <Icon name="send" size={16} />
            </button>
          </form>
          {error && <p style={{ fontSize: 12, color: "var(--warn)", margin: "4px 2px 0" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

/* ─── Extraction errors ───────────────────────────────────────────────────── */

function ExtractionErrors({ errors }: { errors: ExtractionError[] }) {
  if (!errors.length) return null;
  return (
    <div className="errcard" style={{ marginBottom: 18 }}>
      <span className="ic"><Icon name="alert" size={18} /></span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          Extractie mislukt voor {errors.length === 1 ? "één bestand" : `${errors.length} bestanden`}
        </div>
        <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none" }}>
          {errors.map((e, i) => (
            <li key={i} className="mono" style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2 }}>
              {e.filename} — {e.error}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function Home() {
  const [aangifte, setAangifte] = useState<File[]>([]);
  const [jaaropgaves, setJaaropgaves] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [additionalJaaropgaves, setAdditionalJaaropgaves] = useState<File[]>([]);
  const [incrementalLoading, setIncrementalLoading] = useState(false);
  const [incrementalError, setIncrementalError] = useState<string | null>(null);

  const isEnvKey = !!process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
  const [apiKey, setApiKey] = useState<string>(process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? "");
  useEffect(() => {
    if (isEnvKey) return;
    const stored = sessionStorage.getItem("apiKey");
    if (stored) setApiKey(stored);
  }, []);
  useEffect(() => {
    if (!isEnvKey) sessionStorage.setItem("apiKey", apiKey);
  }, [apiKey]);

  const canSubmit = aangifte.length > 0 && jaaropgaves.length > 0 && apiKey.length > 0 && !loading;
  const canSubmitIncremental = additionalJaaropgaves.length > 0 && !incrementalLoading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setReport(null);
    setExtractedData(null);
    setAdditionalJaaropgaves([]);
    setError(null);
    try {
      const [taxReturnBase64, ...statementBase64s] = await Promise.all([
        fileToBase64(aangifte[0]),
        ...jaaropgaves.map(fileToBase64),
      ]);
      const body: AnalyseRequest = {
        taxReturn: taxReturnBase64,
        taxReturnFilename: aangifte[0].name,
        annualStatements: jaaropgaves.map((f, i) => ({
          data: statementBase64s[i],
          filename: f.name,
        })),
      };
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = ApiErrorSchema.parse(await res.json().catch(() => ({})));
        throw new Error(error ?? `Serverfout ${res.status}`);
      }
      const data = AnalyseResponseSchema.parse(await res.json());
      setReport(data.report);
      setExtractedData(data.extractedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er is een onbekende fout opgetreden.");
    } finally {
      setLoading(false);
    }
  }

  async function handleIncremental(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitIncremental || !extractedData) return;
    setIncrementalLoading(true);
    setIncrementalError(null);
    try {
      const statementBase64s = await Promise.all(additionalJaaropgaves.map(fileToBase64));
      const body: IncrementalRequest = {
        extractedData,
        additionalStatements: additionalJaaropgaves.map((f, i) => ({
          data: statementBase64s[i],
          filename: f.name,
        })),
      };
      const res = await fetch("/api/analyze/incremental", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = ApiErrorSchema.parse(await res.json().catch(() => ({})));
        throw new Error(error ?? `Serverfout ${res.status}`);
      }
      const data = AnalyseResponseSchema.parse(await res.json());
      setReport(data.report);
      setExtractedData(data.extractedData);
      setAdditionalJaaropgaves([]);
    } catch (err) {
      setIncrementalError(err instanceof Error ? err.message : "Er is een onbekende fout opgetreden.");
    } finally {
      setIncrementalLoading(false);
    }
  }

  function handleReset() {
    setReport(null);
    setExtractedData(null);
    setError(null);
  }

  const hasAttn = !!report && report.attentionPoints.length > 0;

  const IncrementalCard = (
    <div className="icard">
      <h2 style={{ fontSize: 15.5, fontWeight: 600, margin: "0 0 3px" }}>Jaaropgave vergeten?</h2>
      <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "0 0 14px" }}>
        Upload een vergeten jaaropgave. Alleen de nieuwe bestanden worden opnieuw verwerkt.
      </p>
      <form onSubmit={handleIncremental}>
        <DropZone
          label="Aanvullende jaaropgaves"
          hint="Sleep de vergeten PDF's hierheen, of klik om te bladeren"
          accept="application/pdf"
          multiple
          files={additionalJaaropgaves}
          onFiles={(incoming) => setAdditionalJaaropgaves((prev) => [...prev, ...incoming])}
        />
        <button className="btn alt" type="submit" disabled={!canSubmitIncremental} style={{ marginTop: 14 }}>
          {incrementalLoading ? "Bezig met verwerken…" : "Analyseer aanvulling"} <Icon name="arrow" size={16} />
        </button>
      </form>
      {incrementalError && (
        <p style={{ fontSize: 12.5, color: "var(--warn)", marginTop: 10 }}>{incrementalError}</p>
      )}
    </div>
  );

  /* ── Upload view ── */
  if (!report) {
    return (
      <>
        <TopBar />
        <main className="page">
          <h1 className="h1" style={{ marginTop: 14 }}>Klopt je aangifte?</h1>
          <p className="intro">
            Upload je belastingaangifte en jaaropgaves. We vergelijken de bedragen en laten zien wat
            klopt, wat ontbreekt en waar je op moet letten.
          </p>

          <div style={{
            marginTop: 20,
            padding: "12px 14px",
            background: "var(--paper-2)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            fontSize: 12.5,
            color: "var(--ink-3)",
            lineHeight: 1.6,
          }}>
            <strong style={{ color: "var(--ink-2)" }}>Let op: demo, geen privacygarantie.</strong>{" "}
            De inhoud van je PDF&#39;s, inclusief je BSN, IBANs en financiële gegevens, wordt
            verstuurd naar de{" "}
            <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--bronze)" }}>
              Anthropic API
            </a>{" "}
            voor verwerking. Anthropic bewaart API-data standaard tot 30 dagen. Gebruik dit
            hulpmiddel uitsluitend voor eigen testdoeleinden en deel geen gegevens van anderen.
            Controleer altijd zelf de resultaten of raadpleeg een financieel adviseur.
          </div>

          <form onSubmit={handleSubmit}>
            <div className="icard" style={{ padding: 16, marginTop: 16 }}>
              <ApiKeyInput value={apiKey} onChange={setApiKey} isEnvKey={isEnvKey} />
              <div style={{ display: "grid", gap: 12 }}>
                <DropZone
                  label="Belastingaangifte"
                  hint="Sleep je aangifte PDF hierheen, of klik om te bladeren"
                  accept="application/pdf"
                  multiple={false}
                  files={aangifte}
                  onFiles={setAangifte}
                />
                <DropZone
                  label="Jaaropgaves"
                  hint="Sleep één of meerdere PDF's hierheen — ING, Rabobank, DEGIRO, hypotheek …"
                  accept="application/pdf"
                  multiple
                  files={jaaropgaves}
                  onFiles={(incoming) => setJaaropgaves((prev) => [...prev, ...incoming])}
                />
              </div>
            </div>

            <button className="btn" type="submit" disabled={!canSubmit} style={{ marginTop: 18 }}>
              {loading ? "Bezig met analyseren…" : "Analyseren"} <Icon name="arrow" size={17} />
            </button>
          </form>

          {loading && (
            <div style={{ textAlign: "center", marginTop: 30 }}>
              <div className="spin" />
              <p style={{ fontSize: 14, fontWeight: 600, margin: "14px 0 2px" }}>Documenten worden geanalyseerd…</p>
              <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>Dit kan een paar minuten duren.</p>
            </div>
          )}

          {error && (
            <div className="errcard" style={{ marginTop: 20 }}>
              <span className="ic"><Icon name="alert" size={18} /></span>
              <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: 0 }}>{error}</p>
            </div>
          )}
        </main>
      </>
    );
  }

  /* ── Results view ── */
  const statementCount = extractedData?.annualStatements.length ?? jaaropgaves.length;
  return (
    <>
      <TopBar taxYear={report.taxYear} onReset={handleReset} />
      <main className="page">
        {/* uploaded files strip */}
        <div className="files">
          <div className="grp">
            <span className="lab">Aangifte</span>
            <span className="fchip ok">
              <Icon name="check" size={13} /> {aangifte[0]?.name ?? "aangifte.pdf"}
            </span>
          </div>
          <div className="grp">
            <span className="lab">Jaaropgaves</span>
            {jaaropgaves.map((f) => (
              <span key={f.name} className="fchip">
                <Icon name="file" size={13} /> {f.name}
              </span>
            ))}
          </div>
          <button className="edit" onClick={handleReset}>
            <Icon name="plus" size={14} /> Wijzig
          </button>
        </div>

        {/* results header */}
        <div style={{ marginTop: 30 }}>
          <div className="eyebrow">Resultaat</div>
          <h1 className="h-res">Je controle is klaar</h1>
          <p className="h-sub">
            {statementCount} {statementCount === 1 ? "jaaropgave" : "jaaropgaves"} vergeleken met je aangifte
            over {report.taxYear}.
          </p>
        </div>

        <ExtractionErrors errors={report.extractionErrors} />
        <SummaryBoxes report={report} />

        {/* report body */}
        <div className={`body${hasAttn ? "" : " single"}`} style={{ marginTop: 24 }}>
          <div className="col-main">
            <div className="stack">
              <CoveredSection items={report.covered} />
              <MissingStatementSection items={report.missingStatement} />
              <NotFilledInSection items={report.notFilledIn} />
            </div>
            {!hasAttn && IncrementalCard}
          </div>

          {hasAttn && (
            <aside id="section-aandachtspunten" className="col-side">
              <div>
                <div className="ahead">
                  <span className="ic"><Icon name="flag" size={18} /></span>
                  <h2>Aandachtspunten</h2>
                  <span className="pill num">{report.attentionPoints.length}</span>
                </div>
                <div className="stack" style={{ marginTop: 14 }}>
                  {report.attentionPoints.map((p, i) => (
                    <AttentionPointCard key={i} item={p} taxYear={report.taxYear} apiKey={apiKey} />
                  ))}
                </div>
              </div>
              {IncrementalCard}
            </aside>
          )}
        </div>
      </main>
    </>
  );
}
