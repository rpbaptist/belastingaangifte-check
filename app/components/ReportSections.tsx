"use client";

import { useState } from "react";
import { Icon } from "@/app/Icon";
import type {
  AnalysisReport,
  CoveredItem,
  MissingStatementItem,
  NotFilledInItem,
} from "@/lib/types";

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

type Tone = "pos" | "warn" | "info" | "attn";

export function SummaryBoxes({ report }: { report: AnalysisReport }) {
  const items: {
    tone: Tone;
    icon: Parameters<typeof Icon>[0]["name"];
    count: number;
    label: string;
  }[] = [
    { tone: "pos", icon: "check", count: report.covered.length, label: "Gedekt" },
    {
      tone: "warn",
      icon: "alert",
      count: report.missingStatement.length,
      label: "Jaaropgave ontbreekt",
    },
    { tone: "info", icon: "file-plus", count: report.notFilledIn.length, label: "Niet ingevuld" },
    { tone: "attn", icon: "flag", count: report.attentionPoints.length, label: "Aandachtspunten" },
  ];
  return (
    <div className="statrow" style={{ marginTop: 18 }}>
      {items.map((s) => (
        <div key={s.label} className={`stat tone-${s.tone}`}>
          <div className="stat-top">
            <span className="chip">
              <Icon name={s.icon} size={17} />
            </span>
            <div className="n num">{s.count}</div>
          </div>
          <div className="l">{s.label}</div>
        </div>
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
}: {
  tone: Tone;
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  count: number;
  note?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  if (count === 0) return null;
  return (
    <div className={`sec tone-${tone}`}>
      <div className={`sechead${open ? "" : " collapsed"}`} onClick={() => setOpen((v) => !v)}>
        <span className="chip">
          <Icon name={icon} size={16} />
        </span>
        <div>
          <div className="t">{title}</div>
          {note && <div className="note">{note}</div>}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="pill num">{count}</span>
          <Icon
            name="chevron"
            size={16}
            style={{
              color: "var(--c)",
              transition: "transform .18s",
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
        </div>
      </div>
      {open && children}
    </div>
  );
}

function Row({ f, m, a, tone }: { f: string; m: string; a: string; tone: Tone }) {
  return (
    <div className="irow">
      <div style={{ minWidth: 0 }}>
        <div className="f">{f}</div>
        <div className="m">{m}</div>
      </div>
      <div className="a num" style={{ color: `var(--${tone})` }}>
        {a}
      </div>
    </div>
  );
}

export function CoveredSection({ items }: { items: CoveredItem[] }) {
  return (
    <Section
      tone="pos"
      icon="check"
      title="Gedekt"
      count={items.length}
      note="Aangifte en jaaropgave komen overeen"
    >
      {items.map((c) => (
        <Row
          key={c.accountNumber + c.field}
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
      tone="warn"
      icon="alert"
      title="Jaaropgave ontbreekt"
      count={items.length}
      note="Staat in je aangifte, geen jaaropgave geüpload"
    >
      {items.map((c) => (
        <Row
          key={(c.accountNumber ?? "") + c.field}
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
