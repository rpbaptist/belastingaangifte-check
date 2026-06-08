"use client";

import { useState } from "react";
import { DEMO_REPORT, DEMO_EXTRACTED_DATA } from "@/lib/demo-data";

export function useDemoMode() {
  const [active, setActive] = useState(false);

  return {
    active,
    report: active ? DEMO_REPORT : null,
    extractedData: active ? DEMO_EXTRACTED_DATA : null,
    load: () => setActive(true),
    reset: () => setActive(false),
  };
}
