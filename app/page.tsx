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

/* ─── Incremental upload card ─────────────────────────────────────────────── */

function IncrementalCard({
  loading,
  error,
  onSubmit,
}: {
  loading: boolean;
  error: string | null;
  onSubmit: (files: File[]) => Promise<boolean | undefined>;
}) {
  const [files, setFiles] = useState<File[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length || loading) return;
    const ok = await onSubmit(files);
    if (ok) setFiles([]);
  }

  return (
    <div className="icard">
      <h2 style={{ fontSize: 15.5, fontWeight: 600, margin: "0 0 3px" }}>Jaaropgave vergeten?</h2>
      <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "0 0 14px" }}>
        Upload een vergeten jaaropgave. Alleen de nieuwe bestanden worden opnieuw verwerkt.
      </p>
      <form onSubmit={handleSubmit}>
        <DropZone
          label="Aanvullende jaaropgaves"
          hint="Sleep de vergeten PDF's hierheen, of klik om te bladeren"
          accept="application/pdf"
          multiple
          files={files}
          onFiles={(incoming) => setFiles((prev) => [...prev, ...incoming])}
        />
        <button
          className="btn alt"
          type="submit"
          disabled={!files.length || loading}
          style={{ marginTop: 14 }}
        >
          {loading ? "Bezig met verwerken…" : "Analyseer aanvulling"}{" "}
          <Icon name="arrow" size={16} />
        </button>
      </form>
      {error && <p style={{ fontSize: 12.5, color: "var(--warn)", marginTop: 10 }}>{error}</p>}
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function Home() {
  const [aangifte, setAangifte] = useState<File[]>([]);
  const [jaaropgaves, setJaaropgaves] = useState<File[]>([]);

  const isEnvKey = !!process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
  const [apiKey, setApiKey] = useApiKeyStorage(isEnvKey);

  const analysis = useAnalysis(apiKey);
  const { loading, report, extractedData, error, incrementalLoading, incrementalError } = analysis;

  const canSubmit = aangifte.length > 0 && jaaropgaves.length > 0 && apiKey.length > 0 && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await analysis.analyze(aangifte[0], jaaropgaves);
  }

  /* ── Upload view ── */
  if (!report) {
    return (
      <main className="page-upload">
        <div className="upload-card">

          {/* LEFT: hero */}
          <div className="upload-hero">
            <div className="brand" style={{ marginBottom: 32 }}>
              <div className="logo"><Icon name="shield" size={18} /></div>
              <span className="wm">Aangifte Checker</span>
            </div>
            <h1 className="h1">Klopt je aangifte?</h1>
            <p className="intro">
              Upload je belastingaangifte en jaaropgaves. We vergelijken de bedragen en laten zien
              wat klopt, wat ontbreekt en waar je op moet letten.
            </p>
            <div className="notice">
              <strong style={{ color: "var(--ink-2)" }}>Let op: demo, geen privacygarantie.</strong>{" "}
              De inhoud van je PDF&#39;s, inclusief je BSN, IBANs en financiële gegevens, wordt
              verstuurd naar de{" "}
              <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer"
                 style={{ color: "var(--bronze)" }}>Anthropic API</a>{" "}
              voor verwerking. Anthropic bewaart API-data standaard tot 30 dagen. Gebruik dit
              hulpmiddel uitsluitend voor eigen testdoeleinden en deel geen gegevens van anderen.
              Controleer altijd zelf de resultaten of raadpleeg een financieel adviseur.
            </div>
          </div>

          {/* RIGHT: form */}
          <div className="upload-form">
            <ApiKeyInput value={apiKey} onChange={setApiKey} isEnvKey={isEnvKey} />
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              <DropZone
                label="Belastingaangifte"
                hint="Sleep je aangifte PDF hierheen, of klik om te bladeren"
                accept="application/pdf" multiple={false}
                files={aangifte} onFiles={setAangifte}
              />
              <DropZone
                label="Jaaropgaves"
                hint="Sleep één of meerdere PDF's hierheen — ING, Rabobank, DEGIRO, hypotheek …"
                accept="application/pdf" multiple
                files={jaaropgaves}
                onFiles={(incoming) => setJaaropgaves((prev) => [...prev, ...incoming])}
              />
            </div>
            <form onSubmit={handleSubmit}>
              <button className="btn" type="submit" disabled={!canSubmit}>
                {loading ? "Bezig met analyseren…" : "Analyseren"}{" "}
                <Icon name="arrow" size={16} />
              </button>
            </form>
            {loading && (
              <div style={{ textAlign: "center", marginTop: 24 }}>
                <div className="spin" />
                <p style={{ fontSize: 14, fontWeight: 600, margin: "12px 0 2px" }}>
                  Documenten worden geanalyseerd…
                </p>
                <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>
                  Dit kan een paar minuten duren.
                </p>
              </div>
            )}
            {error && <ErrorCard message={error} style={{ marginTop: 20 }} />}
          </div>

        </div>
      </main>
    );
  }

  /* ── Results view ── */
  const statementCount = extractedData?.annualStatements.length ?? jaaropgaves.length;
  const hasAttn = report.attentionPoints.length > 0;

  return (
    <>
      <TopBar taxYear={report.taxYear} onReset={analysis.reset} />
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
          <button className="edit" onClick={analysis.reset}>
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
            {!hasAttn && (
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
              <IncrementalCard
                loading={incrementalLoading}
                error={incrementalError}
                onSubmit={analysis.analyzeIncremental}
              />
            </aside>
          )}
        </div>
      </main>
    </>
  );
}
