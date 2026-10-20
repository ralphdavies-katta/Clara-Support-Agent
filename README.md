# Clara Support Agent (real Gmail data)

Reads the support inbox, has an LLM triage each email, stores tickets in Postgres (Neon) and shows them on a dashboard.

```
Gmail --fetch_gmail.py--> emails.json --classify.py (Gemini/Claude)--> Neon Postgres --> dashboard (Next.js)
```
`sync.py` runs both steps; the dashboard's **Sync new emails** button runs `sync.py`.

## One-time Google setup (10 min)
1. console.cloud.google.com -> create a project
2. APIs & Services -> Library -> enable **Gmail API**
3. APIs & Services -> OAuth consent screen -> User type **Internal** (if your company uses Google Workspace) or External + add yourself as a Test user
4. Credentials -> Create credentials -> OAuth client ID -> **Desktop app** -> Download JSON
5. Save it in this folder as `credentials.json`

## One-time database setup (Neon Postgres)
The project is linked to Neon project `ancient-boat-83612971`, branch `production` (see `dashboard/.neon` and `dashboard/neon.ts`).
```bash
npm i -g neon
cd dashboard
neon login
neon env pull               # writes DATABASE_URL, DATABASE_URL_UNPOOLED, NEON_BRANCH to dashboard/.env.local
```
Then copy the `DATABASE_URL` line from `dashboard/.env.local` into the root `.env` too: the Python scripts and the
dashboard must point at the same database. Use the pooled URL (`-pooler` in the hostname) for both.
Any other Postgres works as well, e.g. `DATABASE_URL=postgresql://user:pass@host:5432/db`.
Tables (`tickets`, `seen`) are created automatically on first connect (`db.py`).

## Run
```bash
python -m venv .venv
source .venv/Scripts/activate      # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python sync.py                     # first run opens a browser to approve read-only Gmail access
python sync.py --loop              # or: sync every 5 minutes
```
Root `.env` settings:

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres connection string (required) |
| `LLM_PROVIDER` | `gemini` (free AI Studio key) or anything else for Claude |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini key / model (default `gemini-flash-lite-latest`) |
| `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | Claude key / model |
| `SUPPORT_ADDRESS`, `CS_ADDRESS` | Default `support@justclara.ai`, `customersuccess@justclara.ai` |
| `GMAIL_QUERY` | Override the Gmail search |
| `GMAIL_DAYS` | Days back each sync looks (default 1 = today only) |
| `GMAIL_MAX` | Max emails per sync (default 0 = no limit) |
| `TEAM_DOMAINS`, `TEAM_ADDRESSES` | Senders counted as the Clara team |

Never commit credentials.json, token.json, .env, dashboard/.env.local or tickets.db.

## How a sync works
1. `fetch_gmail.py` searches Gmail for mail to/cc/bcc the support address (or from customer success), skips ids
   already in the `seen` table, and saves new emails (body trimmed, quoted replies removed) to `emails.json`.
2. `classify.py` sends each unseen email to the LLM, which returns JSON: support issue or not, client, category,
   severity, sentiment, churn risk, summary and suggested action. Every processed id goes into `seen`; real
   support issues go into `tickets`. Failed LLM calls are not marked seen, so they retry next sync.

## Team replies
Mail from customersuccess@justclara.ai and from `TEAM_DOMAINS` / `TEAM_ADDRESSES` (in `.env`) is treated as the
Clara team answering a customer. The classifier gives it a status (acknowledged / in progress / resolved), and
customer emails in the same Gmail thread take the status of the latest team reply; until then they show as
"Awaiting reply". This is worked out by the dashboard on every page load (`dashboard/lib/db.ts`).

## Dashboard (`dashboard/`, Next.js)
Reads tickets from Postgres (`DATABASE_URL` in `dashboard/.env.local`) on every request; the **Sync new emails**
button runs `sync.py` with `.venv`'s Python.
```bash
cd dashboard
npm install
npm run dev                 # http://localhost:3000
```
Optional env var (in `dashboard/.env.local`): `PYTHON_BIN` (default `../.venv/Scripts/python.exe`).

## Migrating old data
Tickets used to live in a local SQLite file (`tickets.db`). `python migrate_sqlite.py` copies it into Postgres
(safe to re-run). This has already been done; `tickets.db` is no longer used.
