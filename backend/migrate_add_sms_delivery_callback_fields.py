import sqlite3
import os

def migrate():
    db_path = "backend/sms_auto.db"
    if not os.path.exists(db_path):
        # Try local run context
        db_path = "sms_auto.db"
        if not os.path.exists(db_path):
            print(f"Error: Could not find database file 'sms_auto.db'.")
            return

    print(f"Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get current columns in gateway_sms_logs
    cursor.execute("PRAGMA table_info(gateway_sms_logs)")
    columns = [col[1] for col in cursor.fetchall()]

    new_columns = {
        "delivery_status": "VARCHAR",
        "delivery_error": "TEXT",
        "callback_payload": "TEXT",
        "delivered_at": "DATETIME"
    }

    modified = False
    for col_name, col_type in new_columns.items():
        if col_name not in columns:
            print(f"Adding column '{col_name}' ({col_type}) to 'gateway_sms_logs'...")
            cursor.execute(f"ALTER TABLE gateway_sms_logs ADD COLUMN {col_name} {col_type}")
            modified = True
        else:
            print(f"Column '{col_name}' already exists. Skipping.")

    if modified:
        conn.commit()
        print("Database migration completed successfully!")
    else:
        print("No migration needed. All columns already exist.")

    conn.close()

if __name__ == "__main__":
    migrate()
