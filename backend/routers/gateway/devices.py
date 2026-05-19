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
        "id": d.id, "name": d.name, "provider": d.provider, "base_url": d.base_url, "is_active": d.is_active,
        "is_default": d.is_default, "daily_limit": d.daily_limit, "sent_today": d.sent_today,
        "status": d.status, "last_health_check_at": d.last_health_check_at,
        "last_error": d.last_error, "user_id": d.user_id, "created_at": d.created_at, "updated_at": d.updated_at
    } for d in devices]

@router.post("/devices")
def gateway_create_device(payload: GatewayDeviceCreate, req: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if payload.is_default:
        db.query(GatewayDevice).filter(GatewayDevice.user_id == current_user.id).update({"is_default": False})

    device = GatewayDevice(
        name=payload.name, base_url=payload.base_url.rstrip("/"),
        api_key=payload.api_key, is_active=payload.is_active, user_id=current_user.id,
        provider=payload.provider, is_default=payload.is_default, daily_limit=payload.daily_limit
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
    if payload.provider is not None: device.provider = payload.provider; changes["provider"] = payload.provider
    if payload.daily_limit is not None: device.daily_limit = payload.daily_limit; changes["daily_limit"] = payload.daily_limit
    if payload.is_default is not None:
        if payload.is_default and not device.is_default:
            db.query(GatewayDevice).filter(GatewayDevice.user_id == current_user.id).update({"is_default": False})
        device.is_default = payload.is_default
        changes["is_default"] = payload.is_default

    db.commit()
    log_audit(db, action="device.update", user_id=current_user.id, target_type="gateway_device", target_id=device_id, details=changes, ip_address=get_client_ip(req))
    return {"status": "updated", "device_id": device_id}


@router.delete("/devices/{device_id}")
def gateway_delete_device(device_id: str, req: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Soft-delete a GatewayDevice by setting `is_active` to False.

    Only the device owner or an admin can delete a device. Records are kept
    for audit/history. If you need hard-delete, run a separate db cleanup.
    """
    device = db.query(GatewayDevice).filter(GatewayDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Khong tim thay thiet bi")
    if current_user.role != "admin" and device.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Khong co quyen")

    # Hard delete: remove the device record from DB
    db.delete(device)
    db.commit()

    log_audit(db, action="device.delete", user_id=current_user.id, target_type="gateway_device", target_id=device_id, details={"deleted": True}, ip_address=get_client_ip(req))
    return {"status": "deleted", "device_id": device_id}
