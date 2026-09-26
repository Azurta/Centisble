import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { hasOwnColor, usePalette } from "../colors";
import { usd } from "../format";
import { categoryInfo } from "../lib/categories";
import type { CategoryId } from "../lib/types";

export interface Slice {
  id: CategoryId | "other";
  label: string;
  value: number;
}

/** Collapse categories without a fixed color into one "Other" slice. */
export function toSlices(values: Partial<Record<CategoryId, number>>): Slice[] {
  const slices: Slice[] = [];
  let other = 0;
  const otherNames: string[] = [];
  for (const [id, v] of Object.entries(values) as [CategoryId, number][]) {
    if (!v || v <= 0.5) continue;
    if (hasOwnColor(id)) slices.push({ id, label: categoryInfo(id).label, value: v });
    else {
      other += v;
      otherNames.push(categoryInfo(id).label);
    }
  }
  slices.sort((a, b) => b.value - a.value);
  if (other > 0.5) slices.push({ id: "other", label: otherNames.length === 1 ? otherNames[0] : "Other", value: other });
  return slices;
}

export function Donut({
  slices,
  centerLabel,
  centerValue,
  onSelect,
}: {
  slices: Slice[];
  centerLabel: string;
  centerValue: string;
  /** Called with a category id when a slice or legend row is clicked. */
  onSelect?: (id: CategoryId) => void;
}) {
  const pal = usePalette();
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (!slices.length) return <p className="muted empty">Nothing to show for this month yet.</p>;
  return (
    <div className="donut">
      <div className="donut-chart" role="img" aria-label={`${centerLabel}: ${slices.map((s) => `${s.label} ${usd(s.value)}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="96%"
              paddingAngle={1}
              stroke={pal.surface}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell
                  key={s.id}
                  fill={pal.category(s.id)}
                  cursor={onSelect && s.id !== "other" ? "pointer" : undefined}
                  onClick={() => onSelect && s.id !== "other" && onSelect(s.id)}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => [`${usd(Number(v))} · ${Math.round((Number(v) / total) * 100)}%`, ""]}
              separator=""
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
              itemStyle={{ color: "var(--text)" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <span className="muted small">{centerLabel}</span>
          <strong>{centerValue}</strong>
        </div>
      </div>
      <ul className="legend">
        {slices.map((s) => {
          const row = (
            <>
              <span className="swatch" style={{ background: pal.category(s.id) }} />
              <span className="legend-label">{s.id === "other" ? s.label : `${categoryInfo(s.id).emoji} ${s.label}`}</span>
              <span className="legend-value">{usd(s.value)}</span>
              <span className="legend-pct muted">{Math.round((s.value / total) * 100)}%</span>
            </>
          );
          return (
            <li key={s.id}>
              {onSelect && s.id !== "other" ? (
                <button className="legend-row" onClick={() => onSelect(s.id)} aria-label={`See ${s.label} purchases`}>{row}</button>
              ) : (
                <div className="legend-row">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
