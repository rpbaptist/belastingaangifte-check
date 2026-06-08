"use client";

import { useState } from "react";
import { Icon } from "@/app/Icon";
import type {
  AnalysisReport,
  CoveredItem,
  MissingStatementItem,
  NotFilledInItem,
} from "@/lib/types";
import { formatEuro } from "@/lib/format";

type Tone = "pos" | "warn" | "info" | "attn";

export function SummaryBoxes({ report }: { report: AnalysisReport }) {
  const items: {
    tone: Tone;
    icon: Parameters<typeof Icon>[0]["name"];
    count: number;
    label: string;
    targetId: string;
  }[] = [
    {
      tone: "pos",
      icon: "check",
      count: report.covered.length,
      label: "Gedekt",
      targetId: "section-gedekt",
    },
    {
      tone: "warn",
      icon: "alert",
      count: report.missingStatement.length,
      label: "Jaaropgave ontbreekt",
      targetId: "section-ontbreekt",
    },
    {
      tone: "info",
      icon: "file-plus",
      count: report.notFilledIn.length,
      label: "Niet ingevuld",
      targetId: "section-niet-ingevuld",
    },
    {
      tone: "attn",
      icon: "flag",
      count: report.attentionPoints.length,
      label: "Aandachtspunten",
      targetId: "section-aandachtspunten",
    },
  ];
  return (
    <div className="statrow">
      {items.map((s) => (
        <button
          key={s.label}
          className={`stat tone-${s.tone}`}
          onClick={() =>
            document
              .getElementById(s.targetId)
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          disabled={s.count === 0}
        >
          <div className="stat-top">
            <span className="chip">
              <Icon name={s.icon} size={17} />
            </span>
            <div className="n num">{s.count}</div>
          </div>
          <div className="l">{s.label}</div>
        </button>
      ))}
    </div>
  );
}

function Section({
  tone,
  icon,
  title,
  count,
  note,
  children,
  id,
}: {
  tone: Tone;
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  count: number;
  note?: string;
  children: React.ReactNode;
  id?: string;
}) {
  const [open, setOpen] = useState(true);
  if (count === 0) return null;
  return (
    <div id={id} className={`sec tone-${tone}`}>
      <button type="button" aria-expanded={open} className={`sechead${open ? "" : " collapsed"}`} onClick={() => setOpen((v) => !v)}>
        <span className="chip">
          <Icon name={icon} size={16} />
        </span>
        <div>
          <div className="t">{title}</div>
          {note && <div className="note">{note}</div>}
        </div>
        <div className="sechead-actions">
          <span className="pill num">{count}</span>
          <Icon
            name="chevron"
            size={16}
            className="sechead-chevron"
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
        </div>
      </button>
      {open && children}
    </div>
  );
}

function Row({ f, m, a, tone }: { f: string; m: string; a: string; tone: Tone }) {
  return (
    <div className={`irow tone-${tone}`}>
      <div className="label-col">
        <div className="f">{f}</div>
        <div className="m">{m}</div>
      </div>
      <div className="a num">{a}</div>
    </div>
  );
}

export function CoveredSection({ items }: { items: CoveredItem[] }) {
  return (
    <Section
      id="section-gedekt"
      tone="pos"
      icon="check"
      title="Gedekt"
      count={items.length}
      note="Aangifte en jaaropgave komen overeen"
    >
      {items.map((c) => (
        <Row
          key={c.accountNumber + "|" + c.field}
          tone="pos"
          f={c.field}
          m={`${c.institution}${c.accountNumber ? ` · ${c.accountNumber}` : ""}`}
          a={formatEuro(c.amountTaxReturn)}
        />
      ))}
    </Section>
  );
}

export function MissingStatementSection({ items }: { items: MissingStatementItem[] }) {
  return (
    <Section
      id="section-ontbreekt"
      tone="warn"
      icon="alert"
      title="Jaaropgave ontbreekt"
      count={items.length}
      note="Staat in je aangifte, geen jaaropgave geüpload"
    >
      {items.map((c) => (
        <Row
          key={c.accountNumber + "|" + c.field}
          tone="warn"
          f={c.field}
          m={`Box ${c.box}${c.accountNumber ? ` · ${c.accountNumber}` : ""}`}
          a={formatEuro(c.amount)}
        />
      ))}
    </Section>
  );
}

export function NotFilledInSection({ items }: { items: NotFilledInItem[] }) {
  return (
    <Section
      id="section-niet-ingevuld"
      tone="info"
      icon="file-plus"
      title="Niet ingevuld in aangifte"
      count={items.length}
      note="Staat in je jaaropgaves, ontbreekt in aangifte"
    >
      {items.map((c) => (
        <Row
          key={c.accountNumber}
          tone="info"
          f={c.description}
          m={`${c.institution}${c.accountNumber ? ` · ${c.accountNumber}` : ""}`}
          a={formatEuro(c.amount)}
        />
      ))}
    </Section>
  );
}
