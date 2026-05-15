"""
Audit Service
─────────────
Ghi lai hanh dong quan tri he thong vao bang audit_logs.

Dung de truy vet:
  - Ai dang nhap?
  - Ai thay doi cau hinh gateway?
  - Ai retry / huy SMS?
  - Ai them/xoa thiet bi?
"""

import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from models.database import AuditLog

logger = logging.getLogger("audit")


def log_audit(
    db: Session,
    action: str,
    user_id: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
):
    """
    Ghi mot dong audit log.

    Args:
        db: SQLAlchemy session
        action: Ten hanh dong, vi du:
            "sms.send", "sms.retry", "sms.cancel",
            "settings.update", "device.create", "device.update",
            "auth.login"
        user_id: ID cua user thuc hien hanh dong (None = system)
        target_type: Loai doi tuong bi anh huong
            "gateway_sms_log", "gateway_device", "setting", "user"
        target_id: ID cua doi tuong bi anh huong
        details: Thong tin bo sung (dict → luu dang JSON)
        ip_address: IP cua client
    """
    try:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=json.dumps(details, default=str) if details else None,
            ip_address=ip_address,
        )
        db.add(entry)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")
        # Khong raise exception – audit log khong nen lam fail request chinh
        db.rollback()
