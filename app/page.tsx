"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { ApiKeyInput } from "./components/ApiKeyInput";
import { DropZone } from "./components/DropZone";
import { TopBar } from "./components/TopBar";
import { AttentionPointCard } from "./components/AttentionPointCard";
import { ErrorCard, ExtractionErrors } from "./components/ErrorCard";
import {
  SummaryBoxes,
  CoveredSection,
  MissingStatementSection,
  NotFilledInSection,
} from "./components/ReportSections";
import { useAnalysis } from "./hooks/useAnalysis";
import { useApiKeyStorage } from "./hooks/useApiKeyStorage";
import { IncrementalCard } from "./components/IncrementalCard";
import { AnalysisProgress } from "./components/AnalysisProgress";
import { DemoProvider } from "./contexts/DemoContext";

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function Home() {
  const [aangifte, setAangifte] = useState<File | null>(null);
  const [jaaropgaves, setJaaropgaves] = useState<File[]>([]);

  const isEnvKey = !!process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
  const [apiKey, setApiKey] = useApiKeyStorage(isEnvKey);

  const analysis = useAnalysis(apiKey);
  const { loading, report, extractedData, error, incrementalLoading, incrementalError, isDemo } =
    analysis;

  const canSubmit = aangifte !== null && jaaropgaves.length > 0 && apiKey.length > 0 && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!aangifte) return;
    if (!canSubmit) return;
    await analysis.analyze(aangifte, jaaropgaves);
  }

  /* ── Upload view ── */
  if (!report) {
    return (
      <>
        <TopBar onDemo={analysis.loadDemo} />
        <main className="page-upload">
          <div className="upload-card">
            {/* LEFT: hero */}
            <div className="upload-hero">
              <h1 className="h1">Klopt je aangifte?</h1>
              <p className="intro">
                Upload je belastingaangifte en jaaropgaves. De bedragen worden vergeleken en je ziet
                wat klopt, wat ontbreekt en waar je op moet letten.
              </p>
              <div className="notice">
                <strong>Let op: demo, geen privacygarantie.</strong> De inhoud van je PDF&#39;s,
                inclusief je BSN, IBANs en financiële gegevens, wordt verstuurd naar de{" "}
                <a
                  href="https://www.anthropic.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Anthropic API
                </a>{" "}
                voor verwerking. Anthropic bewaart API-data standaard tot 30 dagen. Gebruik dit
                hulpmiddel uitsluitend voor eigen testdoeleinden en deel geen gegevens van anderen.
                Controleer altijd zelf de resultaten of raadpleeg een financieel adviseur.
              </div>
            </div>

            {/* RIGHT: form */}
            <div className="upload-form">
              <ApiKeyInput value={apiKey} onChange={setApiKey} isEnvKey={isEnvKey} />
              <div className="dropzone-grid">
                <DropZone
                  label="Belastingaangifte"
                  hint="Sleep je aangifte PDF hierheen, of klik om te bladeren"
                  accept="application/pdf"
                  multiple={false}
                  files={aangifte ? [aangifte] : []}
                  onFiles={(incoming) => setAangifte(incoming[0] ?? null)}
                />
                <DropZone
                  label="Jaaropgaves"
                  hint="Sleep één of meerdere PDF's hierheen of klik om te bladeren."
                  accept="application/pdf"
                  multiple
                  files={jaaropgaves}
                  onFiles={(incoming) => setJaaropgaves((prev) => [...prev, ...incoming])}
                />
              </div>
              <form onSubmit={handleSubmit}>
                <button className="btn" type="submit" disabled={!canSubmit}>
                  {loading ? "Bezig met analyseren…" : "Analyseren"} <Icon name="arrow" size={16} />
                </button>
              </form>
              <AnalysisProgress loading={loading} />
              {error && <ErrorCard message={error} className="upload-error" />}
            </div>
          </div>
        </main>
      </>
    );
  }

  /* ── Results view ── */
  const statementCount = isDemo
    ? 4
    : (extractedData?.annualStatements.length ?? jaaropgaves.length);
  const hasAttn = report.attentionPoints.length > 0;

  return (
    <DemoProvider value={isDemo}>
      <TopBar taxYear={isDemo ? undefined : report.taxYear} onReset={analysis.reset} />
      <main className="page">
        {!isDemo && (
          <div className="files">
            <div className="grp">
              <span className="lab">Aangifte</span>
              <span className="fchip ok">
                <Icon name="check" size={13} /> {aangifte?.name ?? "aangifte.pdf"}
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
            <button className="edit" onClick={analysis.reset}>
              <Icon name="plus" size={14} /> Wijzig
            </button>
          </div>
        )}

        <div className="res-header">
          <div className="eyebrow">Resultaat</div>
          <h1 className="h-res">Je controle is klaar</h1>
          <p className="h-sub">
            {statementCount} {statementCount === 1 ? "jaaropgave" : "jaaropgaves"} vergeleken met je
            aangifte over {report.taxYear}.
          </p>
        </div>

        <ExtractionErrors errors={report.extractionErrors} />
        <SummaryBoxes report={report} />

        <div className={`body${hasAttn ? "" : " single"}`}>
          <div className="col-main">
            <div className="stack">
              <CoveredSection items={report.covered} />
              <MissingStatementSection items={report.missingStatement} />
              <NotFilledInSection items={report.notFilledIn} />
            </div>
            {!hasAttn && !isDemo && (
              <IncrementalCard
                loading={incrementalLoading}
                error={incrementalError}
                onSubmit={analysis.analyzeIncremental}
              />
            )}
          </div>

          {hasAttn && (
            <aside id="section-aandachtspunten" className="col-side">
              <div>
                <div className="ahead">
                  <span className="ic">
                    <Icon name="flag" size={18} />
                  </span>
                  <h2>Aandachtspunten</h2>
                  <span className="pill num">{report.attentionPoints.length}</span>
                </div>
                <div className="stack">
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
              {!isDemo && (
                <IncrementalCard
                  loading={incrementalLoading}
                  error={incrementalError}
                  onSubmit={analysis.analyzeIncremental}
                />
              )}
            </aside>
          )}
        </div>
      </main>
    </DemoProvider>
  );
}
