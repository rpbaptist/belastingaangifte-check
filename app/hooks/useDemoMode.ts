"use client";

import { useState } from "react";
import { DEMO_REPORT, DEMO_REPORT_EN, DEMO_EXTRACTED_DATA } from "@/lib/demo-data";
import { useLanguage } from "@/app/contexts/LanguageContext";

export function useDemoMode() {
  const { language } = useLanguage();
  const [active, setActive] = useState(false);

  return {
    active,
    report: active ? (language === "en" ? DEMO_REPORT_EN : DEMO_REPORT) : null,
    extractedData: active ? DEMO_EXTRACTED_DATA : null,
    load: () => setActive(true),
    reset: () => setActive(false),
  };
}
