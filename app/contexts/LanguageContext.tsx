"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Language } from "@/lib/translations";

const LanguageContext = createContext<{ language: Language; toggleLanguage: () => void }>({
  language: "nl",
  toggleLanguage: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("nl");

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function toggleLanguage() {
    setLanguage((l) => (l === "nl" ? "en" : "nl"));
  }

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
