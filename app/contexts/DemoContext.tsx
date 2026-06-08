"use client";

import { createContext, useContext } from "react";

const DemoContext = createContext(false);

export const DemoProvider = DemoContext.Provider;

export function useDemo() {
  return useContext(DemoContext);
}
