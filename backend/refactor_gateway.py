import os

os.makedirs('routers/gateway', exist_ok=True)

utils_code = """
from fastapi import Request
from sqlalchemy.orm import Session
from models.database import GatewaySMSLog, Setting
import os

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
) -> GatewaySMSLog:
    setting_retries = db.query(Setting).filter_by(key="max_sms_retries").first()
    max_retries = int(setting_retries.value) if setting_retries and setting_retries.value.isdigit() else int(os.getenv("MAX_SMS_RETRIES", "3"))

    log_entry = GatewaySMSLog(
        request_id=request_id,
        phone_number=phone_number,
        message=message,
        status="pending",
        provider="android_sms_gateway",
        max_retries=max_retries,
        created_by=user_id,
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry
"""

sms_code = """
import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from models.database import get_db, User
from models.schemas import GatewaySMSRequest, GatewaySMSResponse
from services.sms_gateway_service import send_sms_via_gateway
from services.auth_service import get_current_user, verify_api_key
from services.rate_limiter import check_rate_limit_global, check_rate_limit_phone, check_user_quota, check_idempotency
from services.audit_service import log_audit
from .utils import get_client_ip, create_sms_log

logger = logging.getLogger("gateway_sms")
router = APIRouter()

@router.post("/send-sms", response_model=GatewaySMSResponse)
async def gateway_send_sms(
    request: GatewaySMSRequest,
    background_tasks: BackgroundTasks,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if request.request_id:
        existing = check_idempotency(request.request_id, db)
        if existing:
            return GatewaySMSResponse(
                status="already_exists",
                message=f"Request {request.request_id} da ton tai",
                log_id=existing.id,
                request_id=existing.request_id,
            )

    ok, err = check_rate_limit_global(db)
    if not ok: raise HTTPException(status_code=429, detail=err)

    ok, err = check_rate_limit_phone(request.phone_number, db)
    if not ok: raise HTTPException(status_code=429, detail=err)

    ok, err = check_user_quota(current_user.id, db)
    if not ok: raise HTTPException(status_code=429, detail=err)

    log_entry = create_sms_log(db, request.request_id, request.phone_number, request.message, current_user.id)
    background_tasks.add_task(send_sms_via_gateway, log_id=log_entry.id, phone=request.phone_number, message=request.message)

    log_audit(
        db, action="sms.send", user_id=current_user.id, target_type="gateway_sms_log",
        target_id=log_entry.id, details={"phone": request.phone_number, "request_id": request.request_id},
        ip_address=get_client_ip(req)
    )

    return GatewaySMSResponse(status="accepted", message="Da tiep nhan", log_id=log_entry.id, request_id=log_entry.request_id)

@router.post("/send-sms-external", response_model=GatewaySMSResponse)
async def gateway_send_sms_external(
    request: GatewaySMSRequest,
    background_tasks: BackgroundTasks,
    req: Request,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
):
    if request.request_id:
        existing = check_idempotency(request.request_id, db)
        if existing:
            return GatewaySMSResponse(status="already_exists", message=f"Request {request.request_id} da ton tai", log_id=existing.id, request_id=existing.request_id)

    ok, err = check_rate_limit_global(db)
    if not ok: raise HTTPException(status_code=429, detail=err)

    ok, err = check_rate_limit_phone(request.phone_number, db)
    if not ok: raise HTTPException(status_code=429, detail=err)

    log_entry = create_sms_log(db, request.request_id, request.phone_number, request.message, None)
    background_tasks.add_task(send_sms_via_gateway, log_id=log_entry.id, phone=request.phone_number, message=request.message)

    log_audit(db, action="sms.send_external", target_type="gateway_sms_log", target_id=log_entry.id, details={"phone": request.phone_number}, ip_address=get_client_ip(req))

    return GatewaySMSResponse(status="accepted", message="Da tiep nhan", log_id=log_entry.id, request_id=log_entry.request_id)
"""

logs_code = """
from typing import Optional
import os
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from models.database import get_db, User, GatewaySMSLog, Setting
from services.sms_gateway_service import send_sms_via_gateway
from services.auth_service import get_current_user, get_current_admin
from services.audit_service import log_audit
from .utils import get_client_ip, serialize_log

router = APIRouter()

@router.get("/logs")
def gateway_get_logs(
    status_filter: Optional[str] = None, phone: Optional[str] = None,
    limit: int = 50, offset: int = 0,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(GatewaySMSLog)
    if current_user.role != "admin": query = query.filter(GatewaySMSLog.created_by == current_user.id)
    if status_filter: query = query.filter(GatewaySMSLog.status == status_filter)
    if phone: query = query.filter(GatewaySMSLog.phone_number.contains(phone))

    total = query.count()
    logs = query.order_by(GatewaySMSLog.created_at.desc()).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "items": [serialize_log(log) for log in logs]}

@router.get("/logs/{log_id}")
def gateway_get_log_detail(log_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    log = db.query(GatewaySMSLog).filter(GatewaySMSLog.id == log_id).first()
    if not log: raise HTTPException(status_code=404, detail="Khong tim thay ban ghi SMS")
    if current_user.role != "admin" and log.created_by != current_user.id: raise HTTPException(status_code=403, detail="Khong co quyen")
    return serialize_log(log)

@router.post("/logs/{log_id}/retry")
async def gateway_retry_sms(
    log_id: str, background_tasks: BackgroundTasks, req: Request,
    db: Session = Depends(get_db), current_admin: User = Depends(get_current_admin)
):
    log = db.query(GatewaySMSLog).filter(GatewaySMSLog.id == log_id).first()
    if not log: raise HTTPException(status_code=404, detail="Khong tim thay ban ghi SMS")
    if log.status not in ("failed",): raise HTTPException(status_code=400, detail="Chi co the retry failed SMS")

    log.status = "pending"
    log.retry_count = 0
    log.error_message = None
    log.next_retry_at = None
    setting_retries = db.query(Setting).filter_by(key="max_sms_retries").first()
    log.max_retries = int(setting_retries.value) if setting_retries and setting_retries.value.isdigit() else int(os.getenv("MAX_SMS_RETRIES", "3"))
    db.commit()

    background_tasks.add_task(send_sms_via_gateway, log_id=log.id, phone=log.phone_number, message=log.message)
    log_audit(db, action="sms.retry", user_id=current_admin.id, target_type="gateway_sms_log", target_id=log_id, ip_address=get_client_ip(req))
    return {"status": "retrying"}

@router.post("/logs/{log_id}/cancel")
def gateway_cancel_sms(log_id: str, req: Request, db: Session = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    log = db.query(GatewaySMSLog).filter(GatewaySMSLog.id == log_id).first()
    if not log: raise HTTPException(status_code=404, detail="Khong tim thay")
    if log.status not in ("pending", "queued", "retrying"): raise HTTPException(status_code=400, detail="Trang thai khong the huy")
    log.status = "cancelled"
    log.next_retry_at = None
    db.commit()
    log_audit(db, action="sms.cancel", user_id=current_admin.id, target_type="gateway_sms_log", target_id=log_id, ip_address=get_client_ip(req))
    return {"status": "cancelled"}
"""

devices_code = """
import os
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from models.database import get_db, User, GatewayDevice
from models.schemas import GatewayDeviceCreate, GatewayDeviceUpdate
from services.sms_gateway_service import check_device_health
from services.auth_service import get_current_user
from services.audit_service import log_audit
from .utils import get_client_ip

router = APIRouter()

@router.get("/health")
def gateway_health():
    import datetime
    return {"status": "ok", "service": "sms-gateway", "timestamp": datetime.datetime.utcnow().isoformat()}

@router.get("/device-health")
async def gateway_device_health(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(GatewayDevice).filter(GatewayDevice.is_active == True)
    if current_user.role != "admin": query = query.filter(GatewayDevice.user_id == current_user.id)
    devices = query.all()

    results = []
    import datetime
    if devices:
        for device in devices:
            health = await check_device_health(device.base_url, device.api_key or "")
            device.status = "online" if health["online"] else "offline"
            device.last_health_check_at = datetime.datetime.utcnow()
            if health.get("error"): device.last_error = health["error"]
            results.append({"device_id": device.id, "device_name": device.name, "base_url": device.base_url, **health})
        db.commit()
    return {"devices": results}

@router.get("/devices")
def gateway_get_devices(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(GatewayDevice)
    if current_user.role != "admin": query = query.filter(GatewayDevice.user_id == current_user.id)
    devices = query.order_by(GatewayDevice.created_at.desc()).all()
    return [{
        "id": d.id, "name": d.name, "base_url": d.base_url, "is_active": d.is_active,
        "status": d.status, "last_health_check_at": d.last_health_check_at,
        "last_error": d.last_error, "user_id": d.user_id, "created_at": d.created_at, "updated_at": d.updated_at
    } for d in devices]

@router.post("/devices")
def gateway_create_device(payload: GatewayDeviceCreate, req: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    device = GatewayDevice(
        name=payload.name, base_url=payload.base_url.rstrip("/"),
        api_key=payload.api_key, is_active=payload.is_active, user_id=current_user.id
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    log_audit(db, action="device.create", user_id=current_user.id, target_type="gateway_device", target_id=device.id, details={"name": device.name}, ip_address=get_client_ip(req))
    return {"status": "created", "device_id": device.id}

@router.put("/devices/{device_id}")
def gateway_update_device(device_id: str, payload: GatewayDeviceUpdate, req: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    device = db.query(GatewayDevice).filter(GatewayDevice.id == device_id).first()
    if not device: raise HTTPException(status_code=404, detail="Khong tim thay thiet bi")
    if current_user.role != "admin" and device.user_id != current_user.id: raise HTTPException(status_code=403, detail="Khong co quyen")

    changes = {}
    if payload.name is not None: device.name = payload.name; changes["name"] = payload.name
    if payload.base_url is not None: device.base_url = payload.base_url.rstrip("/"); changes["base_url"] = device.base_url
    if payload.api_key is not None: device.api_key = payload.api_key; changes["api_key"] = "***changed***"
    if payload.is_active is not None: device.is_active = payload.is_active; changes["is_active"] = payload.is_active

    db.commit()
    log_audit(db, action="device.update", user_id=current_user.id, target_type="gateway_device", target_id=device_id, details=changes, ip_address=get_client_ip(req))
    return {"status": "updated", "device_id": device_id}
"""

settings_code = """
import os
from datetime import datetime
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from models.database import get_db, User, GatewaySMSLog, Setting
from models.schemas import GatewaySettingsModel
from services.auth_service import get_current_user, get_current_admin
from services.audit_service import log_audit
from .utils import get_client_ip

router = APIRouter()

@router.get("/stats")
def gateway_get_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
    query = db.query(GatewaySMSLog)
    if current_user.role != "admin":
        query = query.filter(GatewaySMSLog.created_by == current_user.id)

    total_sent = query.filter(GatewaySMSLog.status.in_(["sent", "gateway_accepted"])).count()
    today_sent = query.filter(GatewaySMSLog.status.in_(["sent", "gateway_accepted"]), GatewaySMSLog.created_at >= today).count()
    pending = query.filter(GatewaySMSLog.status.in_(["pending", "queued", "retrying"])).count()
    failed = query.filter(GatewaySMSLog.status == "failed", GatewaySMSLog.created_at >= today).count()
    
    hourly_stats = [{"name": f"{i:02d}:00", "sent": 0, "failed": 0} for i in range(24)]
    logs_today = query.filter(GatewaySMSLog.created_at >= today).with_entities(GatewaySMSLog.status, GatewaySMSLog.created_at).all()
    
    for status, created_at in logs_today:
        hour = created_at.hour
        if status in ["sent", "gateway_accepted"]: hourly_stats[hour]["sent"] += 1
        elif status == "failed": hourly_stats[hour]["failed"] += 1

    return {"kpis": {"total_sent": total_sent, "today_sent": today_sent, "pending": pending, "failed_today": failed}, "chart_data": hourly_stats}

@router.get("/settings")
def gateway_get_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    settings_dict = {s.key: s.value for s in db.query(Setting).all()}
    return {
        "android_api_url": settings_dict.get("android_sms_api_url", os.getenv("ANDROID_SMS_API_URL", "http://100.120.152.19:8082/")),
        "max_retries": int(settings_dict.get("max_sms_retries", os.getenv("MAX_SMS_RETRIES", "3"))),
        "rate_limit_per_minute": int(settings_dict.get("sms_rate_limit_per_minute", os.getenv("SMS_RATE_LIMIT_PER_MINUTE", "30"))),
        "source": "database" if "android_sms_api_url" in settings_dict else "environment",
    }

@router.post("/settings")
def gateway_update_settings(payload: GatewaySettingsModel, req: Request, db: Session = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    keys_to_update = {
        "android_sms_api_url": payload.android_api_url.strip(),
        "max_sms_retries": str(payload.max_retries),
        "sms_rate_limit_per_minute": str(payload.rate_limit_per_minute),
    }

    for key, val in keys_to_update.items():
        setting = db.query(Setting).filter_by(key=key).first()
        if setting: setting.value = val
        else: db.add(Setting(key=key, value=val))
    db.commit()
    log_audit(db, action="settings.update", user_id=current_admin.id, target_type="setting", target_id="gateway_settings", details=keys_to_update, ip_address=get_client_ip(req))
    return {"message": "Da cap nhat cau hinh SMS Gateway"}
"""

init_code = """
from fastapi import APIRouter
from .sms import router as sms_router
from .logs import router as logs_router
from .devices import router as devices_router
from .settings import router as settings_router

router = APIRouter()
router.include_router(sms_router, tags=["Gateway SMS"])
router.include_router(logs_router, tags=["Gateway Logs"])
router.include_router(devices_router, tags=["Gateway Devices"])
router.include_router(settings_router, tags=["Gateway Settings"])
"""

with open("routers/gateway/utils.py", "w") as f: f.write(utils_code.strip() + "\\n")
with open("routers/gateway/sms.py", "w") as f: f.write(sms_code.strip() + "\\n")
with open("routers/gateway/logs.py", "w") as f: f.write(logs_code.strip() + "\\n")
with open("routers/gateway/devices.py", "w") as f: f.write(devices_code.strip() + "\\n")
with open("routers/gateway/settings.py", "w") as f: f.write(settings_code.strip() + "\\n")
with open("routers/gateway/__init__.py", "w") as f: f.write(init_code.strip() + "\\n")

print("Files created successfully.")
