"use client";

import { useEffect, useState } from "react";

export type AnalysisStage = "reading" | "extracting" | "analysing";

const STEPS: { id: AnalysisStage; label: string }[] = [
  { id: "reading", label: "Documenten lezen" },
  { id: "extracting", label: "Gegevens extraheren" },
  { id: "analysing", label: "Vergelijken en analyseren" },
];

const STAGE_ORDER: AnalysisStage[] = ["reading", "extracting", "analysing"];

function stageIndex(s: AnalysisStage) {
  return STAGE_ORDER.indexOf(s);
}

export function AnalysisProgress({ loading }: { loading: boolean }) {
  const [stage, setStage] = useState<AnalysisStage>("reading");

  useEffect(() => {
    if (!loading) {
      setStage("reading");
      return;
    }
    const t1 = setTimeout(() => setStage("extracting"), 1500);
    const t2 = setTimeout(() => setStage("analysing"), 12000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [loading]);

  if (!loading) return null;

  const current = stageIndex(stage);

  return (
    <div className="loading">
      <div className="spin" />
      <div className="loading-steps">
        {STEPS.map((step, i) => {
          const state = i < current ? "done" : i === current ? "active" : "pending";
          return (
            <div key={step.id} className="loading-step-group">
              {i > 0 && <div className="lstep-sep" />}
              <div className={`lstep lstep-${state}`}>
                <div className="lstep-dot" />
                <span>{step.label}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="loading-sub">Dit kan een paar minuten duren.</p>
    </div>
  );
}
