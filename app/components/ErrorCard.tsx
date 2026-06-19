import { Icon } from "@/app/Icon";
import type { ExtractionError } from "@/lib/types";
import { parseExtractionError } from "@/lib/format";
import { useTranslation } from "@/app/hooks/useTranslation";

export function ErrorCard({ message, className }: { message: string; className?: string }) {
  const { t } = useTranslation();
  const parsed = parseExtractionError(message);
  return (
    <div className={`errcard${className ? ` ${className}` : ""}`} role="alert">
      <span className="ic">
        <Icon name="alert" size={18} />
      </span>
      {parsed ? (
        <div>
          <div className="errcard-title">{t("taxReturnProcessingFailedTitle")}</div>
          <div className="mono errcard-file">{parsed.filename}</div>
          <div className="errcard-detail">{parsed.detail}</div>
        </div>
      ) : (
        <p className="errcard-msg">{message}</p>
      )}
    </div>
  );
}

export function ExtractionErrors({ errors }: { errors: ExtractionError[] }) {
  const { t } = useTranslation();
  if (!errors.length) return null;
  return (
    <div className="errcard errcard-spaced">
      <span className="ic">
        <Icon name="alert" size={18} />
      </span>
      <div>
        <div className="errcard-title">
          {t("extractionFailedForLabel")}{" "}
          {errors.length === 1 ? t("oneFile") : `${errors.length} ${t("filesPlural")}`}
        </div>
        <ul className="errcard-list">
          {errors.map((e) => (
            <li key={e.filename}>
              <div className="mono errcard-file">{e.filename}</div>
              <div className="errcard-detail-mt">{e.error}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
