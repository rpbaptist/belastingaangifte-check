import { Icon } from "@/app/Icon";
import type {
  AnalysisReport,
  CoveredItem,
  Finding,
  MissingStatementItem,
  NotFilledInItem,
  PropertyStatementData,
} from "@/lib/types";
import { formatEuro } from "@/lib/format";
import { useTranslation } from "@/app/hooks/useTranslation";
import { translatePropertyAmountKind, translatePropertyDocumentKind } from "@/lib/translations";

type Tone = "pos" | "warn" | "info" | "attn" | "find";

export function SummaryBoxes({ report }: { report: AnalysisReport }) {
  const { t } = useTranslation();
  const items: {
    tone: Tone;
    icon: Parameters<typeof Icon>[0]["name"];
    count: number;
    label: string;
    href: string;
  }[] = [
    {
      tone: "pos",
      icon: "check",
      count: report.covered.length,
      label: t("coveredLabel"),
      href: "#section-gedekt",
    },
    {
      tone: "warn",
      icon: "alert",
      count: report.missingStatement.length,
      label: t("missingStatementLabel"),
      href: "#section-ontbreekt",
    },
    {
      tone: "info",
      icon: "file-plus",
      count: report.notFilledIn.length,
      label: t("notFilledInSummaryLabel"),
      href: "#section-niet-ingevuld",
    },
    {
      tone: "info",
      icon: "file-plus",
      count: report.propertyStatements.flatMap((s) => s.amounts).length,
      label: t("propertyStatementsLabel"),
      href: "#section-verkoop-woning",
    },
    {
      tone: "find",
      icon: "shield",
      count: report.findings.length,
      label: t("findingsSummaryLabel"),
      href: "#section-bevindingen",
    },
    {
      tone: "attn",
      icon: "flag",
      count: report.attentionPoints.length,
      label: t("attentionPointsLabel"),
      href: "#section-aandachtspunten",
    },
  ];
  return (
    <div className="statrow">
      {items.map((s) => (
        <a
          key={s.label}
          href={s.count > 0 ? s.href : undefined}
          aria-disabled={s.count === 0}
          className={`stat tone-${s.tone}`}
        >
          <div className="stat-top">
            <span className="chip">
              <Icon name={s.icon} size={17} />
            </span>
            <div className="n num">{s.count}</div>
          </div>
          <div className="l">{s.label}</div>
        </a>
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
  if (count === 0) return null;
  return (
    <div id={id} className={`sec tone-${tone}`}>
      <div className="sechead">
        <span className="chip">
          <Icon name={icon} size={16} />
        </span>
        <div>
          <div className="t">{title}</div>
          {note && <div className="note">{note}</div>}
        </div>
        <span className="pill num">{count}</span>
      </div>
      {children}
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
  const { t } = useTranslation();
  return (
    <Section
      id="section-gedekt"
      tone="pos"
      icon="check"
      title={t("coveredLabel")}
      count={items.length}
      note={t("coveredNote")}
    >
      {items.map((c, i) => (
        <Row
          key={`${c.field}|${c.accountNumber}|${c.institution}|${i}`}
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
  const { t } = useTranslation();
  return (
    <Section
      id="section-ontbreekt"
      tone="warn"
      icon="alert"
      title={t("missingStatementLabel")}
      count={items.length}
      note={t("missingStatementNote")}
    >
      {items.map((c, i) => (
        <Row
          key={`${c.field}|${c.accountNumber}|${c.box}|${i}`}
          tone="warn"
          f={c.field}
          m={`${t("boxPrefix")} ${c.box}${c.accountNumber ? ` · ${c.accountNumber}` : ""}`}
          a={formatEuro(c.amount)}
        />
      ))}
    </Section>
  );
}

export function FindingsSection({ items }: { items: Finding[] }) {
  const { t } = useTranslation();
  return (
    <Section
      id="section-bevindingen"
      tone="find"
      icon="shield"
      title={t("findingsLabel")}
      count={items.length}
      note={t("findingsNote")}
    >
      {items.map((f, i) => (
        <div key={`${f.kind}|${f.field ?? ""}|${i}`} className="irow tone-find">
          <div className="label-col">
            <div className="f">{f.title}</div>
            <div className="m">{f.detail}</div>
          </div>
        </div>
      ))}
    </Section>
  );
}

// Property bewijsstukken (notarisafrekening, WOZ-beschikking, makelaarsnota) never enter
// account matching (ADR 0002 amendment), so their amounts are listed rather than compared —
// each document's amounts are flattened into one row per amount.
export function PropertyStatementsSection({ items }: { items: PropertyStatementData[] }) {
  const { t, language } = useTranslation();
  const rows = items.flatMap((statement, si) =>
    statement.amounts.map((amount, ai) => ({
      key: `${si}|${ai}`,
      documentKind: translatePropertyDocumentKind(statement.documentKind, language),
      institution: statement.institution,
      label: amount.kind ? translatePropertyAmountKind(amount.kind, language) : amount.label,
      amount: amount.amount,
    }))
  );
  return (
    <Section
      id="section-verkoop-woning"
      tone="info"
      icon="file-plus"
      title={t("propertyStatementsLabel")}
      count={rows.length}
      note={t("propertyStatementsNote")}
    >
      {rows.map((r) => (
        <Row
          key={r.key}
          tone="info"
          f={r.label}
          m={`${r.documentKind} · ${r.institution}`}
          a={formatEuro(r.amount)}
        />
      ))}
    </Section>
  );
}

export function NotFilledInSection({ items }: { items: NotFilledInItem[] }) {
  const { t } = useTranslation();
  return (
    <Section
      id="section-niet-ingevuld"
      tone="info"
      icon="file-plus"
      title={t("notFilledInSectionTitle")}
      count={items.length}
      note={t("notFilledInNote")}
    >
      {items.map((c, i) => (
        <Row
          key={`${c.accountNumber}|${c.institution}|${c.description}|${i}`}
          tone="info"
          f={c.description}
          m={`${c.institution}${c.accountNumber ? ` · ${c.accountNumber}` : ""}`}
          a={formatEuro(c.amount)}
        />
      ))}
    </Section>
  );
}
