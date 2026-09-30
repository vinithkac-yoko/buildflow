"use client";

import { useEffect, useState } from "react";
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Point { date: string; planned: number; actual: number | null }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (s: string) => `${s.slice(8, 10)}-${MONTHS[Number(s.slice(5, 7)) - 1]}-${s.slice(0, 4)}`;

/** Cumulative planned (dashed steel blue) vs actual (solid green with soft fill) %, one small multiple per project. */
export function SCurve({ data, id, height = 84 }: { data: Point[]; id: string; height?: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const gid = `g-${id}`;
  const tableRows = data.filter((_, i) => i % Math.max(1, Math.round(data.length / 12)) === 0 || i === data.length - 1);

  return (
    <div>
      <div style={{ height }} aria-hidden={false}>
        {ready && (
          <ResponsiveContainer width="100%" height="100%" minWidth={120} initialDimension={{ width: 240, height }}>
            <ComposedChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--brand-text))" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="rgb(var(--brand-text))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis domain={[0, 100]} hide />
              <Tooltip
                cursor={{ stroke: "rgb(var(--text-muted))", strokeDasharray: "2 3" }}
                contentStyle={{ background: "rgb(var(--surface))", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "var(--font-mono, 'Fira Code'), monospace", fontSize: 12 }}
                labelStyle={{ color: "rgb(var(--text-muted))" }}
                labelFormatter={(l) => fmtDate(String(l))}
                formatter={(v, n) => [`${v}%`, n === "planned" ? "Plan" : "Actual"]}
              />
              <Area type="monotone" dataKey="actual" stroke="none" fill={`url(#${gid})`} isAnimationActive={false} connectNulls={false} />
              <Line type="monotone" dataKey="planned" stroke="rgb(var(--planned))" strokeWidth={1.75} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="actual" stroke="rgb(var(--brand-text))" strokeWidth={2.25} dot={false} isAnimationActive={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <details className="mt-1 text-sm">
        <summary className="inline-flex min-h-8 cursor-pointer items-center text-muted hover:text-text">View as table</summary>
        <table className="num mt-1 w-full text-left text-xs">
          <caption className="sr-only">Cumulative planned and actual percent complete over time</caption>
          <thead className="text-muted"><tr><th className="py-0.5 pr-2 font-medium">Date</th><th className="pr-2 font-medium">Plan %</th><th className="font-medium">Actual %</th></tr></thead>
          <tbody>
            {tableRows.map((r) => (
              <tr key={r.date}><td className="pr-2">{fmtDate(r.date)}</td><td className="pr-2">{r.planned}</td><td>{r.actual ?? "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
