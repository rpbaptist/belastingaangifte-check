"use client";

import { useLanguage } from "@/app/contexts/LanguageContext";
import { translate, type TranslationKey } from "@/lib/translations";

export function useTranslation() {
  const { language } = useLanguage();
  const t = (key: TranslationKey) => translate(key, language);
  return { t, language };
}
