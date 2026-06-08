// app/Icon.tsx
// Small self-contained line-icon set (Lucide-style, 24×24, stroke).
// No external dependency. Add new glyphs to ICONS as needed.

export type IconName =
  | "check"
  | "check-circle"
  | "alert"
  | "file-plus"
  | "flag"
  | "upload"
  | "file"
  | "arrow"
  | "send"
  | "shield"
  | "plus"
  | "message"
  | "refresh"
  | "chevron"
  | "github";

const ICONS: Record<IconName, string[]> = {
  check: ["M20 6 9 17l-5-5"],
  "check-circle": ["M22 11.08V12a10 10 0 1 1-5.93-9.14", "m9 11 3 3L22 4"],
  alert: [
    "m10.29 3.86-8.18 14.18A2 2 0 0 0 3.83 21h16.34a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0z",
    "M12 9v4",
    "M12 17h.01",
  ],
  "file-plus": [
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z",
    "M14 2v5h5",
    "M12 11v6",
    "M9 14h6",
  ],
  flag: ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"],
  upload: ["M12 13v8", "m8 17 4-4 4 4", "M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"],
  file: [
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z",
    "M14 2v5h5",
    "M16 13H8",
    "M16 17H8",
    "M10 9H8",
  ],
  arrow: ["M5 12h14", "m12 5 7 7-7 7"],
  send: [
    "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",
    "m21.854 2.147-10.94 10.939",
  ],
  shield: [
    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    "m9 12 2 2 4-4",
  ],
  plus: ["M5 12h14", "M12 5v14"],
  message: ["M7.9 20A9 9 0 1 0 4 16.1L2 22z"],
  refresh: [
    "M3 12a9 9 0 0 1 15-6.7L21 8",
    "M21 3v5h-5",
    "M21 12a9 9 0 0 1-15 6.7L3 16",
    "M3 21v-5h5",
  ],
  chevron: ["m6 9 6 6 6-6"],
  github: [
    "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4",
    "M9 18c-4.51 2-5-2-7-2",
  ],
};

export function Icon({
  name,
  size = 18,
  stroke = 1.7,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {ICONS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
