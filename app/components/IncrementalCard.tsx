"use client";

import { useState } from "react";
import { Icon } from "../Icon";
import { DropZone } from "./DropZone";

export function IncrementalCard({
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
