"""Safe migration: add columns to gateway_sms_logs if missing (SQLite).

Run: python migrate_add_gateway_log_fields.py
"""
import os
import sqlite3
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL", "sqlite:///./sms_auto.db")
# Support only sqlite:///./path or sqlite:///absolute
if DB_URL.startswith("sqlite:///"):
    path = DB_URL.replace("sqlite:///", "")
else:
    raise SystemExit("This migration script only supports SQLite DATABASE_URL")

cols_to_add = {
    "detected_provider": "TEXT",
    "requested_provider": "TEXT",
    "routing_strategy": "TEXT",
}

print(f"Opening DB: {path}")
conn = sqlite3.connect(path)
cur = conn.cursor()

cur.execute("PRAGMA table_info('gateway_sms_logs')")
existing = {row[1] for row in cur.fetchall()}

for col, coltype in cols_to_add.items():
    if col in existing:
        print(f"Column {col} already exists, skipping")
    else:
        sql = f"ALTER TABLE gateway_sms_logs ADD COLUMN {col} {coltype}"
        print(f"Adding column: {col}")
        cur.execute(sql)
        conn.commit()

print("Migration complete.")
conn.close()
