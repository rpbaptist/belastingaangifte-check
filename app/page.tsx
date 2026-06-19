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
import { useDemoMode } from "./hooks/useDemoMode";
import { useApiKeyStorage } from "./hooks/useApiKeyStorage";
import { useTranslation } from "./hooks/useTranslation";
import { IncrementalCard } from "./components/IncrementalCard";
import { AnalysisProgress } from "./components/AnalysisProgress";
import { DemoProvider } from "./contexts/DemoContext";

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function Home() {
  const { t, language } = useTranslation();
  const [aangifte, setAangifte] = useState<File | null>(null);
  const [jaaropgaves, setJaaropgaves] = useState<File[]>([]);

  const isEnvKey = !!process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
  const [apiKey, setApiKey] = useApiKeyStorage(isEnvKey);

  const demo = useDemoMode();
  const analysis = useAnalysis(apiKey, language);
  const { loading, error, incrementalLoading, incrementalError } = analysis;
  const report = demo.active ? demo.report : analysis.report;
  const extractedData = demo.active ? demo.extractedData : analysis.extractedData;

  function handleLoadDemo() {
    analysis.reset();
    demo.load();
  }

  function handleReset() {
    analysis.reset();
    demo.reset();
  }

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
        <TopBar onDemo={handleLoadDemo} />
        <main className="page-upload">
          <div className="upload-card">
            {/* LEFT: hero */}
            <div className="upload-hero">
              <h1 className="h1">{t("heroTitle")}</h1>
              <p className="intro">{t("heroIntro")}</p>
              <div className="notice">
                <strong>{t("privacyWarningStrong")}</strong> {t("privacyNoticeBefore")}{" "}
                <a
                  href="https://www.anthropic.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("anthropicApiLinkText")}
                </a>{" "}
                {t("privacyNoticeAfter")}
              </div>
            </div>

            {/* RIGHT: form */}
            <div className="upload-form">
              <ApiKeyInput value={apiKey} onChange={setApiKey} isEnvKey={isEnvKey} />
              <div className="dropzone-grid">
                <DropZone
                  label={t("taxReturnLabel")}
                  hint={t("taxReturnDropHint")}
                  accept="application/pdf"
                  multiple={false}
                  files={aangifte ? [aangifte] : []}
                  onFiles={(incoming) => setAangifte(incoming[0] ?? null)}
                />
                <DropZone
                  label={t("annualStatementsLabel")}
                  hint={t("annualStatementsDropHint")}
                  accept="application/pdf"
                  multiple
                  files={jaaropgaves}
                  onFiles={(incoming) => setJaaropgaves((prev) => [...prev, ...incoming])}
                />
              </div>
              <form onSubmit={handleSubmit}>
                <button className="btn" type="submit" disabled={!canSubmit}>
                  {loading ? t("analyzing") : t("analyze")} <Icon name="arrow" size={16} />
                </button>
              </form>
              <AnalysisProgress loading={loading} />
              {error && <ErrorCard message={error} className="upload-error" />}
            </div>
          </div>
        </main>
        <footer className="github-footer">
          <a
            href="https://github.com/rpbaptist/belastingaangifte-check"
            target="_blank"
            rel="noopener noreferrer"
            className="ghostbtn"
            aria-label={t("githubAriaLabel")}
          >
            <Icon name="github" size={15} /> GitHub
          </a>
        </footer>
      </>
    );
  }

  /* ── Results view ── */
  const statementCount = demo.active
    ? 4
    : (extractedData?.annualStatements.length ?? jaaropgaves.length);
  const hasAttn = report.attentionPoints.length > 0;

  return (
    <DemoProvider value={demo.active}>
      <TopBar taxYear={demo.active ? undefined : report.taxYear} onReset={handleReset} />
      <main className="page">
        {!demo.active && (
          <div className="files">
            <div className="grp">
              <span className="lab">{t("filesAangifteLabel")}</span>
              <span className="fchip ok">
                <Icon name="check" size={13} /> {aangifte?.name ?? t("defaultTaxReturnFilename")}
              </span>
            </div>
            <div className="grp">
              <span className="lab">{t("filesJaaropgavesLabel")}</span>
              {jaaropgaves.map((f) => (
                <span key={f.name} className="fchip">
                  <Icon name="file" size={13} /> {f.name}
                </span>
              ))}
            </div>
            <button className="edit" onClick={handleReset}>
              <Icon name="plus" size={14} /> {t("editFiles")}
            </button>
          </div>
        )}

        <div className="res-header">
          <div className="eyebrow">{t("resultEyebrow")}</div>
          <h1 className="h-res">{t("resultTitle")}</h1>
          <p className="h-sub">
            {statementCount}{" "}
            {statementCount === 1 ? t("annualStatementSingular") : t("annualStatementPlural")}{" "}
            {t("comparedWithYourTaxReturnFor")} {report.taxYear}.
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
            {!hasAttn && !demo.active && (
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
                  <h2>{t("attentionPointsLabel")}</h2>
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
              {!demo.active && (
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
      <footer className="github-footer">
        <a
          href="https://github.com/rpbaptist/belastingaangifte-check"
          target="_blank"
          rel="noopener noreferrer"
          className="ghostbtn"
          aria-label={t("githubAriaLabel")}
        >
          <Icon name="github" size={15} /> GitHub
        </a>
      </footer>
    </DemoProvider>
  );
}
