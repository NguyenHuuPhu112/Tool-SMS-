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


def _get_gateway_config(user_id: str | None = None) -> tuple[str, str]:
    """
    Lay URL va API key cua Android SMS Gateway.
    Tra ve (gateway_url, api_key).
    Uu tien: Device cua User → Kiem tra quyen dung chung → Device he thong → env.
    """
    db = SessionLocal()
    try:
        if user_id:
            # 1. Tim device cua user
            device = db.query(GatewayDevice).filter(
                GatewayDevice.is_active == True,
                GatewayDevice.status == "online",
                GatewayDevice.user_id == user_id
            ).first()
            if device:
                return device.base_url.rstrip('/'), device.api_key or ""
            
            # Kiem tra quyen dung chung
            user = db.query(User).filter(User.id == user_id).first()
            if not user or not user.allow_shared_devices:
                raise Exception("Bạn chưa thêm thiết bị Gateway hoặc không được phép dùng thiết bị chung của hệ thống.")

        # 2. Tim device chung (he thong)
        device = db.query(GatewayDevice).filter(
            GatewayDevice.is_active == True,
            GatewayDevice.status == "online",
            GatewayDevice.user_id.is_(None)
        ).first()
        if device:
            return device.base_url.rstrip('/'), device.api_key or ""

        # 3. Fallback: setting trong DB
        setting = db.query(Setting).filter_by(key="android_sms_api_url").first()
        if setting and setting.value.strip():
            return setting.value.strip(), os.getenv("ANDROID_SMS_API_KEY", "")
    finally:
        db.close()

    return (
        os.getenv("ANDROID_SMS_API_URL", "http://100.120.152.19:8082/"),
        os.getenv("ANDROID_SMS_API_KEY", ""),
    )


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

        try:
            gateway_url, api_key = _get_gateway_config(user_id)
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
                    return

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
