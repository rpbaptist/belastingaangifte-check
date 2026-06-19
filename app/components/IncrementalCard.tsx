"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "../Icon";
import { DropZone } from "./DropZone";
import { AnalysisProgress } from "./AnalysisProgress";
import { useTranslation } from "@/app/hooks/useTranslation";

export function IncrementalCard({
  loading,
  error,
  onSubmit,
}: {
  loading: boolean;
  error: string | null;
  onSubmit: (files: File[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const prevLoading = useRef(false);

  useEffect(() => {
    if (prevLoading.current && !loading && !error) {
      setFiles([]);
    }
    prevLoading.current = loading;
  }, [loading, error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length || loading) return;
    await onSubmit(files);
  }

  return (
    <div className="icard">
      <h2>{t("forgotStatementTitle")}</h2>
      <p className="icard-desc">{t("forgotStatementDesc")}</p>
      <form onSubmit={handleSubmit}>
        <DropZone
          label={t("additionalStatementsLabel")}
          hint={t("additionalStatementsHint")}
          accept="application/pdf"
          multiple
          files={files}
          onFiles={(incoming) => setFiles((prev) => [...prev, ...incoming])}
        />
        <button className="btn alt" type="submit" disabled={!files.length || loading}>
          {loading ? t("processing") : t("analyzeAddition")} <Icon name="arrow" size={16} />
        </button>
      </form>
      <AnalysisProgress loading={loading} />
      {error && <p className="icard-error">{error}</p>}
    </div>
  );
}
