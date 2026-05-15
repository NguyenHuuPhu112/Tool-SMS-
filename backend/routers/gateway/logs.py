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
