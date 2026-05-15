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

    user_stats = []
    if current_user.role == "admin":
        user_counts = db.query(
            User.username,
            func.count(GatewaySMSLog.id).label('total_sent')
        ).join(GatewaySMSLog, User.id == GatewaySMSLog.created_by)\
         .filter(GatewaySMSLog.status.in_(["sent", "gateway_accepted"]))\
         .group_by(User.id).all()
        
        for username, count in user_counts:
            user_stats.append({"name": username, "value": count})

    return {
        "kpis": {"total_sent": total_sent, "today_sent": today_sent, "pending": pending, "failed_today": failed}, 
        "chart_data": hourly_stats,
        "user_stats": user_stats
    }

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
