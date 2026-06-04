# Handoff: Aangifte Checker — UI Redesign ("Rust")

## Overview
A visual redesign of the existing **Belastingaangifte Checker** (`app/page.tsx`). Same product and
flow — upload an aangifte + jaaropgaves, run the analysis, read a report split into four categories
(**Gedekt**, **Jaaropgave ontbreekt**, **Niet ingevuld in aangifte**, **Aandachtspunten**) with an
inline Q&A on each aandachtspunt, plus an incremental "forgot a statement?" upload.

The redesign replaces the current rainbow-of-colors + emoji styling with a calm, warm, financial-grade
look: a single warm-neutral palette (cream paper / warm ink / bronze), **refined muted semantic
colors**, a **clean line-icon set** (no emoji), tabular figures for money, and a **responsive
two-column report layout** for desktop that collapses to a single column on small screens.

## About the Design Files
The files in `reference/` are **design references built in HTML/React-via-Babel** — prototypes that
show the intended look and behavior. The files in `code/` are a **ready-to-drop-in port** for this
exact repo (see next section) — a strong starting point, but still review the diff against your live code.

## Recent layout fixes (already applied to `reference/` and `code/`)
Three layout bugs were found and fixed; the docs below reflect the corrected behavior:
1. **App bar width** — `.topbar-inner` used to be `max-width: 1440px` at every breakpoint while the page
   content was `720px`, so the bar (and its right-hand button) overran the content's right edge. The
   inner row now matches the page: `720px` by default, `1440px` at ≥1040px.
2. **Sticky side rail clipped the upload card** — `.col-side` was `position: sticky; top: 84px`. Because
   the rail (attention cards + chat + incremental card) is taller than the viewport, sticky pinned its
   **top** and pushed the "Jaaropgave vergeten?" card permanently below the fold — unreachable. The rail
   is no longer sticky (`align-self: start`); it scrolls normally so the bottom card is always reachable.
3. **Chat thread hierarchy** — the conversation now sits below a hairline divider (`border-top`) that
   separates it from the card's action buttons, and the thread is a flex column with bubbles aligned via
   `align-self` (robust) instead of `margin-left: auto`. The send button is a fixed 40×40 circle.

## ⭐ Ready-to-drop-in code (`code/`)
Generated against THIS repo (Next.js 16, React 19, Tailwind v4, `Geist`/`Geist Mono` already wired in
`app/layout.tsx`, no new dependencies):

- **`code/app/globals.css`** — drop-in replacement for `app/globals.css`. Keeps `@import "tailwindcss"`
  and the `@theme` font mapping; adds the full design-token set + every component class. Light theme
  only (the old `prefers-color-scheme: dark` override is intentionally removed).
- **`code/app/Icon.tsx`** — new file. A tiny self-contained line-icon component (no dependency added).
- **`code/app/page.tsx`** — drop-in replacement for `app/page.tsx`. **All existing logic is preserved
  verbatim**: `fileToBase64`, `formatEuro`, the `DropZone` drag/drop, `handleSubmit` → `/api/analyze`,
  `handleIncremental` → `/api/analyze/incremental`, and the per-aandachtspunt chat → `/api/question`
  (with `history`, "Meer uitleg", resolved toggle). Only the markup + classes changed.

What the port adds beyond the original:
- An **upload view** (shown when `report === null`) and a **results view** (shown once a report exists),
  with an "Opnieuw analyseren" / "Wijzig" reset back to upload. The original kept the upload form
  permanently above the report — this split is cleaner; revert to a single combined view if you prefer.
- The **empty-Aandachtspunten** layout rule (section F): `hasAttn` switches the body between the
  two-column grid and a full-width single column.

To apply: copy `code/app/globals.css`, `code/app/Icon.tsx`, `code/app/page.tsx` over their counterparts,
run `npm run dev`, and review. API routes and `lib/` are untouched.

Screenshots of the intended result are in `screenshots/` (desktop two-column, header + summary boxes,
and the empty-Aandachtspunten full-width state).

The task either way: **recreate this design inside the existing Next.js + React + Tailwind v4 codebase**,
reusing its real data model (`lib/types.ts`), API routes, and handlers. **Keep all current logic** —
only the presentation layer changes.

To view the reference: open `reference/Aangifte Checker - Rust.html` in a browser. It uses mock data.
The "Tweaks" panel toggle in the prototype ("Aandachtspunten tonen") is **only a demo device** to
preview the empty-attention state — it is NOT a feature to build. In the real app the empty state is
driven purely by `report.attentionPoints.length`.

## Fidelity
**High-fidelity.** Exact colors, typography, spacing, and interactions are specified below. Recreate
pixel-faithfully using the codebase's patterns (Tailwind classes or a small CSS module — your call;
the reference uses plain CSS classes which map cleanly to either).

---

## Design Tokens

Add these as CSS custom properties (the reference defines them on `:root`). They pair naturally with
Tailwind v4's `@theme` — expose any you want as Tailwind colors, or just use `var(--…)` in classes.

```css
:root {
  /* warm earthy neutrals */
  --paper: #f6f5f2;     /* page background */
  --paper-2: #efece4;   /* subtle fills, assistant chat bubble */
  --card: #ffffff;      /* card surfaces */
  --ink: #23201b;       /* primary text, primary buttons */
  --ink-2: #4c463c;     /* secondary text / body copy */
  --ink-3: #867e70;     /* muted text / meta */
  --ink-4: #aaa495;     /* faint text / placeholders */
  --line: #e7e3d9;      /* hairline borders / row dividers */
  --line-2: #dbd5c8;    /* stronger borders / inputs */

  /* bronze — warm signature accent (brand mark, eyebrow, secondary CTA, links) */
  --bronze: #9a6d34;
  --bronze-d: #7c5728;  /* hover */
  --bronze-bg: #f4ebdd;
  --bronze-line: #e6d4ba;

  /* refined, muted semantic colors. Each has: text (--x), tint bg (--x-bg), border (--x-line) */
  --pos:  #4e7256;  --pos-bg:  #e9f0e6;  --pos-line:  #cadcc1;  /* Gedekt (green/sage) */
  --warn: #a87716;  --warn-bg: #f7eed9;  --warn-line: #ecd9ad;  /* Jaaropgave ontbreekt (ochre) */
  --info: #3e6c80;  --info-bg: #e4f0f3;  --info-line: #c6e0e6;  /* Niet ingevuld (muted teal) */
  --attn: #7c596d;  --attn-bg: #f2e9ee;  --attn-line: #e3d1da;  /* Aandachtspunten (muted plum) */
}
```

Constraint that drove the palette: **avoid any resemblance to belastingdienst.nl** — so no government
blue anywhere. The "info" color is a desaturated teal, not blue.

A small helper makes per-category theming clean — set a `tone` on a wrapper and let children read
generic vars:
```css
.tone-pos  { --c: var(--pos);  --cbg: var(--pos-bg);  --cln: var(--pos-line); }
.tone-warn { --c: var(--warn); --cbg: var(--warn-bg); --cln: var(--warn-line); }
.tone-info { --c: var(--info); --cbg: var(--info-bg); --cln: var(--info-line); }
.tone-attn { --c: var(--attn); --cbg: var(--attn-bg); --cln: var(--attn-line); }
```

### Category → data mapping (`lib/types.ts`)
| UI category | tone | source array | fields shown | amount |
|---|---|---|---|---|
| Gedekt | `pos` | `report.covered` (`CoveredItem`) | `field`, `institution · accountNumber` | `amountTaxReturn` |
| Jaaropgave ontbreekt | `warn` | `report.missingStatement` (`MissingStatementItem`) | `field`, `Box {box} · {accountNumber}` | `amount` |
| Niet ingevuld in aangifte | `info` | `report.notFilledIn` (`NotFilledInItem`) | `description`, `institution · accountNumber` | `amount` |
| Aandachtspunten | `attn` | `report.attentionPoints` (`AttentionPoint`) | `title`, `explanation`, `institution · accountNumber` | — |

---

## Typography
- **Sans (everything):** `Geist` — already wired via `next/font/google` in `app/layout.tsx`. Keep it;
  drop the `font-family: Arial…` fallback currently in `globals.css body`.
- **Mono (all money figures + small code-like meta):** `Geist Mono` (already imported). Use it on every
  euro amount and on the summary numbers, with `font-variant-numeric: tabular-nums` so figures align.

Type scale used (px / weight / line-height):
| Role | size | weight | notes |
|---|---|---|---|
| App-bar wordmark | 16.5 / 600 | | `letter-spacing: -.01em` |
| Page H1 ("Je controle is klaar") | 26 / 600 | | `letter-spacing: -.02em` |
| Eyebrow ("RESULTAAT") | 12 / 600 | | uppercase, `letter-spacing: .08em`, color `--bronze` |
| Section title | 15 / 600 | | |
| Summary number | 30 / 600 | | Geist Mono, colored `var(--c)` |
| Row field | 14 / 500 | | |
| Row meta | 12 / 400 | | color `--ink-3` |
| Money amount | 14.5 / 600 | | Geist Mono, tabular; colored `var(--c)` in section rows |
| Aandachtspunt title | 15 / 600 | | |
| Aandachtspunt body | 13.5 / 1.55 | 400 | color `--ink-2` |
| Chat bubble | 13 / 1.5 | | |

---

## Icons
Replace **all emoji** with line icons. The reference inlines small Lucide-style SVGs (stroke 1.7,
`stroke-linecap/linejoin: round`). **Recommended:** use **`lucide-react`** in the app. Mapping:

| Use | reference name | lucide-react |
|---|---|---|
| Gedekt / check | `check` | `Check` |
| Jaaropgave ontbreekt | `alert` | `TriangleAlert` |
| Niet ingevuld | `file-plus` | `FilePlus2` |
| Aandachtspunten | `flag` | `Flag` |
| Upload dropzone | `upload` | `UploadCloud` |
| File chip | `file` | `FileText` |
| Primary CTA arrow | `arrow` | `ArrowRight` |
| Chat submit | `send` | `Send` |
| Mark resolved | `check-circle` | `CircleCheck` |
| Brand mark | `shield` | `ShieldCheck` |
| Add / wijzig | `plus` | `Plus` |
| Stel een vraag | `message` | `MessageCircle` |
| Opnieuw analyseren | `refresh` | `RefreshCw` |

(The full inline icon set, if you prefer not to add a dependency, is in `reference/src/shared.jsx` →
`ICONS`.)

---

## Layout & Screens

The redesign renders as a **sticky app bar** + a centered page. On desktop (≥1040px) the report body
is a **two-column grid**; below that it is a single column.

### A. App bar (`.topbar`) — sticky, full-width
- `position: sticky; top: 0; z-index: 10;` background = `--paper` at ~86% opacity with
  `backdrop-filter: blur(10px)`; `border-bottom: 1px solid var(--line)`.
- Inner row, **matches the page width** (`max-width: 720px`; `1440px` at ≥1040px), centered, padding
  `12px 40px` (26px on mobile), flex/space-between:
  - **Left — brand:** 36×36 rounded-11px square filled `--bronze` (white `ShieldCheck`), then
    "Aangifte Checker" (16.5/600) over "Belastingjaar {taxYear}" (12, `--ink-3`).
  - **Right — ghost button "Opnieuw analyseren":** `RefreshCw` 15px + label 13/600, `--ink-2`,
    white bg, `1px --line-2`, `border-radius: 999px`, padding `8px 15px`; hover → border+text `--bronze`.
    (Wire to "reset to upload" / re-run.) `white-space: nowrap`. **At ≤440px** the label is hidden
    (wrap it in a `.lbl` span) and the button becomes icon-only, and `.brand .sub` is hidden — so the
    bar never overflows on small phones.

### B. Page container (`.page`)
- `max-width: 720px` (mobile) → **`1440px` at ≥1040px**; centered; padding `30px 40px 100px` desktop.

### C. Uploaded-files strip (`.files`) — full width, below bar
White card, `1px --line`, `border-radius: 14px`, padding `14px 16px`, flex row, `gap: 12px`, wraps.
- Group label (e.g. "AANGIFTE"): 11px/600 uppercase `--ink-4`, `letter-spacing: .04em`.
- File chips (`.fchip`): inline-flex, `FileText` 13px + filename 12px, `--paper` bg, `1px --line-2`,
  `border-radius: 999px`, padding `5px 10px`, `white-space: nowrap`. The aangifte chip uses the **ok**
  variant: `--pos-bg` bg, `--pos-line` border, `--pos` text, with a `Check` icon.
- Right: ghost text button "Wijzig" (`Plus` 14px), `--bronze`, 12.5/600.

### D. Results header
- Eyebrow "RESULTAAT" (see type scale).
- H1 "Je controle is klaar".
- Sub (13.5, `--ink-3`): "{n} jaaropgaves vergeleken met je aangifte over {taxYear}."

### E. Summary boxes (`.statrow`) — full width, four across
`display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;` → **`repeat(2,1fr)` at ≤560px.**
Each box (`.stat`): white card, `1px --line`, `border-radius: 14px`, padding `16px 17px 15px`,
soft shadow `0 1px 2px rgba(35,32,27,.04), 0 10px 26px -20px rgba(35,32,27,.3)`. Layout is:

> **Row 1 (`.stat-top`, flex, gap 12, align center):** colored icon chip **+** the number, inline.
> **Row 2:** the description, on its own line below (`margin-top: 12px`).

- Icon chip: 34×34, `border-radius: 10px`, **solid `var(--c)` background, white icon**, subtle colored
  shadow `0 2px 5px -1px color-mix(in oklab, var(--c) 50%, transparent)`.
- Number: Geist Mono, 30/600, **color `var(--c)`**. Value = that category's array length.
- Description: 12.5/500, `--ink-2` (e.g. "Gedekt", "Jaaropgave ontbreekt", "Niet ingevuld",
  "Aandachtspunten"). The box surface stays **white** (we tried colored fills + top accent bars and
  removed them — keep boxes light, color comes from the chip + number).

### F. Report body (`.body`) — responsive two-column
```css
/* mobile: normal block flow (everything stacks) */
@media (min-width: 1040px) {
  .body { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(400px, 1fr);
          gap: 28px; align-items: start; }
  .body.single { display: block; }          /* empty-attention case, see below */
  .col-side { align-self: start; }           /* NOT sticky — see note */
}
```
> **Do not make `.col-side` sticky.** An earlier version used `position: sticky; top: 84px`, but the
> rail is taller than the viewport, so sticky pinned its top and made the bottom "Jaaropgave vergeten?"
> card unreachable. Let the rail scroll with the page.
- **Left column (`.col-main`):** the three comparison sections — Gedekt, Jaaropgave ontbreekt,
  Niet ingevuld — stacked (`gap: 14px`).
- **Right column (`.col-side`, sticky):** the **Aandachtspunten** group, then the **"Jaaropgave
  vergeten?"** incremental card (`gap: 16px`).

Rationale for the ratio: the comparison rows are short, so the left gives space back to the right; the
aandachtspunt cards + chat want the room. Tune `1.15fr` if desired.

#### ⚠️ Empty-attention rule (important)
When `report.attentionPoints.length === 0`:
- **Do not render the right rail.** Render the report sections **full width** (single column), and place
  the "Jaaropgave vergeten?" card full-width **below** the sections.
- Implement by adding the `single` class to `.body` (which overrides the grid to `display: block`) and
  conditionally rendering the rail. The summary "Aandachtspunten" box then naturally shows **0**.
```tsx
const hasAttn = report.attentionPoints.length > 0;
<div className={`body${hasAttn ? "" : " single"}`}>
  <div className="col-main">
    {/* 3 comparison sections */}
    {!hasAttn && <IncrementalCard />}
  </div>
  {hasAttn && (
    <aside className="col-side">
      <AttentionGroup points={report.attentionPoints} taxYear={report.taxYear} />
      <IncrementalCard />
    </aside>
  )}
</div>
```

### G. Section card (`.sec` + tone class)
White card, `1px --line`, `border-radius: 16px`, `overflow: hidden`.
- **Header (`.sechead`):** padding `15px 18px`, `border-bottom: 1px solid var(--cln)`, **tinted
  background `var(--cbg)`**. Contains: 30×30 solid `var(--c)` icon chip (white icon) · title (15/600)
  over optional note (12, `--ink-3`) · right-aligned count **pill** (Geist Mono 12, `var(--c)` text,
  `var(--cbg)` bg, `1px var(--cln)`, `border-radius: 999px`, padding `2px 11px`).
  - Notes: Gedekt = "Aangifte en jaaropgave komen overeen"; Ontbreekt = "Staat in je aangifte, geen
    jaaropgave geüpload"; Niet ingevuld = "Staat in je jaaropgaves, ontbreekt in aangifte".
- **Row (`.irow`):** flex space-between, padding `13px 18px`, `border-bottom: 1px solid var(--line)`
  (none on last). Left = field (14/500) over meta (12, `--ink-3`). Right = amount (Geist Mono 14.5/600,
  **colored `var(--c)`**, `white-space: nowrap`), formatted with the existing `formatEuro` (nl-NL EUR,
  0 decimals).

### H. Aandachtspunten group (`.col-side` content)
- **Heading row (`.ahead`):** `Flag` 18px (`--attn`) + "Aandachtspunten" (17/600) + count pill (attn tone).
- **Cards (`.acard`):** white, `1px --line`, `border-radius: 16px`, padding `16px 18px`, `gap: 12px`.
  - Head: 32×32 `--attn-bg` chip with `--attn` `Flag` · title (15/600) · explanation (13.5/1.55,
    `--ink-2`) · meta (11.5, `--ink-4` = `institution · accountNumber`).
  - **Actions row (`.actions`):** pill buttons — "Stel een vraag" / "Bekijk gesprek" (`MessageCircle`,
    `--attn` text on `--attn-bg`) and, pushed right, "Markeer als opgelost" (`CircleCheck`, muted:
    `--ink-3` on `--paper-2`; when resolved → `--pos` on `--pos-bg`).
  - **Resolved state:** add `.resolved` → card opacity .6, bg `--paper`, title strike-through `--ink-3`,
    chip flips to `--pos-bg`/`--pos` with a `Check`.
  - **Expanded chat (`.thread`):** rendered when open. The thread is separated from the actions row by a
    hairline `border-top: 1px solid var(--line)` (`padding-top: 14px`) and is a `display: flex;
    flex-direction: column` stack.
    - User bubble (`.bubble.u`): `--ink` bg, `--paper` text, `align-self: flex-end`, `border-bottom-right-radius:4px`.
    - Assistant bubble (`.bubble.a`): `--paper-2` bg, `--ink` text, `align-self: flex-start`,
      `border-bottom-left-radius:4px`. Render the assistant markdown (reuse the existing
      `ReactMarkdown` + `markdownComponents`, just restyle: bold = 600, links/code in `--attn`).
    - "Bezig met antwoorden…" typing line: 12, italic, `--ink-4`.
    - Input (`.chatin`): rounded-pill text input (`--paper` bg, `1px --line-2`; focus → `--attn` border
      + 3px `--attn-bg` ring) + circular send button (40px, `--attn` bg, white `Send`), disabled when empty.
  - Behavior is the **existing** `AttentionPointCard` logic in `app/page.tsx` (history, `/api/question`,
    `sendQuestion`, "Meer uitleg", resolved toggle). Keep it; only restyle. Default the **first** card
    open in the reference, but in production keep your current default (closed) unless you prefer otherwise.

### I. Incremental card (`.icard`) — "Jaaropgave vergeten?"
White card, `1px --line`, `border-radius: 16px`, padding `18px`.
- Title (15.5/600) + note (12.5, `--ink-3`).
- Dropzone (`.drop`): dashed `1.5px --line-2`, `border-radius: 13px`, `--paper` bg, centered; hover →
  border `--bronze`, bg `--bronze-bg`. Icon tile 44×44 white rounded with `--bronze` `UploadCloud`,
  label (14/600) + hint (12, `--ink-3`).
- Button (`.btn`): full width, **`--bronze` bg** (hover `--bronze-d`), white, 14.5/600, `border-radius:
  999px`, `ArrowRight`. (Secondary CTA uses bronze; the primary "Analyseren" on the upload screen uses
  `--ink`.) Wire to the existing incremental handler.
- Reuse the existing `DropZone` component's drag/drop behavior; restyle to match.

### J. Disclaimer
Centered, 11.5, `--ink-4`: "Alleen voor demo — controleer altijd zelf alle informatie." (Or your real
disclaimer.)

---

## Interactions & Behavior (all already in `app/page.tsx` — preserve)
- Drag/drop + click upload (`DropZone`), base64 encode, POST `/api/analyze`.
- Loading state during analyze (~30–60s). Reference shows a `--bronze` spinner / progress bar with
  copy "Documenten worden geanalyseerd…". Restyle the existing loader to match (warm tones, not blue).
- Error states: warm card (`--warn` tones) with `TriangleAlert`, not the current red — e.g.
  "Extractie mislukt voor {n} bestand(en)" listing `filename — error`.
- Incremental upload → POST `/api/analyze/incremental`, merge into report.
- Per-aandachtspunt chat → POST `/api/question` with history; markdown answers.
- **Responsive:** two-column ≥1040px (sticky rail), single column below; summary boxes 4-up → 2-up ≤560px.

## State Management
No new state. Drives entirely off the existing `report: AnalysisReport`, `extractedData`, `loading`,
`error`, and the per-card chat state already in `app/page.tsx`. The only new *derived* value is
`hasAttn = report.attentionPoints.length > 0` controlling the body layout (section F).

## Files in this bundle
**`code/`** — ready-to-drop-in port for this repo:
- `app/globals.css`, `app/Icon.tsx`, `app/page.tsx` (see the "Ready-to-drop-in code" section above).

**`screenshots/`** — visual ground truth:
- `desktop-two-column.png`, `summary-and-header.png`, `empty-attention-top.png`, `empty-attention-bottom.png`.

**`reference/`** — the original HTML prototype:
- `Aangifte Checker - Rust.html` — open in a browser to see the design live (mock data).
- `src/shared.jsx` — mock data, `euro` formatter, the full inline icon set, `SUMMARY` descriptor.
- `src/rust-app.jsx` — full page composition incl. `AttentionCard` (working chat demo), `IncrementalCard`,
  and the empty-attention layout logic.
- `tweaks-panel.jsx` — only powers the prototype's demo toggle; **not part of the app**.

## Asset notes
No images. Icons via `lucide-react` (recommended) or the inline set in `shared.jsx`. Fonts (`Geist`,
`Geist Mono`) are already configured in the repo.
