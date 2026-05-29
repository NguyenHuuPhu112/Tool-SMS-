import sqlite3
import os
import sys

def migrate():
    db_path = os.path.join(os.path.dirname(__file__), "sms_auto.db")
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check users table columns
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'email' not in columns:
            print("Adding email column to users table...")
            cursor.execute("ALTER TABLE users ADD COLUMN email VARCHAR;")
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;")
        
        if 'is_email_verified' not in columns:
            print("Adding is_email_verified column to users table...")
            cursor.execute("ALTER TABLE users ADD COLUMN is_email_verified BOOLEAN DEFAULT 0;")
            
        if 'is_active' not in columns:
            print("Adding is_active column to users table...")
            cursor.execute("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1;")
            
        if 'updated_at' not in columns:
            print("Adding updated_at column to users table...")
            cursor.execute("ALTER TABLE users ADD COLUMN updated_at DATETIME;")

        # Update existing admin users
        print("Setting is_email_verified=1 and is_active=1 for admin users...")
        cursor.execute("UPDATE users SET is_email_verified=1, is_active=1 WHERE role='admin'")

        # Create email_otps table
        print("Creating email_otps table if not exists...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS email_otps (
                id VARCHAR PRIMARY KEY,
                user_id VARCHAR,
                email VARCHAR NOT NULL,
                otp_hash VARCHAR NOT NULL,
                purpose VARCHAR NOT NULL,
                expires_at DATETIME NOT NULL,
                consumed_at DATETIME,
                attempts INTEGER DEFAULT 0,
                max_attempts INTEGER DEFAULT 5,
                ip_address VARCHAR,
                created_at DATETIME,
                updated_at DATETIME,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        """)

        # Create indices
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);")

        conn.commit()
        print("Migration successful.")
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
