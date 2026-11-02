"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Categorical slots 1 and 2 of a colour-blind-validated palette, assigned to the
// two root domains in a fixed order so a domain keeps its colour everywhere.
export const SERIES_COLORS = ["#2a78d6", "#eb6834"];
const GRID = "#e3ded2";
const AXIS = "#5b6475";

/** Papers per publication year, one line per root domain. */
export function TrendChart({ rows }: { rows: { publication_year: number; root_domain: string; paper_count: number }[] }) {
  const series = [...new Set(rows.map((r) => r.root_domain))].sort();
  const years = [...new Set(rows.map((r) => r.publication_year))].sort((a, b) => a - b);
  // Pivot long rows into one object per year: { year, "Artificial Intelligence": 3, ... }
  const data = years.map((year) => {
    const point: Record<string, number> = { year };
    for (const name of series) {
      point[name] = rows.find((r) => r.publication_year === year && r.root_domain === name)?.paper_count ?? 0;
    }
    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="year" stroke={AXIS} tickLine={false} fontSize={12} />
        <YAxis allowDecimals={false} stroke={AXIS} tickLine={false} axisLine={false} fontSize={12} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((name, index) => (
          <Line
            key={name}
            type="linear"
            dataKey={name}
            stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Citations made per year (single series, so no legend: the title names it). */
export function CitationsChart({ rows }: { rows: { year: number; citations: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="year" stroke={AXIS} tickLine={false} fontSize={12} />
        <YAxis allowDecimals={false} stroke={AXIS} tickLine={false} axisLine={false} fontSize={12} />
        <Tooltip cursor={{ fill: "rgba(15,110,110,0.06)" }} />
        <Bar dataKey="citations" name="Citations" fill={SERIES_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
