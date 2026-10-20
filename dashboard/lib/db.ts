import "server-only";
import { Pool } from "pg";
import { SENTIMENTS, SEVERITIES, STATUSES, type Sentiment, type Severity, type Status, type Ticket } from "./types";

// The Python pipeline (classify.py) writes tickets to the same Postgres database (DATABASE_URL).
// One pool per server process; kept on globalThis so dev hot reloads don't open a new pool each time.
const g = globalThis as unknown as { ticketsPool?: Pool };
function pool() {
  g.ticketsPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return g.ticketsPool;
}

type Row = {
  id: string; received_at: string; client: string; from_name: string; from_email: string;
  subject: string; body: string; category: string; severity: string; sentiment: string;
  churn_risk: boolean; summary: string; suggested_action: string;
  thread_id: string | null; sent_at: string | null; from_team: boolean | null; status: string | null;
};

const SUFFIX = /[,\s]+(inc|llc|l\.l\.c|ltd|co|corp|corporation|company)\.?$/i;

function normalizeClient(name: string) {
  let n = (name || "Unknown").trim();
  while (SUFFIX.test(n)) n = n.replace(SUFFIX, "").trim();
  return n || "Unknown";
}

export async function getTickets(): Promise<{ tickets: Ticket[]; dbFound: boolean }> {
  if (!process.env.DATABASE_URL) return { tickets: [], dbFound: false };
  // The table is created by the first sync; until then there's nothing to show.
  const { rows: found } = await pool().query("SELECT to_regclass('tickets') IS NOT NULL AS ok");
  if (!found[0].ok) return { tickets: [], dbFound: true };
  const { rows } = await pool().query<Row>("SELECT * FROM tickets ORDER BY received_at DESC");
  const tickets = rows.map((r): Ticket => ({
    id: r.id,
    receivedAt: r.received_at,
    client: normalizeClient(r.client),
    clientRaw: r.client,
    fromName: r.from_name ?? "",
    fromEmail: r.from_email ?? "",
    subject: r.subject ?? "",
    body: r.body ?? "",
    category: r.category || "Other",
    severity: (SEVERITIES as string[]).includes(r.severity) ? (r.severity as Severity) : "medium",
    sentiment: (SENTIMENTS as string[]).includes(r.sentiment) ? (r.sentiment as Sentiment) : "neutral",
    churnRisk: Boolean(r.churn_risk),
    summary: r.summary ?? "",
    suggestedAction: r.suggested_action ?? "",
    threadId: r.thread_id ?? "",
    sentAt: r.sent_at ?? "",
    fromTeam: Boolean(r.from_team),
    status: r.from_team && (STATUSES as string[]).includes(r.status ?? "") ? (r.status as Status) : "open",
  }));
  // A customer email takes the status of the latest team reply sent after it in the same thread.
  const replies = tickets.filter((t) => t.fromTeam && t.threadId).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  for (const t of tickets) {
    if (t.fromTeam || !t.threadId) continue;
    const latest = replies.find((r) => r.threadId === t.threadId && r.sentAt > t.sentAt);
    if (latest) t.status = latest.status;
  }
  return { tickets, dbFound: true };
}
