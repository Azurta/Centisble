import { useEffect, useState } from "react";
import type { CategoryId } from "./lib/types";

/** Validated categorical palette (light / dark steps of the same eight hues). */
const LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const OTHER = "#898781";

/**
 * Fixed color per category (color follows the category, never its rank).
 * Eight slots; the remaining categories fold into "Other" in charts.
 */
export const CATEGORY_SLOT: Partial<Record<CategoryId, number>> = {
  rent: 0,
  going_out: 1,
  groceries: 2,
  shopping: 3,
  alcohol: 4,
  car: 5,
  subscriptions: 6,
  debt: 7,
};

export const hasOwnColor = (id: CategoryId) => CATEGORY_SLOT[id] != null;

export function useDark() {
  const q = typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : undefined;
  const [dark, setDark] = useState(Boolean(q?.matches));
  useEffect(() => {
    if (!q) return;
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, [q]);
  return dark;
}

export function usePalette() {
  const dark = useDark();
  const slots = dark ? DARK : LIGHT;
  return {
    dark,
    category: (id: CategoryId | "other") => {
      const s = id === "other" ? undefined : CATEGORY_SLOT[id];
      return s == null ? OTHER : slots[s];
    },
    series: slots,
    other: OTHER,
    grid: dark ? "#2c2c2a" : "#e1e0d9",
    axis: dark ? "#383835" : "#c3c2b7",
    muted: "#898781",
    surface: dark ? "#1a1a19" : "#fcfcfb",
  };
}
