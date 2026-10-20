export type Severity = "critical" | "high" | "medium" | "low";
export type Sentiment = "positive" | "neutral" | "negative" | "angry";
// "open" = no reply from the Clara team yet; the rest come from team replies in the same Gmail thread.
export type Status = "open" | "acknowledged" | "in_progress" | "resolved";

export type Ticket = {
  id: string;
  receivedAt: string;
  client: string; // normalized for grouping ("Acme Inc." and "Acme" -> "Acme")
  clientRaw: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  category: string;
  severity: Severity;
  sentiment: Sentiment;
  churnRisk: boolean;
  summary: string;
  suggestedAction: string;
  threadId: string;
  sentAt: string; // exact ISO time ("" for tickets synced before it was recorded)
  fromTeam: boolean; // written by the Clara team (customer success), not the customer
  status: Status;
};

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
export const SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative", "angry"];
export const STATUSES: Status[] = ["open", "acknowledged", "in_progress", "resolved"];
