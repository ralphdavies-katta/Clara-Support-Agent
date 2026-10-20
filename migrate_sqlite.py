"""One-time copy of the old tickets.db (SQLite) into Postgres (DATABASE_URL). Safe to re-run."""
import sqlite3, sys
import db

COLS = ["id", "received_at", "client", "from_name", "from_email", "subject", "body", "category", "severity",
        "sentiment", "churn_risk", "summary", "suggested_action", "thread_id", "sent_at", "from_team", "status"]
BOOLS = {"churn_risk", "from_team"}


def main(path="tickets.db"):
    src = sqlite3.connect(path)
    src.row_factory = sqlite3.Row
    have = {r[1] for r in src.execute("PRAGMA table_info(tickets)")}  # older dbs lack the later columns
    defaults = {"thread_id": "", "sent_at": "", "from_team": 0, "status": "open"}
    rows = []
    for r in src.execute("SELECT * FROM tickets"):
        row = [r[c] if c in have else defaults[c] for c in COLS]
        rows.append([bool(v) if c in BOOLS else v for c, v in zip(COLS, row)])
    seen = [(r[0],) for r in src.execute("SELECT id FROM seen")]
    src.close()

    with db.connect() as conn, conn.cursor() as cur:
        cur.executemany(f"INSERT INTO tickets ({', '.join(COLS)}) VALUES ({', '.join(['%s'] * len(COLS))}) "
                        "ON CONFLICT (id) DO NOTHING", rows)
        cur.executemany("INSERT INTO seen VALUES (%s) ON CONFLICT DO NOTHING", seen)
        n_tickets, n_seen = (conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in ("tickets", "seen"))
    print(f"Copied {len(rows)} tickets and {len(seen)} seen ids from {path}. "
          f"Postgres now has {n_tickets} tickets, {n_seen} seen ids.")


if __name__ == "__main__":
    main(*sys.argv[1:])
