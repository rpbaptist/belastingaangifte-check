"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
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

// ─── Upload zone ──────────────────────────────────────────────────────────────

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
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
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
      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
        dragging
          ? "border-blue-500 bg-blue-50"
          : files.length
            ? "border-green-500 bg-green-50"
            : "border-gray-300 hover:border-gray-400 bg-gray-50"
      }`}
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
        onChange={handleChange}
      />
      <p className="font-semibold text-gray-800">{label}</p>
      <p className="text-sm text-gray-500 mt-1">{hint}</p>

      {files.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 justify-center">
          {files.map((f) => (
            <li
              key={f.name}
              className="text-sm text-green-700 bg-white border border-green-200 rounded px-3 py-1"
            >
              {f.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Report sections ──────────────────────────────────────────────────────────

function SectionHeader({ icon, title, count }: { icon: string; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xl">{icon}</span>
      <h2 className="font-semibold text-gray-900 text-lg">{title}</h2>
      <span className="ml-auto text-sm text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
        {count}
      </span>
    </div>
  );
}

function CoveredSection({ items }: { items: CoveredItem[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-6">
      <SectionHeader icon="✅" title="Gedekt" count={items.length} />
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <div className="flex justify-between items-start gap-4">
              <div>
                <p className="font-medium text-gray-800 text-sm">{item.field}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {item.institution}
                  {item.accountNumber && ` · ${item.accountNumber}`}
                </p>
              </div>
              <p className="text-sm font-semibold text-green-700 shrink-0">
                {formatEuro(item.amountTaxReturn)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MissingStatementSection({ items }: { items: MissingStatementItem[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-6">
      <SectionHeader icon="⚠️" title="Jaaropgave ontbreekt" count={items.length} />
      <p className="text-sm text-gray-600 mb-3">
        Deze posten staan in je aangifte maar er is geen bijbehorende jaaropgave geüpload.
      </p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <div className="flex justify-between items-start gap-4">
              <div>
                <p className="font-medium text-gray-800 text-sm">{item.field}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Box {item.box}
                  {item.accountNumber && ` · ${item.accountNumber}`}
                </p>
              </div>
              <p className="text-sm font-semibold text-amber-700 shrink-0">
                {formatEuro(item.amount)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NotFilledInSection({ items }: { items: NotFilledInItem[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-6">
      <SectionHeader icon="📝" title="Niet ingevuld in aangifte" count={items.length} />
      <p className="text-sm text-gray-600 mb-3">
        Deze rekeningen staan in je jaaropgaves maar lijken te ontbreken in je aangifte.
      </p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <div className="flex justify-between items-start gap-4">
              <div>
                <p className="font-medium text-gray-800 text-sm">{item.description}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {item.institution}
                  {item.accountNumber && ` · ${item.accountNumber}`}
                </p>
              </div>
              <p className="text-sm font-semibold text-blue-700 shrink-0">
                {formatEuro(item.amount)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

type Message = { role: "user" | "assistant"; content: string };

const markdownComponents = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="my-1 first:mt-0 last:mb-0" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="my-1 pl-5 list-disc space-y-0.5" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="my-1 pl-5 list-decimal space-y-0.5" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => <li className="leading-snug" {...props} />,
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold" {...props} />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => <em className="italic" {...props} />,
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="underline text-purple-700 hover:text-purple-900"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code className="bg-purple-100 text-purple-900 px-1 py-0.5 rounded text-[0.85em]" {...props} />
  ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="bg-purple-50 border border-purple-100 rounded p-2 my-2 overflow-x-auto text-xs"
      {...props}
    />
  ),
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-base font-semibold mt-2 mb-1" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-sm font-semibold mt-2 mb-1" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-sm font-semibold mt-2 mb-1" {...props} />
  ),
};

function AttentionPointCard({
  item,
  taxYear,
}: {
  item: AttentionPoint;
  taxYear: number;
}) {
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
      setHistory((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: data.answer },
      ]);
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

  const buttonLabel = open
    ? "Verberg gesprek"
    : history.length > 0
      ? "Bekijk gesprek"
      : "Stel een vraag";

  return (
    <div
      className={`rounded-lg px-4 py-3 border ${
        resolved ? "bg-gray-50 border-gray-200 opacity-70" : "bg-purple-50 border-purple-200"
      }`}
    >
      <p
        className={`font-semibold text-sm ${
          resolved ? "text-gray-500 line-through" : "text-gray-800"
        }`}
      >
        {item.title}
      </p>
      <p
        className={`text-sm mt-1 ${
          resolved ? "text-gray-500 line-through" : "text-gray-700"
        }`}
      >
        {item.explanation}
      </p>
      {(item.institution || item.accountNumber) && (
        <p className="text-xs text-gray-500 mt-1">
          {[item.institution, item.accountNumber].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-purple-700 hover:text-purple-900 font-medium"
        >
          {buttonLabel}
        </button>
        {history.length === 0 && (
          <button
            type="button"
            onClick={handleMoreDetail}
            disabled={loading}
            className="text-xs text-purple-700 hover:text-purple-900 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? "Bezig…" : "Meer uitleg"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setResolved((v) => !v)}
          className="text-xs text-purple-700 hover:text-purple-900 font-medium ml-auto"
        >
          {resolved ? "Markeer als open" : "Markeer als opgelost"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {history.map((msg, i) => (
            <div
              key={i}
              className={`text-sm rounded-lg px-3 py-2 ${
                msg.role === "user"
                  ? "bg-purple-100 text-gray-700 whitespace-pre-wrap"
                  : "bg-white border border-purple-100 text-gray-800"
              }`}
            >
              {msg.role === "user" ? (
                msg.content
              ) : (
                <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
              )}
            </div>
          ))}

          {loading && (
            <div className="text-xs text-gray-400 italic px-1">Bezig met antwoorden…</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-2">
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
              rows={2}
              className="w-full text-sm text-gray-900 placeholder:text-gray-400 border border-purple-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
            />
            <button
              type="submit"
              disabled={!question.trim() || loading}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Bezig…" : "Verstuur"}
            </button>
          </form>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}

    </div>
  );
}

function AttentionPointsSection({
  items,
  taxYear,
}: {
  items: AttentionPoint[];
  taxYear: number;
}) {
  if (!items.length) return null;
  return (
    <section className="mb-6">
      <SectionHeader icon="💡" title="Aandachtspunten" count={items.length} />
      <div className="space-y-3">
        {items.map((item, i) => (
          <AttentionPointCard key={i} item={item} taxYear={taxYear} />
        ))}
      </div>
    </section>
  );
}

function ExtractionErrorsSection({ errors }: { errors: ExtractionError[] }) {
  if (!errors.length) return null;
  return (
    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      <p className="font-semibold text-red-800 text-sm mb-2">
        Extractie mislukt voor {errors.length === 1 ? "één bestand" : `${errors.length} bestanden`}
      </p>
      <ul className="space-y-1">
        {errors.map((e, i) => (
          <li key={i} className="text-sm text-red-700">
            <span className="font-medium">{e.filename}</span>: {e.error}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Report({ report }: { report: AnalysisReport }) {
  const hasResults =
    report.covered.length +
      report.missingStatement.length +
      report.notFilledIn.length +
      report.attentionPoints.length >
    0;

  return (
    <div className="mt-8">
      <div className="flex items-baseline gap-3 mb-6">
        <h2 className="text-xl font-bold text-gray-900">Resultaat</h2>
        <span className="text-sm text-gray-500">Belastingjaar {report.taxYear}</span>
      </div>

      <ExtractionErrorsSection errors={report.extractionErrors} />

      {hasResults ? (
        <>
          <CoveredSection items={report.covered} />
          <MissingStatementSection items={report.missingStatement} />
          <NotFilledInSection items={report.notFilledIn} />
          <AttentionPointsSection items={report.attentionPoints} taxYear={report.taxYear} />
        </>
      ) : (
        <p className="text-gray-500 text-sm">Geen resultaten gevonden.</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
        annualStatements: jaaropgaves.map((f, i) => ({
          data: statementBase64s[i],
          filename: f.name,
        })),
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
        additionalStatements: additionalJaaropgaves.map((f, i) => ({
          data: statementBase64s[i],
          filename: f.name,
        })),
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
      setIncrementalError(
        err instanceof Error ? err.message : "Er is een onbekende fout opgetreden."
      );
    } finally {
      setIncrementalLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Aangifte Checker</h1>
          <p className="text-gray-500 mt-2">
            Upload je belastingaangifte en jaaropgaves. De checker vergelijkt de bedragen en geeft aan
            wat klopt, wat ontbreekt, en waar je op moet letten.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
              hint="Sleep één of meerdere jaaropgave PDFs hierheen (ING, Rabobank, DEGIRO, hypotheek, …)"
              accept="application/pdf"
              multiple={true}
              files={jaaropgaves}
              onFiles={(incoming) => setJaaropgaves((prev) => [...prev, ...incoming])}
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3 px-6 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Bezig met analyseren…" : "Analyseren"}
          </button>
        </form>

        {loading && (
          <div className="mt-8 text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 mt-3">Documenten worden geanalyseerd…</p>
            <p className="text-sm text-gray-400 mt-1">Dit duurt ongeveer 30–60 seconden.</p>
          </div>
        )}

        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {report && <Report report={report} />}

        {report && (
          <div className="mt-8 border-t border-gray-200 pt-8">
            <h2 className="font-semibold text-gray-900 mb-1">Jaaropgave vergeten?</h2>
            <p className="text-sm text-gray-500 mb-4">
              Upload een vergeten jaaropgave. Alleen de nieuwe bestanden worden opnieuw verwerkt.
            </p>
            <form onSubmit={handleIncremental} className="space-y-3">
              <DropZone
                label="Aanvullende jaaropgaves"
                hint="Sleep de vergeten jaaropgave PDFs hierheen"
                accept="application/pdf"
                multiple={true}
                files={additionalJaaropgaves}
                onFiles={(incoming) =>
                  setAdditionalJaaropgaves((prev) => [...prev, ...incoming])
                }
              />
              <button
                type="submit"
                disabled={!canSubmitIncremental}
                className="w-full py-3 px-6 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {incrementalLoading ? "Bezig met verwerken…" : "Analyseer aanvulling"}
              </button>
            </form>

            {incrementalLoading && (
              <div className="mt-6 text-center">
                <div className="inline-block w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-600 mt-2 text-sm">Aanvullende jaaropgave wordt verwerkt…</p>
              </div>
            )}

            {incrementalError && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-red-800">{incrementalError}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
