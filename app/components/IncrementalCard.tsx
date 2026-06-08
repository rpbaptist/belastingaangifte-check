"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "../Icon";
import { DropZone } from "./DropZone";
import { AnalysisProgress } from "./AnalysisProgress";

export function IncrementalCard({
  loading,
  error,
  onSubmit,
}: {
  loading: boolean;
  error: string | null;
  onSubmit: (files: File[]) => Promise<void>;
}) {
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
      <h2>Jaaropgave vergeten?</h2>
      <p className="icard-desc">
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
        <button className="btn alt" type="submit" disabled={!files.length || loading}>
          {loading ? "Bezig met verwerken…" : "Analyseer aanvulling"}{" "}
          <Icon name="arrow" size={16} />
        </button>
      </form>
      <AnalysisProgress loading={loading} />
      {error && <p className="icard-error">{error}</p>}
    </div>
  );
}
