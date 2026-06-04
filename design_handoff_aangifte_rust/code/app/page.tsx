"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Icon } from "./Icon";
import type {
  AnalysisReport,
  AnalyseRequest,
  AnalyseResponse,
  CoveredItem,
  MissingStatementItem,
  NotFilledInItem,
  AttentionPoint,
  ExtractionError,
  ExtractedData,
  IncrementalRequest,
  QuestionRequest,
  QuestionResponse,
} from "@/lib/types";

/* ─── Helpers (unchanged) ─────────────────────────────────────────────────── */

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatEuro(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/* ─── Brand / app bar ─────────────────────────────────────────────────────── */

function TopBar({ onReset }: { onReset?: () => void }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <div className="logo">
            <Icon name="shield" size={19} />
          </div>
          <div>
            <div className="wm">Aangifte Checker</div>
            <div className="sub">Belastingjaar 2024</div>
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

/* ─── Upload zone (restyled; same drag/drop behavior) ─────────────────────── */

function DropZone({
  label,
  hint,
  accept,
  multiple,
  files,
  onFiles,
}: {
  label: string;
  hint: string;
  accept: string;
  multiple: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (!dropped.length) return;
    onFiles(multiple ? dropped : [dropped[0]]);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;
    onFiles(multiple ? picked : [picked[0]]);
    e.target.value = "";
  }

  return (
    <div
      className={`drop${dragging ? " dragging" : ""}${files.length ? " filled" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        style={{ display: "none" }}
        onChange={handleChange}
      />
      <div className="dropic">
        <Icon name={files.length ? "check" : "upload"} size={20} />
      </div>
      <div className="dl">{label}</div>
      <div className="dh">{hint}</div>
      {files.length > 0 && (
        <ul>
          {files.map((f) => (
            <li key={f.name} className="fchip ok">
              <Icon name="file" size={13} /> {f.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Markdown styling for assistant answers ──────────────────────────────── */

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

/* ─── Summary boxes ───────────────────────────────────────────────────────── */

type Tone = "pos" | "warn" | "info" | "attn";

function SummaryBoxes({ report }: { report: AnalysisReport }) {
  const items: { tone: Tone; icon: Parameters<typeof Icon>[0]["name"]; count: number; label: string }[] = [
    { tone: "pos", icon: "check", count: report.covered.length, label: "Gedekt" },
    { tone: "warn", icon: "alert", count: report.missingStatement.length, label: "Jaaropgave ontbreekt" },
    { tone: "info", icon: "file-plus", count: report.notFilledIn.length, label: "Niet ingevuld" },
    { tone: "attn", icon: "flag", count: report.attentionPoints.length, label: "Aandachtspunten" },
  ];
  return (
    <div className="statrow" style={{ marginTop: 18 }}>
      {items.map((s) => (
        <div key={s.label} className={`stat tone-${s.tone}`}>
          <div className="stat-top">
            <span className="chip">
              <Icon name={s.icon} size={17} />
            </span>
            <div className="n num">{s.count}</div>
          </div>
          <div className="l">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Comparison sections ─────────────────────────────────────────────────── */

function Section({
  tone,
  icon,
  title,
  count,
  note,
  children,
}: {
  tone: Tone;
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  count: number;
  note?: string;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className={`sec tone-${tone}`}>
      <div className="sechead">
        <span className="chip">
          <Icon name={icon} size={16} />
        </span>
        <div>
          <div className="t">{title}</div>
          {note && <div className="note">{note}</div>}
        </div>
        <span className="pill num">{count}</span>
      </div>
      {children}
    </div>
  );
}

function Row({ f, m, a, tone }: { f: string; m: string; a: string; tone: Tone }) {
  return (
    <div className="irow">
      <div style={{ minWidth: 0 }}>
        <div className="f">{f}</div>
        <div className="m">{m}</div>
      </div>
      <div className="a num" style={{ color: `var(--${tone})` }}>
        {a}
      </div>
    </div>
  );
}

function CoveredSection({ items }: { items: CoveredItem[] }) {
  return (
    <Section tone="pos" icon="check" title="Gedekt" count={items.length} note="Aangifte en jaaropgave komen overeen">
      {items.map((c, i) => (
        <Row key={i} tone="pos" f={c.field} m={`${c.institution} · ${c.accountNumber}`} a={formatEuro(c.amountTaxReturn)} />
      ))}
    </Section>
  );
}

function MissingStatementSection({ items }: { items: MissingStatementItem[] }) {
  return (
    <Section
      tone="warn"
      icon="alert"
      title="Jaaropgave ontbreekt"
      count={items.length}
      note="Staat in je aangifte, geen jaaropgave geüpload"
    >
      {items.map((c, i) => (
        <Row key={i} tone="warn" f={c.field} m={`Box ${c.box}${c.accountNumber ? ` · ${c.accountNumber}` : ""}`} a={formatEuro(c.amount)} />
      ))}
    </Section>
  );
}

function NotFilledInSection({ items }: { items: NotFilledInItem[] }) {
  return (
    <Section
      tone="info"
      icon="file-plus"
      title="Niet ingevuld in aangifte"
      count={items.length}
      note="Staat in je jaaropgaves, ontbreekt in aangifte"
    >
      {items.map((c, i) => (
        <Row key={i} tone="info" f={c.description} m={`${c.institution} · ${c.accountNumber}`} a={formatEuro(c.amount)} />
      ))}
    </Section>
  );
}

/* ─── Aandachtspunt card (logic preserved, restyled) ──────────────────────── */

type Message = { role: "user" | "assistant"; content: string };

function AttentionPointCard({ item, taxYear }: { item: AttentionPoint; taxYear: number }) {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `Server error ${res.status}`);
      }
      const data: QuestionResponse = await res.json();
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
              {msg.role === "user" ? (
                msg.content
              ) : (
                <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
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
      <span className="ic">
        <Icon name="alert" size={18} />
      </span>
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

  const canSubmit = aangifte.length > 0 && jaaropgaves.length > 0 && !loading;
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
        annualStatements: jaaropgaves.map((f, i) => ({ data: statementBase64s[i], filename: f.name })),
      };
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `Server error ${res.status}`);
      }
      const data: AnalyseResponse = await res.json();
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
        additionalStatements: additionalJaaropgaves.map((f, i) => ({ data: statementBase64s[i], filename: f.name })),
      };
      const res = await fetch("/api/analyze/incremental", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `Server error ${res.status}`);
      }
      const data: AnalyseResponse = await res.json();
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

  /* ── Upload view (no report yet) ── */
  if (!report) {
    return (
      <>
        <TopBar />
        <main className="page">
          <h1 className="h1" style={{ marginTop: 14 }}>Klopt je aangifte?</h1>
          <p className="intro">
            Upload je belastingaangifte en jaaropgaves. We vergelijken de bedragen en laten rustig zien wat
            klopt, wat ontbreekt en waar je op moet letten.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="icard" style={{ padding: 16, marginTop: 26 }}>
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
              <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>Dit duurt ongeveer 30–60 seconden.</p>
            </div>
          )}

          {error && (
            <div className="errcard" style={{ marginTop: 20 }}>
              <span className="ic"><Icon name="alert" size={18} /></span>
              <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: 0 }}>{error}</p>
            </div>
          )}

          <p className="disc">Alleen voor demo — controleer altijd zelf alle informatie.</p>
        </main>
      </>
    );
  }

  /* ── Results view (report present) ── */
  const statementCount = extractedData?.annualStatements.length ?? jaaropgaves.length;
  return (
    <>
      <TopBar onReset={handleReset} />
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
            <aside className="col-side">
              <div>
                <div className="ahead">
                  <span className="ic">
                    <Icon name="flag" size={18} />
                  </span>
                  <h2>Aandachtspunten</h2>
                  <span className="pill num">{report.attentionPoints.length}</span>
                </div>
                <div className="stack" style={{ marginTop: 14 }}>
                  {report.attentionPoints.map((p, i) => (
                    <AttentionPointCard key={i} item={p} taxYear={report.taxYear} />
                  ))}
                </div>
              </div>
              {IncrementalCard}
            </aside>
          )}
        </div>

        <p className="disc">Alleen voor demo — controleer altijd zelf alle informatie.</p>
      </main>
    </>
  );
}
