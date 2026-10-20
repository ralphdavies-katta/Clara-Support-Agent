"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SENTIMENTS, SEVERITIES, STATUSES, type Sentiment, type Severity, type Status, type Ticket } from "@/lib/types";
import { BarList, Card, SENT_LABEL, SEV_LABEL, STATUS_LABEL, SentimentBar, SevBadge, SevIcon, StatusIcon, VolumeChart, type TimePoint } from "./charts";
import { TicketTable, formatDate, parseDate } from "./ticket-table";

type Range = "7" | "30" | "90" | "all";
type Filters = { q: string; client: string; category: string; severity: string; sentiment: string; status: string; range: Range };
const NO_FILTERS: Filters = { q: "", client: "", category: "", severity: "", sentiment: "", status: "", range: "all" };
const DAY = 86_400_000;
const RANGES: { key: Range; label: string }[] = [
  { key: "7", label: "7d" }, { key: "30", label: "30d" }, { key: "90", label: "90d" }, { key: "all", label: "All" },
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

function countBy<T extends string>(items: Ticket[], key: (t: Ticket) => T) {
  const m = new Map<T, number>();
  for (const t of items) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function buildSeries(tickets: Ticket[], range: Range): { data: TimePoint[]; weekly: boolean } {
  if (!tickets.length) return { data: [], weekly: false };
  const days = tickets.map((t) => +startOfDay(parseDate(t.receivedAt))).filter((n) => !isNaN(n));
  const end = Math.max(+startOfDay(new Date()), ...days);
  let start = range === "all" ? Math.min(...days) : end - (Number(range) - 1) * DAY;
  start = Math.min(start, end - 13 * DAY); // always show at least two weeks of context
  const weekly = (end - start) / DAY > 92;
  const step = weekly ? 7 * DAY : DAY;
  const buckets: TimePoint[] = [];
  for (let b = start; b <= end; b += step) {
    const d = new Date(b);
    buckets.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + (weekly ? " wk" : ""),
      total: 0, critical: 0, high: 0, medium: 0, low: 0,
    });
  }
  for (const t of tickets) {
    const i = Math.floor((+startOfDay(parseDate(t.receivedAt)) - start) / step);
    if (i >= 0 && i < buckets.length) { buckets[i][t.severity]++; buckets[i].total++; }
  }
  return { data: buckets, weekly };
}

export default function Dashboard({ tickets, dbFound }: { tickets: Ticket[]; dbFound: boolean }) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const toggle = (k: keyof Omit<Filters, "range" | "q">, v: string) => setF((p) => ({ ...p, [k]: p[k] === v ? "" : v }));

  const clients = useMemo(() => [...new Set(tickets.map((t) => t.client))].sort(), [tickets]);
  const categories = useMemo(() => [...new Set(tickets.map((t) => t.category))].sort(), [tickets]);

  const view = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const cutoff = f.range === "all" ? -Infinity : +startOfDay(new Date()) - (Number(f.range) - 1) * DAY;
    return tickets.filter((t) =>
      (!f.client || t.client === f.client) &&
      (!f.category || t.category === f.category) &&
      (!f.severity || t.severity === f.severity) &&
      (!f.sentiment || t.sentiment === f.sentiment) &&
      (!f.status || t.status === f.status) &&
      +parseDate(t.receivedAt) >= cutoff &&
      (!q || [t.client, t.subject, t.summary, t.body, t.fromEmail].some((s) => s.toLowerCase().includes(q))),
    );
  }, [tickets, f]);

  const total = view.length;
  const sevCounts = Object.fromEntries(SEVERITIES.map((s) => [s, view.filter((t) => t.severity === s).length])) as Record<Severity, number>;
  // Sentiment only means something for mail customers wrote, not team replies.
  const fromCustomers = view.filter((t) => !t.fromTeam);
  const sentCounts = Object.fromEntries(SENTIMENTS.map((s) => [s, fromCustomers.filter((t) => t.sentiment === s).length])) as Record<Sentiment, number>;
  const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, view.filter((t) => t.status === s).length])) as Record<Status, number>;
  const urgent = sevCounts.critical + sevCounts.high;
  const unhappy = sentCounts.negative + sentCounts.angry;
  const awaiting = fromCustomers.filter((t) => t.status === "open").length;
  const churn = view.filter((t) => t.churnRisk);
  const series = useMemo(() => buildSeries(view, f.range), [view, f.range]);

  const byClient = countBy(view, (t) => t.client);
  const TOP = 8;
  const clientItems = byClient.slice(0, TOP).map(([k, v]) => ({ key: k, label: k, value: v }));
  if (byClient.length > TOP) {
    const rest = byClient.slice(TOP);
    clientItems.push({ key: "__other", label: `Other (${rest.length} clients)`, value: rest.reduce((a, [, v]) => a + v, 0) });
  }
  const active = JSON.stringify(f) !== JSON.stringify(NO_FILTERS);

  if (!tickets.length) return <EmptyState dbFound={dbFound} />;

  return (
    <main className="mx-auto max-w-7xl overflow-x-clip px-4 py-8 sm:px-6">
      <Header count={tickets.length} />

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search tickets…"
          className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent sm:w-56"
        />
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Select label="Client" plural="clients" value={f.client} options={clients} onChange={(v) => setF({ ...f, client: v })} />
          <Select label="Category" plural="categories" value={f.category} options={categories} onChange={(v) => setF({ ...f, category: v })} />
          <Select label="Severity" plural="severities" value={f.severity} options={SEVERITIES} format={(s) => SEV_LABEL[s as Severity]} onChange={(v) => setF({ ...f, severity: v })} />
          <Select label="Sentiment" plural="sentiments" value={f.sentiment} options={SENTIMENTS} format={(s) => SENT_LABEL[s as Sentiment]} onChange={(v) => setF({ ...f, sentiment: v })} />
          <Select label="Status" plural="statuses" value={f.status} options={STATUSES} format={(s) => STATUS_LABEL[s as Status]} onChange={(v) => setF({ ...f, status: v })} />
        </div>
        <div className="flex h-9 items-center rounded-lg border border-line bg-surface p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key} type="button" onClick={() => setF({ ...f, range: r.key })}
              className={`h-full rounded-md px-3 text-xs font-medium transition ${f.range === r.key ? "bg-ink text-surface" : "text-ink-2 hover:bg-wash"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {active && (
          <button type="button" onClick={() => setF(NO_FILTERS)} className="h-9 px-2 text-sm text-accent hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="col-span-2 grid lg:col-span-1">
          <Stat label="Support tickets" value={total} hint={active ? `of ${tickets.length} total` : `${total - fromCustomers.length} are team replies`} hero />
        </div>
        <Stat
          label="Awaiting reply" value={awaiting} hint={`${statusCounts.acknowledged + statusCounts.in_progress} acknowledged · ${statusCounts.resolved} resolved`}
          icon={<StatusIcon s="open" size={14} />} onClick={() => toggle("status", "open")}
        />
        <Stat
          label="Critical or high" value={urgent} hint={`${pct(urgent, total)}% of tickets`}
          icon={<SevIcon s="critical" size={14} />} onClick={() => toggle("severity", sevCounts.critical ? "critical" : "high")}
        />
        <Stat label="Negative or angry" value={unhappy} hint={`${pct(unhappy, fromCustomers.length)}% of customer emails`}
          icon={<span className="size-3 rounded-full" style={{ background: "var(--sent-angry)" }} />} />
        <Stat label="Churn risk" value={churn.length} hint={churn.length ? `${new Set(churn.map((t) => t.client)).size} client(s) to call` : "No accounts flagged"}
          icon={<span className="text-[13px] leading-none">⚠</span>} />
      </div>

      {/* Volume + severity */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Card title="Ticket volume" subtitle={`Tickets per ${series.weekly ? "week" : "day"}, by severity`}>
            <VolumeChart data={series.data} />
          </Card>
        </div>
        <Card title="Severity" subtitle="Click a level to filter">
          <BarList
            total={total} selected={f.severity} onSelect={(k) => toggle("severity", k)}
            items={SEVERITIES.map((s) => ({ key: s, label: SEV_LABEL[s], value: sevCounts[s], color: `var(--sev-${s})`, icon: <SevIcon s={s} /> }))}
          />
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Sentiment</h3>
            <SentimentBar counts={sentCounts} total={fromCustomers.length} selected={f.sentiment} onSelect={(s) => toggle("sentiment", s)} />
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Status</h3>
            <BarList
              total={total} selected={f.status} onSelect={(k) => toggle("status", k)}
              items={STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], value: statusCounts[s], icon: <StatusIcon s={s} /> }))}
            />
          </div>
        </Card>
      </div>

      {/* Categories + clients */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Issues by category" subtitle="What customers are writing in about">
          <BarList
            total={total} selected={f.category} onSelect={(k) => toggle("category", k)}
            items={countBy(view, (t) => t.category).map(([k, v]) => ({ key: k, label: k, value: v }))}
          />
        </Card>
        <Card title="Issues by client" subtitle={`Top ${Math.min(TOP, byClient.length)} of ${byClient.length} clients`}>
          <BarList
            total={total} selected={f.client} onSelect={(k) => k !== "__other" && toggle("client", k)}
            items={clientItems}
          />
        </Card>
      </div>

      {/* Churn watchlist */}
      <div className="mt-4">
        <Card title="Churn-risk watchlist" subtitle="Accounts the classifier flagged as likely to leave">
          {churn.length ? (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {churn.map((t) => (
                <li key={t.id} className="rounded-lg border border-line p-4" style={{ borderLeft: "3px solid var(--sev-critical)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold text-ink">{t.client}</p>
                    <SevBadge s={t.severity} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{formatDate(t.receivedAt)} · {t.category}</p>
                  <p className="mt-2 text-sm text-ink-2">{t.summary}</p>
                  <p className="mt-2 text-sm text-ink"><span className="font-medium">Next step: </span>{t.suggestedAction}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 py-2 text-sm text-ink-2">
              <span className="font-semibold text-[var(--good-ink)]">✓</span> No churn risks in this view.
            </p>
          )}
        </Card>
      </div>

      {/* Table */}
      <div className="mt-4">
        <Card title="All tickets" subtitle={`${total} ticket${total === 1 ? "" : "s"} · click a row to read the email`}>
          <TicketTable tickets={view} />
        </Card>
      </div>
    </main>
  );
}

function Stat({ label, value, hint, icon, hero, onClick }: {
  label: string; value: number; hint: string; icon?: React.ReactNode; hero?: boolean; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`rounded-xl border border-line bg-surface p-5 text-left ${onClick ? "transition hover:border-accent" : ""}`}
    >
      <p className="flex items-center gap-2 text-sm text-ink-2">{icon}{label}</p>
      <p className={`mt-2 font-semibold tracking-tight text-ink ${hero ? "text-5xl" : "text-4xl"}`}>{value.toLocaleString("en-US")}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </Tag>
  );
}

function Select({ label, plural, value, options, onChange, format = (s) => s }: {
  label: string; plural: string; value: string; options: readonly string[]; onChange: (v: string) => void; format?: (s: string) => string;
}) {
  return (
    <select
      aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className={`h-9 w-full min-w-0 rounded-lg sm:w-auto sm:max-w-48 border bg-surface px-2.5 text-sm outline-none focus:border-accent ${value ? "border-accent text-ink" : "border-line text-ink-2"}`}
    >
      <option value="">All {plural}</option>
      {options.map((o) => <option key={o} value={o}>{format(o)}</option>)}
    </select>
  );
}

function Header({ count }: { count?: number }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [state, setState] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [log, setLog] = useState("");
  const [showLog, setShowLog] = useState(false);

  async function sync() {
    setState("running");
    setShowLog(false);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = (await res.json()) as { ok: boolean; log: string };
      setLog(body.log);
      setState(body.ok ? "ok" : "error");
      if (!body.ok) setShowLog(true);
      startRefresh(() => router.refresh());
    } catch (e) {
      setLog(String(e));
      setState("error");
      setShowLog(true);
    }
  }

  const busy = state === "running" || refreshing;
  const lastLine = log.trim().split("\n").pop();

  return (
    <header>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Clara · Support inbox</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Support dashboard</h1>
          {count !== undefined && <p className="mt-1 text-sm text-ink-2">{count} support ticket{count === 1 ? "" : "s"} classified by AI</p>}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button" onClick={sync} disabled={busy}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-60"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={busy ? "animate-spin" : ""} aria-hidden>
              <path d="M14 8a6 6 0 1 1-1.8-4.3M14 2v4h-4" />
            </svg>
            {busy ? "Syncing…" : "Sync new emails"}
          </button>
        </div>
      </div>
      {state !== "idle" && state !== "running" && (
        <div className={`mt-4 rounded-lg border px-4 py-2.5 text-sm ${state === "error" ? "border-[var(--sev-critical)]" : "border-line"} bg-surface`}>
          <div className="flex items-center justify-between gap-4">
            <span className="text-ink-2">
              {state === "ok" ? <span className="font-semibold text-[var(--good-ink)]">✓ </span> : <span className="font-semibold text-[var(--sev-critical)]">✕ Sync failed · </span>}
              {lastLine || "Done"}
            </span>
            <button type="button" onClick={() => setShowLog(!showLog)} className="shrink-0 text-xs text-accent hover:underline">
              {showLog ? "Hide log" : "Show log"}
            </button>
          </div>
          {showLog && <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs text-ink-2">{log}</pre>}
        </div>
      )}
    </header>
  );
}

function ThemeToggle() {
  // data-theme is set before paint by the script in layout.tsx; the icon swaps via the dark: variant.
  const flip = () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch {}
  };
  return (
    <button
      type="button" onClick={flip} aria-label="Toggle dark mode"
      className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-wash"
    >
      <span className="dark:hidden">☾</span>
      <span className="hidden dark:inline">☀</span>
    </button>
  );
}

function EmptyState({ dbFound }: { dbFound: boolean }) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Header />
      <div className="mt-10 rounded-xl border border-dashed border-line bg-surface p-12 text-center">
        <p className="text-lg font-semibold text-ink">No support tickets yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
          {dbFound
            ? "The database has no support tickets yet. Click “Sync new emails” to fetch and classify, or check GMAIL_QUERY in .env."
            : "DATABASE_URL isn’t set. Add your Postgres connection string to dashboard/.env.local and restart."}
        </p>
      </div>
    </main>
  );
}
