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

    # Thêm các cột cho gateway_devices
    try:
        cursor.execute("ALTER TABLE gateway_devices ADD COLUMN provider VARCHAR;")
        print("Added 'provider' to gateway_devices.")
    except sqlite3.OperationalError as e:
        print(f"Skipped 'provider': {e}")

    try:
        cursor.execute("ALTER TABLE gateway_devices ADD COLUMN is_default BOOLEAN DEFAULT 0;")
        print("Added 'is_default' to gateway_devices.")
    except sqlite3.OperationalError as e:
        print(f"Skipped 'is_default': {e}")

    try:
        cursor.execute("ALTER TABLE gateway_devices ADD COLUMN daily_limit INTEGER DEFAULT 0;")
        print("Added 'daily_limit' to gateway_devices.")
    except sqlite3.OperationalError as e:
        print(f"Skipped 'daily_limit': {e}")

    try:
        cursor.execute("ALTER TABLE gateway_devices ADD COLUMN sent_today INTEGER DEFAULT 0;")
        print("Added 'sent_today' to gateway_devices.")
    except sqlite3.OperationalError as e:
        print(f"Skipped 'sent_today': {e}")

    # Thêm cột cho gateway_sms_logs
    try:
        cursor.execute("ALTER TABLE gateway_sms_logs ADD COLUMN device_id VARCHAR REFERENCES gateway_devices(id);")
        print("Added 'device_id' to gateway_sms_logs.")
    except sqlite3.OperationalError as e:
        print(f"Skipped 'device_id': {e}")

    # Tạo index cho device_id
    try:
        cursor.execute("CREATE INDEX ix_gateway_sms_logs_device_id ON gateway_sms_logs(device_id);")
        print("Created index 'ix_gateway_sms_logs_device_id'.")
    except sqlite3.OperationalError as e:
        print(f"Skipped index creation: {e}")

    conn.commit()
    conn.close()
    print("Migration completed.")

if __name__ == "__main__":
    migrate()
