import { Icon } from "@/app/Icon";
import type { ExtractionError } from "@/lib/types";

export function ErrorCard({ message, style }: { message: string; style?: React.CSSProperties }) {
  const m = message.match(/^Aangifte "([^"]+)" kon niet worden verwerkt: ([\s\S]*)/);
  return (
    <div className="errcard" role="alert" style={style}>
      <span className="ic">
        <Icon name="alert" size={18} />
      </span>
      {m ? (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Aangifte kon niet worden verwerkt</div>
          <div
            className="mono"
            style={{ fontSize: 12, color: "var(--ink-3)", margin: "3px 0 5px" }}
          >
            {m[1]}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{m[2]}</div>
        </div>
      ) : (
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: 0 }}>{message}</p>
      )}
    </div>
  );
}

export function ExtractionErrors({ errors }: { errors: ExtractionError[] }) {
  if (!errors.length) return null;
  return (
    <div className="errcard" style={{ marginBottom: 18 }}>
      <span className="ic">
        <Icon name="alert" size={18} />
      </span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          Extractie mislukt voor{" "}
          {errors.length === 1 ? "één bestand" : `${errors.length} bestanden`}
        </div>
        <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none" }}>
          {errors.map((e, i) => (
            <li key={e.filename} style={{ marginTop: i > 0 ? 8 : 0 }}>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                {e.filename}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>{e.error}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
