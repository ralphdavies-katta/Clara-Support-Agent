"""Postgres connection + schema shared by fetch_gmail.py, classify.py and migrate_sqlite.py."""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

SCHEMA = """
CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY, received_at TEXT, client TEXT, from_name TEXT, from_email TEXT, subject TEXT,
    body TEXT, category TEXT, severity TEXT, sentiment TEXT, churn_risk BOOLEAN, summary TEXT,
    suggested_action TEXT, thread_id TEXT, sent_at TEXT, from_team BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'open');
CREATE INDEX IF NOT EXISTS tickets_thread_id ON tickets (thread_id);
CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY);
"""


def connect():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set (add it to .env), e.g. postgresql://user:pass@host:5432/db")
    # No server-side prepared statements, so pooled URLs (Supabase / Neon / PgBouncer) work too.
    conn = psycopg.connect(url, prepare_threshold=None)
    conn.execute(SCHEMA)
    conn.commit()
    return conn
