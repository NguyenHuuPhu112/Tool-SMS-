"""
SMS Gateway Service v2
──────────────────────
Gui tin nhan SMS thong qua Android SMS Gateway (HTTP API).

Tinh nang:
  - Gui bat dong bo (async) voi httpx
  - Retry thong minh: chi retry loi tam thoi (timeout, connection, 5xx)
  - Khong retry loi validation, 401/403, phone khong hop le
  - Phan biet gateway_accepted (HTTP 200) vs sent
  - Luu gateway_response de debug
  - Cap nhat trang thai DB: pending → queued → sending → gateway_accepted/sent/failed/retrying
  - Delay ngau nhien giua cac tin nhan (bao ve he thong, tuan thu nha mang)
  - Kiem tra cancelled truoc moi attempt
"""

import os
import asyncio
import random
import json
import logging
from datetime import datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from models.database import GatewaySMSLog, GatewayDevice, Setting, SessionLocal, User
from services.phone_utils import normalize_vn_phone, detect_vn_carrier

logger = logging.getLogger("sms_gateway")
logger.setLevel(logging.INFO)

# ─── Config (read from env) ──────────────────────────────────

REQUEST_TIMEOUT = 15.0       # Timeout cho moi HTTP request (giay)
SEND_DELAY_MIN = 3           # Delay toi thieu giua cac tin (giay)
SEND_DELAY_MAX = 8           # Delay toi da giua cac tin (giay)

# Retry backoff schedule (giay): 60s → 300s → 900s
RETRY_BACKOFF_SCHEDULE = [60, 300, 900]

# HTTP status codes that should NOT be retried
NON_RETRYABLE_STATUS_CODES = {400, 401, 403, 404, 422}


def _get_max_retries() -> int:
    return int(os.getenv("MAX_SMS_RETRIES", "3"))


def _get_gateway_config(user_id: str | None = None, device_id: str | None = None, detected_provider: str | None = None) -> tuple[str, str, str, str]:
    """
    Lay URL, API key va id cua Android SMS Gateway.
    Uu tien: device_id truyền vào → Thiết bị mặc định → Thiết bị đầu tiên hợp lệ.
    """
    db = SessionLocal()
    try:
        if device_id:
            device = db.query(GatewayDevice).filter(GatewayDevice.id == device_id).first()
            if not device or not device.is_active:
                raise Exception(f"Thiết bị {device_id} không tồn tại hoặc đã bị tắt.")
            return device.base_url.rstrip('/'), device.api_key or "", device.id, "manual"

        # Try carrier match first when detected_provider provided
        if not device_id and detected_provider:
            query = db.query(GatewayDevice).filter(
                GatewayDevice.is_active == True,
                GatewayDevice.provider == detected_provider
            )
            if user_id:
                user = db.query(User).filter(User.id == user_id).first()
                if not user or not user.allow_shared_devices:
                    query = query.filter(
                        (GatewayDevice.user_id == user_id) | (GatewayDevice.user_id == None)
                    )
            carrier_device = query.first()
            if carrier_device:
                return carrier_device.base_url.rstrip('/'), carrier_device.api_key or "", carrier_device.id, "carrier_match"

        # Tìm thiết bị mặc định
        query = db.query(GatewayDevice).filter(
            GatewayDevice.is_active == True,
            GatewayDevice.is_default == True
        )
        if user_id:
            user = db.query(User).filter(User.id == user_id).first()
            if not user or not user.allow_shared_devices:
                query = query.filter(
                    (GatewayDevice.user_id == user_id) | (GatewayDevice.user_id == None)
                )
        device = query.first()

        if device:
            return device.base_url.rstrip('/'), device.api_key or "", device.id, "default"

        # Tìm thiết bị hợp lệ đầu tiên
        query = db.query(GatewayDevice).filter(GatewayDevice.is_active == True)
        if user_id:
            user = db.query(User).filter(User.id == user_id).first()
            if not user or not user.allow_shared_devices:
                query = query.filter(
                    (GatewayDevice.user_id == user_id) | (GatewayDevice.user_id == None)
                )
        
        device = query.first()
        if device:
            return device.base_url.rstrip('/'), device.api_key or "", device.id, "any_online"

        # Fallback to .env config if provided (maintain existing behavior)
        env_url = os.getenv("ANDROID_SMS_API_URL")
        env_key = os.getenv("ANDROID_SMS_API_KEY", "")
        if env_url:
            return env_url.rstrip('/'), env_key or "", "env-fallback", "env_fallback"

        raise Exception("Không tìm thấy thiết bị Gateway nào đang hoạt động.")
    finally:
        db.close()


def _is_retryable_error(exc: Exception) -> bool:
    """
    Xac dinh loi co the retry hay khong.

    Retry:  timeout, connection error, HTTP 5xx
    Khong retry: validation, 401/403, phone khong hop le
    """
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError)):
        return True

    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code not in NON_RETRYABLE_STATUS_CODES

    # Cac loi khac (network, DNS, etc.) → retry
    if isinstance(exc, (httpx.ConnectTimeout, httpx.ReadTimeout, OSError)):
        return True

    return False


def _update_log(
    db: Session,
    log_id: str,
    status: str | None = None,
    error_message: str | None = None,
    gateway_url: str | None = None,
    gateway_response: str | None = None,
    increment_retry: bool = False,
    set_next_retry: datetime | None = None,
):
    """Cap nhat trang thai cua mot ban ghi GatewaySMSLog."""
    log = db.query(GatewaySMSLog).filter(GatewaySMSLog.id == log_id).first()
    if not log:
        return

    now = datetime.utcnow()

    if status is not None:
        log.status = status
    log.updated_at = now
    log.last_attempt_at = now

    if error_message is not None:
        log.error_message = error_message

    if gateway_url is not None:
        log.gateway_url = gateway_url

    if gateway_response is not None:
        log.gateway_response = gateway_response

    if status in ("gateway_accepted", "sent"):
        log.sent_at = now

    if increment_retry:
        log.retry_count = (log.retry_count or 0) + 1

    if set_next_retry is not None:
        log.next_retry_at = set_next_retry
    elif status in ("failed", "sent", "gateway_accepted", "cancelled"):
        log.next_retry_at = None

    db.commit()


def _is_cancelled(db: Session, log_id: str) -> bool:
    """Kiem tra log da bi cancel chua truoc moi attempt."""
    log = db.query(GatewaySMSLog).filter(GatewaySMSLog.id == log_id).first()
    return log is not None and log.status == "cancelled"


async def send_sms_via_gateway(log_id: str, phone: str, message: str):
    """
    Background task: gui SMS qua Android Gateway.

    Flow:
      1. Delay ngau nhien (tranh gui don dap)
      2. Cap nhat trang thai → queued → sending
      3. POST toi Android Gateway API
      4. Luu gateway_response
      5. Phan biet retryable vs non-retryable errors
      6. Retry voi backoff schedule (60s, 300s, 900s)
      7. Cap nhat trang thai → gateway_accepted / failed / retrying

    Luu y:
      - gateway_accepted = Android app da nhan request (HTTP 200).
        KHONG dam bao nha mang da gui thanh cong.
      - Kiem tra cancelled truoc moi lan thu.
    """
    # Delay ngau nhien truoc khi gui
    delay = random.randint(SEND_DELAY_MIN, SEND_DELAY_MAX)
    await asyncio.sleep(delay)

    db = SessionLocal()
    max_retries = _get_max_retries()

    try:
        # Kiem tra cancelled
        if _is_cancelled(db, log_id):
            logger.info(f"SMS {log_id} to {phone} was cancelled, skipping")
            return

        # Danh dau queued → sending
        _update_log(db, log_id, status="queued")
        logger.info(
            f"[SMS Flow] Log {log_id} | phone={phone} | status=queued | "
            f"message_len={len(message)}"
        )

        log_entry = db.query(GatewaySMSLog).filter(GatewaySMSLog.id == log_id).first()
        user_id = log_entry.created_by if log_entry else None
        req_device_id = log_entry.device_id if log_entry else None
        # Normalize and detect carrier
        normalized_phone = normalize_vn_phone(phone)
        detected_provider = detect_vn_carrier(normalized_phone)
        if log_entry:
            log_entry.phone_number = normalized_phone
            log_entry.detected_provider = detected_provider
            db.commit()

        try:
            gateway_url, api_key, resolved_device_id, routing = _get_gateway_config(user_id, req_device_id, detected_provider)
            if log_entry:
                log_entry.routing_strategy = routing
            if log_entry and log_entry.device_id != resolved_device_id:
                log_entry.device_id = resolved_device_id
            db.commit()
        except Exception as e:
            _update_log(db, log_id, status="failed", error_message=str(e))
            logger.error(f"[SMS Flow] Log {log_id} | failed: {e}")
            return

        logger.info(
            f"[SMS Flow] Log {log_id} | gateway_url={gateway_url} | "
            f"api_key={'***' if api_key else 'none'}"
        )

        # Map backend fields to Traccar/Android SMS Gateway expected fields.
        # Send both `message` and `text` to maximize compatibility with different gateway implementations.
        payload = {"to": phone, "message": message}
        try:
            with open("last_payload.json", "w", encoding="utf-8") as f:
                json.dump({"log_id": log_id, "payload": payload, "time": datetime.utcnow().isoformat()}, f)
        except:
            pass
        logger.info(f"[SMS Flow] Log {log_id} | Sending payload: {json.dumps(payload)}")
        logger.debug(f"Prepared gateway payload: {payload}")
        headers = {}
        if api_key:
            headers["Authorization"] = api_key

        last_error = ""

        for attempt in range(1, max_retries + 1):
            # Kiem tra cancelled truoc moi attempt
            if _is_cancelled(db, log_id):
                logger.info(
                    f"SMS {log_id} to {phone} cancelled during retry, stopping"
                )
                return

            _update_log(db, log_id, status="sending", gateway_url=gateway_url)

            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        gateway_url,
                        json=payload,
                        headers=headers,
                        timeout=REQUEST_TIMEOUT,
                    )
                    response.raise_for_status()

                # HTTP 200 → gateway_accepted
                response_text = response.text[:1000]
                _update_log(
                    db, log_id,
                    status="gateway_accepted",
                    gateway_response=response_text,
                )
                
                device = db.query(GatewayDevice).filter(GatewayDevice.id == resolved_device_id).first()
                if device:
                    device.sent_today = (device.sent_today or 0) + 1
                    db.commit()

                logger.info(
                    f"[SMS Flow] Log {log_id} | phone={phone} | status=gateway_accepted | "
                    f"attempt={attempt} | http_status={response.status_code} | "
                    f"response={response_text[:200]}"
                )
                return

            except Exception as exc:
                # Luu thong tin loi
                if isinstance(exc, httpx.HTTPStatusError):
                    response_text = exc.response.text[:500]
                    last_error = (
                        f"HTTP {exc.response.status_code}: {response_text}"
                    )
                    gateway_resp = response_text
                elif isinstance(exc, httpx.TimeoutException):
                    last_error = f"Timeout sau {REQUEST_TIMEOUT}s"
                    gateway_resp = None
                else:
                    last_error = f"{type(exc).__name__}: {str(exc)[:300]}"
                    gateway_resp = None

                logger.warning(
                    f"Error sending to {phone} (attempt {attempt}/{max_retries}): "
                    f"{last_error}"
                )

                # Kiem tra co nen retry khong
                if not _is_retryable_error(exc):
                    # Loi khong the retry → fail ngay
                    _update_log(
                        db, log_id,
                        status="failed",
                        error_message=f"[Non-retryable] {last_error}",
                        gateway_response=gateway_resp,
                        increment_retry=True,
                    )
                    logger.error(
                        f"SMS to {phone} FAILED (non-retryable): {last_error}"
                    )
                    
                    if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 401:
                        device = db.query(GatewayDevice).filter(GatewayDevice.id == resolved_device_id).first()
                        if device:
                            device.status = "unauthorized"
                            db.commit()
                            
                    return

                # If timeout or connection error mark device offline
                if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout)):
                    device = db.query(GatewayDevice).filter(GatewayDevice.id == resolved_device_id).first()
                    if device:
                        device.status = "offline"
                        device.last_error = last_error
                        db.commit()

                # Tang retry count
                _update_log(
                    db, log_id,
                    status="retrying",
                    error_message=last_error,
                    gateway_response=gateway_resp,
                    increment_retry=True,
                )

                # Backoff truoc khi thu lai
                if attempt < max_retries:
                    backoff_idx = min(attempt - 1, len(RETRY_BACKOFF_SCHEDULE) - 1)
                    backoff = RETRY_BACKOFF_SCHEDULE[backoff_idx]

                    # Luu next_retry_at de worker co the pickup
                    next_retry = datetime.utcnow() + timedelta(seconds=backoff)
                    _update_log(db, log_id, set_next_retry=next_retry)

                    logger.info(
                        f"Retrying SMS to {phone} in {backoff}s "
                        f"(attempt {attempt + 1}/{max_retries})"
                    )
                    await asyncio.sleep(backoff)

        # Het retry → danh dau failed
        _update_log(
            db, log_id,
            status="failed",
            error_message=f"Failed after {max_retries} attempts: {last_error}",
        )
        logger.error(
            f"SMS to {phone} FAILED after {max_retries} attempts: {last_error}"
        )

    finally:
        db.close()


async def check_device_health(base_url: str, api_key: str = "") -> dict:
    """
    Kiem tra ket noi toi Android SMS Gateway.

    Tra ve:
        {"online": True/False, "status_code": int, "error": str}
    """
    try:
        headers = {}
        if api_key:
            headers["Authorization"] = api_key

        async with httpx.AsyncClient() as client:
            response = await client.get(
                base_url.rstrip("/"),
                headers=headers,
                timeout=5.0,
            )
            return {
                "online": response.status_code < 500,
                "status_code": response.status_code,
                "response_time_ms": response.elapsed.total_seconds() * 1000
                if response.elapsed else None,
                "error": None,
            }

    except httpx.TimeoutException:
        return {"online": False, "status_code": None, "error": "Timeout"}
    except httpx.ConnectError:
        return {"online": False, "status_code": None, "error": "Connection refused"}
    except Exception as e:
        return {
            "online": False,
            "status_code": None,
            "error": f"{type(e).__name__}: {str(e)[:200]}",
        }
