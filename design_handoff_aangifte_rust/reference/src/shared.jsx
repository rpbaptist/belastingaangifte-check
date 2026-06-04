// Shared mock data, helpers, and a clean line-icon set for the redesign.
// Exported to window so the per-direction babel files can use them.

const euro = (n) =>
  new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

// ─── Line icons (Lucide-style, 24×24, stroke) ───────────────────────────────
const ICONS = {
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
  upload: [
    "M12 13v8",
    "m8 17 4-4 4 4",
    "M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25",
  ],
  file: [
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z",
    "M14 2v5h5",
    "M16 13H8",
    "M16 17H8",
    "M10 9H8",
  ],
  arrow: ["M5 12h14", "m12 5 7 7-7 7"],
  chevron: ["m6 9 6 6 6-6"],
  send: [
    "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",
    "m21.854 2.147-10.94 10.939",
  ],
  x: ["M18 6 6 18", "M6 6l12 12"],
  shield: [
    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    "m9 12 2 2 4-4",
  ],
  plus: ["M5 12h14", "M12 5v14"],
  message: ["M7.9 20A9 9 0 1 0 4 16.1L2 22z"],
  sparkle: ["M12 3v18", "M3 12h18", "m5.6 5.6 12.8 12.8", "m18.4 5.6-12.8 12.8"],
  refresh: ["M3 12a9 9 0 0 1 15-6.7L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-15 6.7L3 16", "M3 21v-5h5"],
  dot: [],
};

function Icon({ name, size = 18, stroke = 1.7, style, className }) {
  const paths = ICONS[name] || [];
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
      style={style}
      className={className}
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

// ─── Mock report data (realistic Dutch tax scenario, jaar 2024) ──────────────
const MOCK = {
  taxYear: 2024,
  covered: [
    {
      field: "Saldo betaal- en spaarrekeningen",
      institution: "ING Bank",
      accountNumber: "NL12 INGB 0001 2345 67",
      amount: 18420,
    },
    {
      field: "Beleggingen",
      institution: "DEGIRO",
      accountNumber: "8821-4471",
      amount: 42150,
    },
    {
      field: "Eigenwoningschuld",
      institution: "Rabobank",
      accountNumber: "NL44 RABO 0312 8890 11",
      amount: 312000,
    },
  ],
  missing: [
    {
      field: "Saldo spaarrekening",
      box: "3",
      accountNumber: "NL90 BUNQ 2055 3301 88",
      amount: 7250,
    },
  ],
  notFilled: [
    {
      description: "Betaalde hypotheekrente",
      institution: "Rabobank",
      accountNumber: "NL44 RABO 0312 8890 11",
      amount: 8940,
    },
    {
      description: "Dividend beleggingsrekening",
      institution: "DEGIRO",
      accountNumber: "8821-4471",
      amount: 612,
    },
  ],
  attention: [
    {
      title: "Verrekenbare dividendbelasting",
      explanation:
        "Op je beleggingsrekening is € 92 dividendbelasting ingehouden. Dit bedrag kun je mogelijk verrekenen. Controleer of het is opgenomen in je aangifte.",
      institution: "DEGIRO",
      accountNumber: "8821-4471",
    },
    {
      title: "Hypotheekrenteaftrek niet volledig benut",
      explanation:
        "De betaalde hypotheekrente van € 8.940 lijkt niet volledig opgevoerd in box 1. Dit kan invloed hebben op je teruggave.",
      institution: "Rabobank",
    },
    {
      title: "Spaarrekening zonder jaaropgave",
      explanation:
        "Voor de bunq-spaarrekening is geen jaaropgave geüpload. Voeg deze toe voor een volledige controle.",
      institution: "bunq",
    },
  ],
  // Sample chat shown expanded under the first attention point
  sampleChat: [
    { role: "user", content: "Hoe verreken ik deze dividendbelasting?" },
    {
      role: "assistant",
      content:
        "De ingehouden dividendbelasting van **€ 92** geef je op onder *Verrekenbare dividendbelasting* in box 3. De Belastingdienst trekt dit bedrag af van je te betalen belasting — je krijgt het dus terug.",
    },
  ],
};

const SUMMARY = [
  { key: "covered", label: "Gedekt", count: MOCK.covered.length, tone: "pos", icon: "check" },
  { key: "missing", label: "Jaaropgave ontbreekt", count: MOCK.missing.length, tone: "warn", icon: "alert" },
  { key: "notFilled", label: "Niet ingevuld", count: MOCK.notFilled.length, tone: "info", icon: "file-plus" },
  { key: "attention", label: "Aandachtspunten", count: MOCK.attention.length, tone: "attn", icon: "flag" },
];

Object.assign(window, { euro, Icon, MOCK, SUMMARY });
