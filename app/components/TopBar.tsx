"use client";

import { Icon } from "@/app/Icon";
import { useDemo } from "@/app/contexts/DemoContext";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTranslation } from "@/app/hooks/useTranslation";

export function TopBar({
  taxYear,
  onReset,
  onDemo,
}: {
  taxYear?: number;
  onReset?: () => void;
  onDemo?: () => void;
}) {
  const isDemo = useDemo();
  const { language, toggleLanguage } = useLanguage();
  const { t } = useTranslation();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <div className="brand">
            <div className="logo">
              <Icon name="shield" size={19} />
            </div>
            <div>
              {onReset ? (
                <button className="brand-link" onClick={onReset}>
                  <span className="wm">{t("appTitle")}</span>
                  {isDemo && <span className="demo-chip">{t("demoChip")}</span>}
                </button>
              ) : (
                <div className="wm">{t("appTitle")}</div>
              )}
              {taxYear && (
                <div className="sub">
                  {t("taxYearPrefix")} {taxYear}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="topbar-center">
          {onDemo && (
            <button className="topbar-demo" type="button" onClick={onDemo}>
              {t("viewDemo")}
            </button>
          )}
        </div>

        <div className="topbar-right">
          <button className="ghostbtn" type="button" onClick={toggleLanguage}>
            {language === "nl" ? "EN" : "NL"}
          </button>
          <a
            href="https://github.com/rpbaptist/belastingaangifte-check"
            target="_blank"
            rel="noopener noreferrer"
            className="ghostbtn github-topbar"
            aria-label={t("githubAriaLabel")}
          >
            <Icon name="github" size={15} /> GitHub
          </a>
          {onReset && !isDemo && (
            <button className="ghostbtn" onClick={onReset}>
              <Icon name="refresh" size={15} /> {t("reanalyze")}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
