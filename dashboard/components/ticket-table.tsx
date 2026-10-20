"use client";

import { Fragment, useMemo, useState } from "react";
import { SEVERITIES, type Ticket } from "@/lib/types";
import { SENT_LABEL, SevBadge, StatusBadge } from "./charts";

type SortKey = "severity" | "date" | "client";
const sevRank = (t: Ticket) => SEVERITIES.indexOf(t.severity);
const when = (t: Ticket) => +parseDate(t.sentAt || t.receivedAt);

export function formatDate(s: string) {
  const d = parseDate(s);
  return isNaN(+d) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function parseDate(s: string) {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
}

export function TicketTable({ tickets }: { tickets: Ticket[] }) {
  const [sort, setSort] = useState<SortKey>("severity");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const byDate = (a: Ticket, b: Ticket) => when(b) - when(a);
    return [...tickets].sort((a, b) =>
      sort === "severity" ? sevRank(a) - sevRank(b) || byDate(a, b)
      : sort === "date" ? byDate(a, b)
      : a.client.localeCompare(b.client) || byDate(a, b),
    );
  }, [tickets, sort]);

  const th = (children: string, k?: SortKey, className = "") => (
    <th className={`px-3 py-2.5 text-left text-xs font-medium text-muted ${className}`}>
      {k ? (
        <button type="button" onClick={() => setSort(k)} className={`hover:text-ink ${sort === k ? "text-ink" : ""}`}>
          {children} {sort === k && "↓"}
        </button>
      ) : children}
    </th>
  );

  if (!rows.length) return <p className="py-10 text-center text-sm text-muted">No tickets match these filters.</p>;

  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead className="border-b border-line">
          <tr>
            {th("Received", "date", "pl-5")}
            {th("Client", "client")}
            {th("Issue")}
            {th("Category")}
            {th("Severity", "severity")}
            {th("Status")}
            {th("Sentiment", undefined, "pr-5")}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <Fragment key={t.id}>
              <tr
                onClick={() => setOpen(open === t.id ? null : t.id)}
                className={`cursor-pointer border-b border-line align-top transition hover:bg-wash ${open === t.id ? "bg-wash" : ""}`}
              >
                <td className="whitespace-nowrap py-3 pl-5 pr-3 tabular-nums text-ink-2">{formatDate(t.receivedAt)}</td>
                <td className="px-3 py-3 font-medium text-ink">
                  {t.client}
                  {t.fromTeam && (
                    <span className="ml-2 inline-block whitespace-nowrap rounded-sm border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-2">
                      Team reply
                    </span>
                  )}
                  {t.churnRisk && (
                    <span className="ml-2 inline-block whitespace-nowrap rounded-sm bg-[var(--sev-critical)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Churn risk
                    </span>
                  )}
                </td>
                <td className="max-w-md px-3 py-3">
                  <p className="font-medium text-ink">{t.subject}</p>
                  <p className="mt-0.5 text-ink-2">{t.summary}</p>
                </td>
                <td className="px-3 py-3 text-ink-2">{t.category}</td>
                <td className="px-3 py-3"><SevBadge s={t.severity} /></td>
                <td className="px-3 py-3"><StatusBadge s={t.status} /></td>
                <td className="py-3 pl-3 pr-5">
                  <span className="inline-flex items-center gap-1.5 text-ink-2">
                    <span className="size-2 rounded-full" style={{ background: `var(--sent-${t.sentiment})` }} />
                    {SENT_LABEL[t.sentiment]}
                  </span>
                </td>
              </tr>
              {open === t.id && (
                <tr className="border-b border-line bg-wash">
                  <td colSpan={7} className="px-5 pb-5 pt-1">
                    <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-medium text-muted">Suggested action</p>
                          <p className="mt-1 text-ink">{t.suggestedAction || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted">From</p>
                          <p className="mt-1 text-ink-2">
                            {t.fromName} {t.fromEmail && <a className="text-accent hover:underline" href={`mailto:${t.fromEmail}`}>&lt;{t.fromEmail}&gt;</a>}
                            {t.fromTeam && <span className="text-muted"> · Clara team</span>}
                          </p>
                        </div>
                        {t.clientRaw !== t.client && (
                          <div>
                            <p className="text-xs font-medium text-muted">Client as written</p>
                            <p className="mt-1 text-ink-2">{t.clientRaw}</p>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted">Email</p>
                        <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 font-sans text-[13px] leading-relaxed text-ink-2">
                          {t.body}
                        </pre>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
