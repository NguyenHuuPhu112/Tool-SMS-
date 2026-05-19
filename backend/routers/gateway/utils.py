from fastapi import Request
from sqlalchemy.orm import Session
from models.database import GatewaySMSLog, Setting
import os
from services.phone_utils import normalize_vn_phone, detect_vn_carrier

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def serialize_log(log: GatewaySMSLog) -> dict:
    return {
        "id": log.id,
        "request_id": log.request_id,
        "phone_number": log.phone_number,
        "message": log.message,
        "status": log.status,
        "provider": log.provider,
        "detected_provider": getattr(log, "detected_provider", None),
        "requested_provider": getattr(log, "requested_provider", None),
        "routing_strategy": getattr(log, "routing_strategy", None),
        "device_id": log.device_id,
        "gateway_url": log.gateway_url,
        "gateway_response": log.gateway_response,
        "error_message": log.error_message,
        "retry_count": log.retry_count,
        "max_retries": log.max_retries,
        "next_retry_at": log.next_retry_at,
        "last_attempt_at": log.last_attempt_at,
        "created_by": log.created_by,
        "created_at": log.created_at,
        "updated_at": log.updated_at,
        "sent_at": log.sent_at,
    }

def create_sms_log(
    db: Session,
    request_id: str | None,
    phone_number: str,
    message: str,
    user_id: str | None = None,
    device_id: str | None = None,
) -> GatewaySMSLog:
    setting_retries = db.query(Setting).filter_by(key="max_sms_retries").first()
    max_retries = int(setting_retries.value) if setting_retries and setting_retries.value.isdigit() else int(os.getenv("MAX_SMS_RETRIES", "3"))

    # Normalize phone and detect provider for routing decisions
    normalized_phone = normalize_vn_phone(phone_number)
    detected = detect_vn_carrier(normalized_phone)

    log_entry = GatewaySMSLog(
        request_id=request_id,
        phone_number=normalized_phone,
        message=message,
        status="pending",
        provider="android_sms_gateway",
        device_id=device_id,
        requested_provider=None,
        detected_provider=detected,
        routing_strategy=("manual" if device_id else "auto"),
        max_retries=max_retries,
        created_by=user_id,
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry
