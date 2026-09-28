/** Look & feel you can change in Settings: light/dark and the accent color. */
import { useEffect } from "react";
import { useDark } from "./colors";

export type ThemeChoice = "system" | "light" | "dark";
export interface Appearance {
  theme: ThemeChoice;
  accent: AccentId;
}

export const ACCENTS = {
  blue: { label: "Ledger blue", light: "#1b5fae", dark: "#5b9be6" },
  teal: { label: "Teal", light: "#0f766e", dark: "#2dd4bf" },
  green: { label: "Green", light: "#15803d", dark: "#4ade80" },
  violet: { label: "Violet", light: "#5b3fd6", dark: "#a38bfa" },
  rose: { label: "Rose", light: "#be123c", dark: "#fb7185" },
  graphite: { label: "Graphite", light: "#344054", dark: "#cbd5e1" },
} as const;
export type AccentId = keyof typeof ACCENTS;

export const DEFAULT_APPEARANCE: Appearance = { theme: "system", accent: "blue" };

/** Mix a hex color toward black (negative) or white (positive) for hover/soft variants. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function useApplyAppearance(a: Appearance) {
  // Light/dark: set or clear the root's data-theme (the stylesheet and charts follow it).
  useEffect(() => {
    const root = document.documentElement;
    if (a.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = a.theme;
  }, [a.theme]);

  const dark = useDark();
  useEffect(() => {
    const c = ACCENTS[a.accent] ?? ACCENTS.blue;
    const s = document.documentElement.style;
    if (a.accent === "blue") {
      for (const v of ["--accent", "--accent-hover", "--accent-soft", "--accent-ink"]) s.removeProperty(v);
      return;
    }
    const base = dark ? c.dark : c.light;
    s.setProperty("--accent", base);
    s.setProperty("--accent-hover", shade(base, dark ? 0.15 : -0.15));
    s.setProperty("--accent-soft", dark ? shade(base, -0.75) : shade(base, 0.88));
    s.setProperty("--accent-ink", dark ? "#0b0f14" : "#ffffff");
  }, [a.accent, dark]);
}
