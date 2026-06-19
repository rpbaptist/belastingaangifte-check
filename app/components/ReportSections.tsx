import { Icon } from "@/app/Icon";
import type {
  AnalysisReport,
  CoveredItem,
  MissingStatementItem,
  NotFilledInItem,
} from "@/lib/types";
import { formatEuro } from "@/lib/format";
import { useTranslation } from "@/app/hooks/useTranslation";

type Tone = "pos" | "warn" | "info" | "attn";

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
      {items.map((c) => (
        <Row
          key={c.accountNumber + "|" + c.field}
          tone="warn"
          f={c.field}
          m={`${t("boxPrefix")} ${c.box}${c.accountNumber ? ` · ${c.accountNumber}` : ""}`}
          a={formatEuro(c.amount)}
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
      {items.map((c) => (
        <Row
          key={`${c.accountNumber}|${c.description}`}
          tone="info"
          f={c.description}
          m={`${c.institution}${c.accountNumber ? ` · ${c.accountNumber}` : ""}`}
          a={formatEuro(c.amount)}
        />
      ))}
    </Section>
  );
}
