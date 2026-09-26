import { useEffect, useState } from "react";
import { categoryInfo } from "./lib/categories";
import type { CategoryId } from "./lib/types";

/** Validated categorical palette (light / dark steps of the same eight hues). */
const LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const OTHER = "#898781";

/** Each category keeps its own color slot (color follows the category, never its rank); the rest fold into "Other". */
export const hasOwnColor = (id: CategoryId) => categoryInfo(id).id === id && categoryInfo(id).color != null;

/** Dark when the page's theme toggle says so, or when there's no toggle and the OS is dark. */
export function useDark() {
  const read = () => {
    if (typeof window === "undefined") return false;
    const forced = document.documentElement.dataset.theme;
    if (forced === "dark" || forced === "light") return forced === "dark";
    return Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  };
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const update = () => setDark(read());
    const q = window.matchMedia?.("(prefers-color-scheme: dark)");
    q?.addEventListener("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      q?.removeEventListener("change", update);
      mo.disconnect();
    };
  }, []);
  return dark;
}

export function usePalette() {
  const dark = useDark();
  const slots = dark ? DARK : LIGHT;
  return {
    dark,
    category: (id: CategoryId | "other") => {
      const s = id === "other" || !hasOwnColor(id) ? undefined : categoryInfo(id).color;
      return s == null ? OTHER : slots[s];
    },
    series: slots,
    other: OTHER,
    grid: dark ? "#232e3c" : "#eaecf0",
    axis: dark ? "#334155" : "#d0d5dd",
    muted: dark ? "#8b95a5" : "#667085",
    surface: dark ? "#121821" : "#ffffff",
  };
}
