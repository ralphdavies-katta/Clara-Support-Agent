"""Classifies emails in emails.json with Claude or Gemini. Incremental: skips already-seen emails."""
import json, os, time
from dotenv import load_dotenv
import db

load_dotenv()
# LLM_PROVIDER=gemini uses a free Google AI Studio key; anything else uses Claude.
PROVIDER = os.getenv("LLM_PROVIDER", "claude").lower()
if PROVIDER == "gemini":
    from google import genai
    from google.genai import types
    MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")
    # Fail fast instead of hanging for minutes when the model is overloaded; the email is retried next sync.
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"), http_options=types.HttpOptions(
        timeout=30_000, retry_options=types.HttpRetryOptions(attempts=2)))
else:
    import anthropic
    MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5")
    client = anthropic.Anthropic(timeout=30, max_retries=2)

CATEGORIES = [
    "Call quality / latency", "Dropped calls / outage", "Booking & scheduling error",
    "Call transfer / routing", "Integration (CRM / calendar)", "Wrong info given by agent",
    "Billing", "Feature request", "Account / setup question", "Positive feedback", "Check-in / follow-up", "Other",
]

SYSTEM = f"""You triage emails arriving at the support inbox of Clara, an AI voice agent product
used by HVAC, fire protection, electrical and plumbing companies in the US.
Return ONLY a JSON object, no markdown, with these keys:
- is_support_issue: true if a customer is reporting a problem, asking for help, requesting a feature, or giving feedback about Clara. false for newsletters, spam, marketing, automated notifications, internal chatter.
- client: the customer's company name (from signature or sender domain); "Unknown" if unclear
- category: one of {CATEGORIES}
- severity: "low" | "medium" | "high" | "critical" (critical = lost revenue, emergency calls missed, or churn threat)
- sentiment: "positive" | "neutral" | "negative" | "angry"
- churn_risk: true or false
- summary: one sentence, max 20 words
- suggested_action: one short sentence for the support team
If is_support_issue is false, the other keys can be empty strings."""

# Appended for mail written by the Clara team (customer success replying to / following up with a customer).
TEAM_SYSTEM = """
This email was written BY the Clara team to a customer, so read the keys this way:
- is_support_issue: true if it acknowledges, works on, or resolves a customer's problem, question or request,
  or is a check-in / follow-up with a customer (use category "Check-in / follow-up", severity "low",
  status "acknowledged" unless it says something was fixed). false for sales, marketing or internal chatter.
- client: the customer company it is addressed to (recipients, greeting, content), never Clara itself
- category, severity, churn_risk, summary: describe the customer's underlying issue
- sentiment: the customer's mood as far as this email reveals it, else "neutral"
- status: "acknowledged" (received it, looking into it, call scheduled), "in_progress" (fix underway,
  waiting on the customer for info), or "resolved" (fixed, answered, or closed)"""

TEAM_STATUSES = {"acknowledged", "in_progress", "resolved"}


def classify(e):
    prompt = (f"From: {e.get('from_name','')} <{e.get('from_email','')}>\nTo: {e.get('to','')}\n"
              f"Subject: {e['subject']}\n\n{e['body']}")
    system = SYSTEM + TEAM_SYSTEM if e.get("from_team") else SYSTEM
    if PROVIDER == "gemini":
        resp = client.models.generate_content(
            model=MODEL, contents=prompt,
            config=types.GenerateContentConfig(system_instruction=system, response_mime_type="application/json"))
        text = resp.text
        time.sleep(5)  # stay under the free tier's requests-per-minute limit
    else:
        msg = client.messages.create(
            model=MODEL, max_tokens=500, system=system,
            messages=[{"role": "user", "content": prompt}])
        text = msg.content[0].text
    text = text.strip().replace("```json", "").replace("```", "").strip()
    return json.loads(text)


def main():
    emails = json.load(open("emails.json"))
    conn = db.connect()
    new = 0
    for e in emails:
        if conn.execute("SELECT 1 FROM seen WHERE id=%s", (e["id"],)).fetchone():
            continue
        try:
            r = classify(e)
        except Exception as ex:
            print(f"  ! {e['id']} failed: {ex}")
            continue  # not marked seen, will retry next sync
        # Another sync may have got here first.
        conn.execute("INSERT INTO seen VALUES (%s) ON CONFLICT DO NOTHING", (e["id"],))
        if r.get("is_support_issue"):
            team = bool(e.get("from_team"))
            # Customer mail is "open"; the dashboard takes its live status from later team replies in the thread.
            status = (r.get("status") if r.get("status") in TEAM_STATUSES else "acknowledged") if team else "open"
            conn.execute("""INSERT INTO tickets (id, received_at, client, from_name, from_email, subject, body,
                category, severity, sentiment, churn_risk, summary, suggested_action, thread_id, sent_at, from_team, status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO UPDATE SET (received_at, client, from_name, from_email, subject, body, category,
                    severity, sentiment, churn_risk, summary, suggested_action, thread_id, sent_at, from_team, status)
                  = (EXCLUDED.received_at, EXCLUDED.client, EXCLUDED.from_name, EXCLUDED.from_email, EXCLUDED.subject,
                    EXCLUDED.body, EXCLUDED.category, EXCLUDED.severity, EXCLUDED.sentiment, EXCLUDED.churn_risk,
                    EXCLUDED.summary, EXCLUDED.suggested_action, EXCLUDED.thread_id, EXCLUDED.sent_at,
                    EXCLUDED.from_team, EXCLUDED.status)""", (
                e["id"], e["received_at"], r.get("client") or "Unknown", e.get("from_name", ""), e.get("from_email", ""),
                e["subject"], e["body"], r.get("category") or "Other", r.get("severity") or "medium",
                r.get("sentiment") or "neutral", bool(r.get("churn_risk")), r.get("summary", ""),
                r.get("suggested_action", ""), e.get("thread_id", ""), e.get("sent_at", ""), team, status))
            new += 1
            tag = f"[team: {status}] " if team else ""
            print(f"+ {r.get('severity', ''):<8} {tag}{r.get('client', '')}: {e['subject'][:50]}")
        conn.commit()  # save after every email so a crash doesn't lose earlier work
    conn.close()
    print(f"Classified. {new} new tickets.")


if __name__ == "__main__":
    main()
