import { Icon } from "@/app/Icon";

export function TopBar({
  taxYear,
  onReset,
  isDemo,
  onDemo,
}: {
  taxYear?: number;
  onReset?: () => void;
  isDemo?: boolean;
  onDemo?: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <div className="logo">
            <Icon name="shield" size={19} />
          </div>
          <div>
            {onReset ? (
              <button className="brand-link" onClick={onReset}>
                <span className="wm">Aangifte Checker</span>
                {isDemo && <span className="demo-chip">Demo</span>}
              </button>
            ) : (
              <div className="wm">Aangifte Checker</div>
            )}
            {taxYear && <div className="sub">Belastingjaar {taxYear}</div>}
          </div>
        </div>
        {onDemo && (
          <button className="topbar-demo" type="button" onClick={onDemo}>
            Probeer de demo
          </button>
        )}
        <div className="spacer" />
        <a
          href="https://github.com/rpbaptist/belastingaangifte-check"
          target="_blank"
          rel="noopener noreferrer"
          className="ghostbtn"
          aria-label="Bekijk broncode op GitHub"
        >
          <Icon name="github" size={15} /> GitHub
        </a>
        {onReset && !isDemo && (
          <button className="ghostbtn" onClick={onReset}>
            <Icon name="refresh" size={15} /> Opnieuw analyseren
          </button>
        )}
      </div>
    </header>
  );
}
