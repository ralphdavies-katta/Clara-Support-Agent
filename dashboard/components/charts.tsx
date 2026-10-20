"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SENTIMENTS, SEVERITIES, type Sentiment, type Severity, type Status } from "@/lib/types";

export const SEV_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
export const SENT_LABEL: Record<Sentiment, string> = { positive: "Positive", neutral: "Neutral", negative: "Negative", angry: "Angry" };
export const STATUS_LABEL: Record<Status, string> = {
  open: "Awaiting reply", acknowledged: "Acknowledged", in_progress: "In progress", resolved: "Resolved",
};

/* Status progresses empty ring -> dot -> half -> check, so it reads without color too. */
export function StatusIcon({ s, size = 12 }: { s: Status; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      {s === "open" && <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" strokeDasharray="2 1.6" />}
      {s === "acknowledged" && (
        <>
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
          <circle cx="6" cy="6" r="1.8" fill="var(--accent)" />
        </>
      )}
      {s === "in_progress" && (
        <>
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
          <path d="M6 1.5a4.5 4.5 0 0 1 0 9z" fill="var(--accent)" />
        </>
      )}
      {s === "resolved" && (
        <>
          <circle cx="6" cy="6" r="5.25" fill="var(--good-ink)" />
          <path d="M3.6 6.2l1.7 1.7 3.2-3.5" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

export function StatusBadge({ s }: { s: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-2">
      <StatusIcon s={s} />
      {STATUS_LABEL[s]}
    </span>
  );
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

/* Severity is never color-alone: each level has its own shape. */
export function SevIcon({ s, size = 12 }: { s: Severity; size?: number }) {
  const fill = `var(--sev-${s})`;
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      {s === "critical" && (
        <>
          <path d="M3.5 0.5h5l3 3v5l-3 3h-5l-3-3v-5z" fill={fill} />
          <path d="M6 3v3.4M6 8.4v.1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {s === "high" && <path d="M6 1l5.2 9.5H0.8z" fill={fill} />}
      {s === "medium" && <rect x="1.5" y="1.5" width="9" height="9" rx="2" fill={fill} />}
      {s === "low" && <circle cx="6" cy="6" r="4.2" fill="none" stroke={fill} strokeWidth="2" />}
    </svg>
  );
}

export function SevBadge({ s }: { s: Severity }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs font-medium text-ink">
      <SevIcon s={s} />
      {SEV_LABEL[s]}
    </span>
  );
}

export function Card({ title, subtitle, children, right }: {
  title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

/* Ranked horizontal bars. Clicking a row toggles it as a filter. */
export function BarList({ items, total, selected, onSelect, empty = "No data" }: {
  items: { key: string; label: string; value: number; color?: string; icon?: React.ReactNode }[];
  total: number;
  selected?: string;
  onSelect?: (key: string) => void;
  empty?: string;
}) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-1">
      {items.map((it) => {
        const dim = selected && selected !== it.key;
        return (
          <li key={it.key}>
            <button
              type="button"
              onClick={() => onSelect?.(it.key)}
              aria-pressed={selected === it.key}
              className={`group relative grid w-full grid-cols-[minmax(0,9rem)_1fr] sm:grid-cols-[minmax(0,11rem)_1fr] items-center gap-3 rounded-md px-2 py-1.5 text-left transition hover:bg-wash ${dim ? "opacity-40" : ""}`}
            >
              <span className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
                {it.icon}
                <span className="truncate" title={it.label}>{it.label}</span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="h-4 rounded-r-sm transition-[width] duration-500"
                  style={{ width: `${(it.value / max) * 100}%`, minWidth: it.value ? 4 : 0, background: it.color ?? "var(--accent)" }}
                />
                <span className="text-sm font-medium tabular-nums text-ink">{it.value}</span>
                <span className="text-xs tabular-nums text-muted opacity-0 transition group-hover:opacity-100">
                  {pct(it.value, total)}%
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* One 100% bar split by sentiment, diverging from positive to angry. */
export function SentimentBar({ counts, total, selected, onSelect }: {
  counts: Record<Sentiment, number>; total: number; selected?: string; onSelect?: (s: Sentiment) => void;
}) {
  if (!total) return <p className="py-6 text-center text-sm text-muted">No data</p>;
  return (
    <div>
      <div className="flex h-7 w-full gap-0.5 overflow-hidden rounded-sm bg-surface">
        {SENTIMENTS.filter((s) => counts[s]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSelect?.(s)}
            title={`${SENT_LABEL[s]}: ${counts[s]} (${pct(counts[s], total)}%)`}
            className={`h-full transition hover:brightness-110 ${selected && selected !== s ? "opacity-30" : ""}`}
            style={{ width: `${(counts[s] / total) * 100}%`, background: `var(--sent-${s})` }}
          />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {SENTIMENTS.map((s) => (
          <li key={s}>
            <button type="button" onClick={() => onSelect?.(s)} className="flex items-center gap-2 rounded px-1 text-left hover:bg-wash">
              <span className="size-2.5 rounded-sm" style={{ background: `var(--sent-${s})` }} />
              <span className="text-xs text-ink-2">{SENT_LABEL[s]}</span>
              <span className="text-xs font-medium tabular-nums text-ink">{counts[s]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type TimePoint = { label: string; total: number } & Record<Severity, number>;

function TimeTooltip({ active, payload }: { active?: boolean; payload?: { payload: TimePoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{p.label}</p>
      <p className="mb-1.5 text-ink-2">{p.total} ticket{p.total === 1 ? "" : "s"}</p>
      {SEVERITIES.filter((s) => p[s]).map((s) => (
        <p key={s} className="flex items-center gap-1.5 text-ink-2">
          <SevIcon s={s} size={10} /> {SEV_LABEL[s]} <span className="ml-auto pl-3 font-medium tabular-nums text-ink">{p[s]}</span>
        </p>
      ))}
    </div>
  );
}

/* A stacked segment with a 2px surface gap; only the topmost non-empty segment gets rounded corners. */
function segment(key: Severity, stack: Severity[]) {
  function Segment(props: unknown) {
    const { x, y, width, height, fill, payload } = props as {
      x: number; y: number; width: number; height: number; fill: string; payload: TimePoint;
    };
    if (!height || height <= 0) return <g />;
    const top = [...stack].reverse().find((k) => payload[k] > 0);
    const h = Math.max(height - 2, 1); // leave a 2px gap above each segment
    const yy = y + 2;
    const r = top === key ? Math.min(4, h, width / 2) : 0;
    const d = `M${x},${yy + h} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + width - r} Q${x + width},${yy} ${x + width},${yy + r} V${yy + h} Z`;
    return <path d={d} fill={fill} />;
  }
  return Segment;
}

/* Tickets per day (or week), stacked by severity. Most severe sits on the baseline. */
export function VolumeChart({ data }: { data: TimePoint[] }) {
  const stack = [...SEVERITIES]; // critical first -> bottom of the stack
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {SEVERITIES.map((s) => (
          <li key={s} className="flex items-center gap-1.5 text-xs text-ink-2">
            <SevIcon s={s} size={10} /> {SEV_LABEL[s]}
          </li>
        ))}
      </ul>
      <ResponsiveContainer width="100%" height={240} initialDimension={{ width: 320, height: 240 }}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} maxBarSize={24} barCategoryGap="25%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="label" tickLine={false} axisLine={{ stroke: "var(--axis)" }}
            tick={{ fill: "var(--muted)", fontSize: 11 }} minTickGap={20} interval="preserveStartEnd"
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip cursor={{ fill: "var(--wash)" }} content={<TimeTooltip />} isAnimationActive={false} />
          {stack.map((s) => (
            <Bar key={s} dataKey={s} stackId="sev" fill={`var(--sev-${s})`} shape={segment(s, stack)} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
