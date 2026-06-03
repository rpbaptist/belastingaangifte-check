"use client";

import { useState, useEffect } from "react";
import { TopBar } from "./components/TopBar";
import { DropZone } from "./components/DropZone";
import { ApiKeyInput } from "./components/ApiKeyInput";
import { ErrorCard, ExtractionErrors } from "./components/ErrorCard";
import { AttentionPointCard } from "./components/AttentionPointCard";
import {
  SummaryBoxes,
  CoveredSection,
  MissingStatementSection,
  NotFilledInSection,
} from "./components/ReportSections";
import { Icon } from "./Icon";
import type {
  AnalysisReport,
  AnalyseRequest,
  ExtractedData,
  IncrementalRequest,
} from "@/lib/types";
import { AnalyseResponseSchema, ApiErrorSchema } from "@/lib/schemas";

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
  const [apiKey, setApiKey] = useState<string>(
    process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? ""
  );
  useEffect(() => {
    const stored = sessionStorage.getItem("apiKey");
    if (stored) setApiKey(stored);
  }, []);
  useEffect(() => {
    sessionStorage.setItem("apiKey", apiKey);
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
      setIncrementalError(
        err instanceof Error ? err.message : "Er is een onbekende fout opgetreden."
      );
    } finally {
      setIncrementalLoading(false);
    }
  }

  function handleReset() {
    setReport(null);
    setExtractedData(null);
    setError(null);
  }

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
        <button
          className="btn alt"
          type="submit"
          disabled={!canSubmitIncremental}
          style={{ marginTop: 14 }}
        >
          {incrementalLoading ? "Bezig met verwerken…" : "Analyseer aanvulling"}{" "}
          <Icon name="arrow" size={16} />
        </button>
      </form>
      {incrementalError && <ErrorCard message={incrementalError} style={{ marginTop: 12 }} />}
    </div>
  );

  if (!report) {
    return (
      <>
        <TopBar />
        <main className="page">
          <h1 className="h1" style={{ marginTop: 14 }}>
            Klopt je aangifte?
          </h1>
          <p className="intro">
            Upload je belastingaangifte en jaaropgaves. We vergelijken de bedragen en laten zien wat
            klopt, wat ontbreekt en waar je op moet letten.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="icard" style={{ padding: 16, marginTop: 26 }}>
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
            <div
              role="status"
              aria-label="Bezig met analyseren"
              style={{ textAlign: "center", marginTop: 30 }}
            >
              <div className="spin" />
              <p style={{ fontSize: 14, fontWeight: 600, margin: "14px 0 2px" }}>
                Documenten worden geanalyseerd…
              </p>
              <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>
                Dit kan een paar minuten duren.
              </p>
            </div>
          )}

          {error && <ErrorCard message={error} style={{ marginTop: 20 }} />}

          <p className="disc">Alleen voor demo — controleer altijd zelf alle informatie.</p>
        </main>
      </>
    );
  }

  const statementCount = extractedData?.annualStatements.length ?? jaaropgaves.length;
  const hasAttn = report.attentionPoints.length > 0;

  return (
    <>
      <TopBar taxYear={report.taxYear} onReset={handleReset} />
      <main className="page">
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

        <div style={{ marginTop: 30 }}>
          <div className="eyebrow">Resultaat</div>
          <h1 className="h-res">Je controle is klaar</h1>
          <p className="h-sub">
            {statementCount} {statementCount === 1 ? "jaaropgave" : "jaaropgaves"} vergeleken met je
            aangifte over {report.taxYear}.
          </p>
        </div>

        <ExtractionErrors errors={report.extractionErrors} />

        <SummaryBoxes report={report} />

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
                  {report.attentionPoints.map((p) => (
                    <AttentionPointCard
                      key={p.title}
                      item={p}
                      taxYear={report.taxYear}
                      apiKey={apiKey}
                    />
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
