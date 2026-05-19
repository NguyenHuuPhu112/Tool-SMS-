"""
Rate Limiter & Idempotency Service
───────────────────────────────────
Rate limit 3 tang:
  1. Global: toan he thong X tin/phut
  2. Per phone: khong qua Y tin cho cung 1 so trong Z phut
  3. Per user: theo monthly_quota (da co san trong he thong)

Idempotency:
  - Neu request_id da ton tai trong DB → tra ve log cu, khong gui trung.
"""

import os
import time
import threading
import logging
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from models.database import GatewaySMSLog, SessionLocal

logger = logging.getLogger("rate_limiter")

# ─── In-memory rate limit tracking ───────────────────────────
# Thread-safe counters. Reset moi phut.
# Fallback: neu server restart, counter reset ve 0 (chap nhan duoc).

_lock = threading.Lock()
_global_counter = {"count": 0, "window_start": 0.0}
_phone_counters: dict[str, dict] = defaultdict(
    lambda: {"count": 0, "window_start": 0.0}
)

# Phone rate limit window (giay)
PHONE_RATE_WINDOW = 600  # 10 phut


from models.database import Setting

def _get_global_limit(db: Session) -> int:
    setting = db.query(Setting).filter_by(key="sms_rate_limit_per_minute").first()
    if setting and setting.value.isdigit():
        return int(setting.value)
    return int(os.getenv("SMS_RATE_LIMIT_PER_MINUTE", "30"))


def _get_phone_limit(db: Session) -> int:
    # Có thể thêm sms_rate_limit_per_phone vào DB sau, tạm thời fallback env
    setting = db.query(Setting).filter_by(key="sms_rate_limit_per_phone").first()
    if setting and setting.value.isdigit():
        return int(setting.value)
    return int(os.getenv("SMS_RATE_LIMIT_PER_PHONE", "3"))


def check_rate_limit_global(db: Session) -> tuple[bool, str]:
    """
    Kiem tra rate limit toan he thong.
    Returns: (is_allowed, error_message)
    """
    limit = _get_global_limit(db)
    now = time.time()

    with _lock:
        # Reset window moi 60 giay
        if now - _global_counter["window_start"] >= 60:
            _global_counter["count"] = 0
            _global_counter["window_start"] = now

        if _global_counter["count"] >= limit:
            return False, (
                f"He thong da dat gioi han {limit} tin/phut. "
                f"Vui long thu lai sau."
            )

        _global_counter["count"] += 1
        return True, ""


def check_rate_limit_phone(phone_number: str, db: Session) -> tuple[bool, str]:
    """
    Kiem tra rate limit cho 1 so dien thoai.
    Returns: (is_allowed, error_message)
    """
    # COMMENTED OUT FOR TESTING: Luôn cho phép gửi tin nhắn không giới hạn đến 1 số điện thoại khi test
    return True, ""
    
    limit = _get_phone_limit(db)
    now = time.time()

    with _lock:
        counter = _phone_counters[phone_number]

        # Reset window
        if now - counter["window_start"] >= PHONE_RATE_WINDOW:
            counter["count"] = 0
            counter["window_start"] = now

        if counter["count"] >= limit:
            return False, (
                f"So {phone_number} da nhan {limit} tin trong 10 phut gan nhat. "
                f"Vui long thu lai sau."
            )

        counter["count"] += 1
        return True, ""


def check_user_quota(user_id: str, db: Session) -> tuple[bool, str]:
    """
    Kiem tra monthly quota cua user.
    Dem tat ca gateway_sms_logs cua user trong thang hien tai.
    """
    from models.database import User

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False, "User not found"

    now = datetime.utcnow()
    start_of_month = datetime(now.year, now.month, 1)
    start_of_day = datetime(now.year, now.month, now.day)

    # Dem ca sms_logs (eSMS) va gateway_sms_logs cho ca thang
    from models.database import SMSLog

    esms_count_month = db.query(SMSLog).filter(
        SMSLog.user_id == user_id,
        SMSLog.sent_at >= start_of_month,
    ).count()

    gateway_count_month = db.query(GatewaySMSLog).filter(
        GatewaySMSLog.created_by == user_id,
        GatewaySMSLog.created_at >= start_of_month,
    ).count()

    total_month = esms_count_month + gateway_count_month

    if total_month >= user.monthly_quota:
        return False, (
            f"Vượt quá giới hạn tin nhắn tháng ({total_month}/{user.monthly_quota}). "
            f"Vui lòng nâng cấp tài khoản để tiếp tục gửi."
        )

    # Dem ca sms_logs (eSMS) va gateway_sms_logs cho hom nay
    esms_count_day = db.query(SMSLog).filter(
        SMSLog.user_id == user_id,
        SMSLog.sent_at >= start_of_day,
    ).count()

    gateway_count_day = db.query(GatewaySMSLog).filter(
        GatewaySMSLog.created_by == user_id,
        GatewaySMSLog.created_at >= start_of_day,
    ).count()

    total_day = esms_count_day + gateway_count_day

    if hasattr(user, 'daily_quota') and total_day >= user.daily_quota:
        return False, (
            f"Vượt quá giới hạn tin nhắn ngày ({total_day}/{user.daily_quota}). "
            f"Vui lòng nâng cấp tài khoản để tiếp tục gửi."
        )

    return True, ""


def check_idempotency(request_id: str, db: Session) -> GatewaySMSLog | None:
    """
    Kiem tra request_id da ton tai chua.
    Neu co → tra ve ban ghi cu (khong tao SMS moi).
    Neu chua → tra ve None.
    """
    if not request_id:
        return None

    existing = db.query(GatewaySMSLog).filter(
        GatewaySMSLog.request_id == request_id
    ).first()

    return existing


# ─── Login rate limiting (per IP) ───────────────────────────
# Track failed login attempts per IP and block after threshold
_login_failures: dict[str, dict] = defaultdict(lambda: {"count": 0, "first_seen": 0.0})
LOGIN_BLOCK_WINDOW = 15 * 60  # 15 minutes
LOGIN_MAX_FAILS = int(os.getenv("LOGIN_MAX_FAILS", "5"))


def is_ip_allowed_login(ip: str) -> tuple[bool, str]:
    now = time.time()
    rec = _login_failures[ip]

    # reset window
    if rec["first_seen"] == 0.0 or now - rec["first_seen"] > LOGIN_BLOCK_WINDOW:
        rec["count"] = 0
        rec["first_seen"] = now

    if rec["count"] >= LOGIN_MAX_FAILS:
        return False, (
            f"Too many failed login attempts from this IP. "
            f"Please try again after {int((LOGIN_BLOCK_WINDOW - (now - rec['first_seen'])) // 60 + 1)} minutes."
        )

    return True, ""


def record_login_failure(ip: str):
    now = time.time()
    rec = _login_failures[ip]
    if rec["first_seen"] == 0.0 or now - rec["first_seen"] > LOGIN_BLOCK_WINDOW:
        rec["count"] = 1
        rec["first_seen"] = now
    else:
        rec["count"] += 1


def record_login_success(ip: str):
    # reset failures on success
    if ip in _login_failures:
        del _login_failures[ip]
