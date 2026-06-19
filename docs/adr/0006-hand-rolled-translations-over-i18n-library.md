# ADR 0006: Hand-rolled translations over i18n library

## Status

Accepted

## Context

Adding an English UI toggle for portfolio reviewers. Fixed scope: two languages, ~50 static strings across 8 components, no locale routing, no pluralization needs, no ICU message formatting. The toggle state is in-memory only (no localStorage, no URL segment), mirroring the existing DemoContext pattern. Both client components and server API routes need access to the same translation dictionary.

## Decision

`lib/translations.ts` — a plain dictionary object with `{ nl, en }` pairs per key, exported alongside a `translate(key, language)` function. Client components consume it via a `useTranslation()` hook wrapping `LanguageContext`. Server API routes read the `x-language` request header and call `translate()` directly. No i18n library is introduced.

## Alternatives considered

- **next-intl**: requires App Router locale routing (URL segments or cookie-based), pulls in ICU message formatting and pluralization rules — all unneeded overhead for two languages with a toggle that resets on reload.
- **react-i18next**: separate provider and init pattern with its own configuration; doesn't align with the existing Context-based state pattern (`DemoContext`, `LanguageContext`) already established in the project.

## Consequences

- Adding a third language means extending the dictionary object, not migrating libraries.
- No pluralization or ICU formatting support — inline JS string interpolation (`${}`) is used where amounts or filenames appear in translated strings.
- Server and client both import the same dictionary module directly rather than sharing a template-rendering layer.
- Translation keys are TypeScript-constrained (`keyof typeof translations`) — a compile-time guarantee against missing keys.
