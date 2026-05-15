"""
Database Models
───────────────
SQLAlchemy models cho hệ thống SMS Automation.
Sử dụng SQLite (WAL mode) với cấu trúc sẵn sàng migrate sang PostgreSQL.
"""

import os
from dotenv import load_dotenv
from sqlalchemy import (
    create_engine, Column, Integer, String, DateTime,
    ForeignKey, Text, Boolean, event,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime
import uuid

# Load .env file
load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sms_auto.db")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# ─────────────────────────────────────────────────────────────
# Existing models (User, Campaign, SMSLog, Setting)
# ─────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String, default="user")  # "admin" or "user"
    monthly_quota = Column(Integer, default=1000)
    allow_shared_devices = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    campaigns = relationship("Campaign", back_populates="user")
    logs = relationship("SMSLog", back_populates="user")
    gateway_devices = relationship("GatewayDevice", back_populates="user")


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String)
    message_body = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    user_id = Column(String, ForeignKey("users.id"), index=True, nullable=True)
    total_sent = Column(Integer, default=0)
    total_failed = Column(Integer, default=0)

    logs = relationship("SMSLog", back_populates="campaign")
    user = relationship("User", back_populates="campaigns")


class SMSLog(Base):
    __tablename__ = "sms_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id = Column(String, ForeignKey("campaigns.id"), index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    phone_number = Column(String)
    status = Column(String, index=True)  # SUCCESS, FAILED
    error_message = Column(String, nullable=True)
    sent_at = Column(DateTime, default=datetime.utcnow)

    campaign = relationship("Campaign", back_populates="logs")
    user = relationship("User", back_populates="logs")


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(String)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────
# SMS Gateway – Bảng ghi log SMS gửi qua Android Gateway
# ─────────────────────────────────────────────────────────────

class GatewaySMSLog(Base):
    """
    Lưu lịch sử gửi SMS qua Android SMS Gateway.

    Trạng thái (status flow):
        pending → queued → sending → gateway_accepted → sent
                                   → failed
                                   → retrying (quay lại sending)
        pending/queued → cancelled (bị hủy bởi admin)

    Lưu ý:
        - `gateway_accepted` = Android app đã nhận HTTP request (200 OK),
          KHÔNG đảm bảo nhà mạng đã gửi thành công.
        - `sent` = tương đương gateway_accepted nếu app không hỗ trợ
          delivery report.
    """
    __tablename__ = "gateway_sms_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    request_id = Column(String, unique=True, nullable=True, index=True)
    phone_number = Column(String, nullable=False, index=True)
    message = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="pending", index=True)
    provider = Column(String, nullable=False, default="android_sms_gateway")
    gateway_url = Column(String, nullable=True)
    gateway_response = Column(Text, nullable=True)
    error_message = Column(String, nullable=True)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    next_retry_at = Column(DateTime, nullable=True)
    last_attempt_at = Column(DateTime, nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)


# ─────────────────────────────────────────────────────────────
# SMS Gateway – Quản lý thiết bị Android (multi-device ready)
# ─────────────────────────────────────────────────────────────

class GatewayDevice(Base):
    """
    Quản lý thiết bị Android làm SMS Gateway.
    Hỗ trợ multi-device: chọn thiết bị online, chia tải, tạm khóa lỗi.
    """
    __tablename__ = "gateway_devices"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    base_url = Column(String, nullable=False)
    api_key = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    status = Column(String, default="offline")  # online, offline, error
    last_health_check_at = Column(DateTime, nullable=True)
    last_error = Column(String, nullable=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="gateway_devices")


# ─────────────────────────────────────────────────────────────
# Audit Log – Ghi lại hành động quản trị hệ thống
# ─────────────────────────────────────────────────────────────

class AuditLog(Base):
    """
    System audit log – tách riêng khỏi SMS business log.

    Dùng để truy vết:
      - Ai đăng nhập?
      - Ai thay đổi cấu hình gateway?
      - Ai retry / hủy SMS?
      - Ai thay API key?
    """
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String, nullable=False, index=True)
    target_type = Column(String, nullable=True)
    target_id = Column(String, nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
