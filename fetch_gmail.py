"""Pulls real emails from Gmail (read-only) into emails.json."""
import base64, html, json, os, re
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr, parsedate_to_datetime
from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
import db

load_dotenv()
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
# Reads whichever Google account signs in (any test user on the OAuth consent screen).
# Only email involving the support address (or sent by customer success) is picked up.
SUPPORT = os.getenv("SUPPORT_ADDRESS", "support@justclara.ai").lower()
CS = os.getenv("CS_ADDRESS", "customersuccess@justclara.ai").lower()
# Mail from these senders is the Clara team replying (acknowledging / resolving an issue), not a customer.
TEAM_ADDRESSES = {CS} | {a.strip().lower() for a in os.getenv("TEAM_ADDRESSES", "").split(",") if a.strip()}
TEAM_DOMAINS = {d.strip().lower().lstrip("@") for d in os.getenv("TEAM_DOMAINS", "justclara.ai").split(",") if d.strip()}
# Searches all folders except spam/trash; main() limits it to the last GMAIL_DAYS days (1 = today only).
QUERY = os.getenv("GMAIL_QUERY", f"{{to:{SUPPORT} cc:{SUPPORT} bcc:{SUPPORT} deliveredto:{SUPPORT} from:{CS}}}")
DAYS = max(1, int(os.getenv("GMAIL_DAYS", "1")))
MAX_EMAILS = int(os.getenv("GMAIL_MAX", "0"))  # 0 = no limit


def is_team(addr):
    addr = addr.lower()
    return addr in TEAM_ADDRESSES or addr.rsplit("@", 1)[-1] in TEAM_DOMAINS


def get_service():
    creds = None
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
            creds = flow.run_local_server(port=0, prompt="select_account")  # browser account picker
        open("token.json", "w").write(creds.to_json())
    return build("gmail", "v1", credentials=creds)


def extract_body(payload):
    plain, html_ = [], []

    def walk(p):
        data = p.get("body", {}).get("data")
        if data and p.get("mimeType") == "text/plain":
            plain.append(base64.urlsafe_b64decode(data).decode("utf-8", "replace"))
        elif data and p.get("mimeType") == "text/html":
            html_.append(base64.urlsafe_b64decode(data).decode("utf-8", "replace"))
        for sub in p.get("parts") or []:
            walk(sub)

    walk(payload)
    text = "\n".join(plain)
    if not text.strip():
        raw = "\n".join(html_)
        raw = re.sub(r"<(script|style).*?</\1>", "", raw, flags=re.S)
        text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    text = "\n".join(l for l in text.splitlines() if not l.strip().startswith(">"))  # drop quoted replies
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()[:4000]


def already_seen():
    """Ids classify.py has already processed, so we don't re-download them on every sync."""
    with db.connect() as conn:
        return {r[0] for r in conn.execute("SELECT id FROM seen")}


def main():
    svc = get_service()
    me = svc.users().getProfile(userId="me").execute()["emailAddress"].lower()
    midnight = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=DAYS - 1)
    query = f"{QUERY} after:{int(midnight.timestamp())}"  # in this computer's time zone
    ids, token = [], None
    while not MAX_EMAILS or len(ids) < MAX_EMAILS:
        r = svc.users().messages().list(userId="me", q=query, pageToken=token, includeSpamTrash=False,
                                        maxResults=500 if not MAX_EMAILS else min(500, MAX_EMAILS - len(ids))).execute()
        ids += [m["id"] for m in r.get("messages", [])]
        token = r.get("nextPageToken")
        if not token:
            break

    # Keep previously fetched emails, only download ones we haven't seen yet.
    old = json.load(open("emails.json")) if os.path.exists("emails.json") else []
    seen, wanted = already_seen(), set(ids)
    emails = [e for e in old if e["id"] in wanted and e["id"] not in seen]
    have = seen | {e["id"] for e in emails}
    for mid in ids:
        if mid in have:
            continue
        m = svc.users().messages().get(userId="me", id=mid, format="full").execute()
        h = {x["name"].lower(): x["value"] for x in m["payload"]["headers"]}
        name, addr = parseaddr(h.get("from", ""))
        if addr.lower() == SUPPORT:
            continue  # skip mail sent as the support address itself
        involved = " ".join(h.get(k, "") for k in ("to", "cc", "bcc", "delivered-to", "x-original-to")).lower()
        if SUPPORT not in involved and addr.lower() != CS:
            continue  # Gmail search can be fuzzy; only keep mail actually addressed to support
        try:
            when = parsedate_to_datetime(h["date"]).date().isoformat()
        except Exception:
            when = ""
        emails.append({"id": mid, "thread_id": m["threadId"], "received_at": when,
                       "sent_at": datetime.fromtimestamp(int(m["internalDate"]) / 1000, timezone.utc).isoformat(),
                       "from_name": name or addr, "from_email": addr, "from_team": is_team(addr),
                       "to": ", ".join(h[k] for k in ("to", "cc") if h.get(k)),
                       "subject": h.get("subject", "(no subject)"), "body": extract_body(m["payload"])})
    json.dump(emails, open("emails.json", "w"), indent=2)
    print(f"{len(ids)} matching emails in {me}; {len(emails)} new/pending in emails.json (query: {query})")


if __name__ == "__main__":
    main()
