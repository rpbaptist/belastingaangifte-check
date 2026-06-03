import { Icon } from "@/app/Icon";

export function TopBar({ taxYear, onReset }: { taxYear?: number; onReset?: () => void }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <div className="logo">
            <Icon name="shield" size={19} />
          </div>
          <div>
            <div className="wm">Aangifte Checker</div>
            {taxYear && <div className="sub">Belastingjaar {taxYear}</div>}
          </div>
        </div>
        <div className="spacer" />
        {onReset && (
          <button className="ghostbtn" onClick={onReset}>
            <Icon name="refresh" size={15} /> Opnieuw analyseren
          </button>
        )}
      </div>
    </header>
  );
}
