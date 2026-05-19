import sqlite3
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sms_auto.db")
db_path = DATABASE_URL.replace("sqlite:///", "")

def migrate():
    print(f"Migrating database at {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("ALTER TABLE users ADD COLUMN daily_quota INTEGER DEFAULT 100;")
        print("Added 'daily_quota' to users.")
    except sqlite3.OperationalError as e:
        print(f"Skipped 'daily_quota': {e}")

    conn.commit()
    conn.close()
    print("Migration completed.")

if __name__ == "__main__":
    migrate()
