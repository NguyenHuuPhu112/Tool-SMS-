from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from models.schemas import SMSPayload, EsmsSettingsModel
from models.database import get_db, Campaign, SMSLog, Setting, User
from services.esms_service import send_esms_sms, get_esms_balance
from services.auth_service import get_current_user, get_current_admin
from services.campaign_service import process_campaign_background, get_user_campaigns
from datetime import datetime
import time

router = APIRouter()

@router.post("/send-sms")
def send_sms_campaign(payload: SMSPayload, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not payload.phones:
        raise HTTPException(status_code=400, detail="Danh sách số điện thoại rỗng")
        
    # Check quota
    now = datetime.utcnow()
    start_of_month = datetime(now.year, now.month, 1)
    start_of_day = datetime(now.year, now.month, now.day)
    
    current_month_usage = db.query(SMSLog).filter(
        SMSLog.user_id == current_user.id,
        SMSLog.sent_at >= start_of_month
    ).count()
    
    current_day_usage = db.query(SMSLog).filter(
        SMSLog.user_id == current_user.id,
        SMSLog.sent_at >= start_of_day
    ).count()
    
    if current_month_usage + len(payload.phones) > current_user.monthly_quota:
        raise HTTPException(
            status_code=403, 
            detail=f"Vượt quá giới hạn tin nhắn tháng ({current_month_usage}/{current_user.monthly_quota}). Vui lòng nâng cấp tài khoản để tiếp tục gửi."
        )

    if hasattr(current_user, 'daily_quota') and current_day_usage + len(payload.phones) > current_user.daily_quota:
        raise HTTPException(
            status_code=403, 
            detail=f"Vượt quá giới hạn tin nhắn ngày ({current_day_usage}/{current_user.daily_quota}). Vui lòng nâng cấp tài khoản để tiếp tục gửi."
        )
    
    # 1. Tạo chiến dịch
    campaign = Campaign(name=payload.name, message_body=payload.message, user_id=current_user.id)
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    # 2. Xử lý gửi tin trong background
    background_tasks.add_task(
        process_campaign_background,
        campaign_id=campaign.id,
        phones=payload.phones,
        message=payload.message,
        user_id=current_user.id,
        db=db
    )

    return {
        "message": "Chiến dịch đã được đưa vào hàng đợi xử lý",
        "campaign_id": campaign.id,
        "total_phones": len(payload.phones)
    }

@router.get("/history")
def get_campaign_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    campaigns = get_user_campaigns(current_user.id, db)
    # Serialize data manually
    return [{
        "id": c.id, 
        "name": c.name, 
        "message_body": c.message_body,
        "created_at": c.created_at,
        "total_sent": c.total_sent,
        "total_failed": c.total_failed
    } for c in campaigns]

@router.get("/esms-settings")
def get_esms_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    settings = db.query(Setting).all()
    settings_dict = {s.key: s.value for s in settings}
    return {
        "api_key": settings_dict.get("esms_api_key", ""),
        "secret_key": settings_dict.get("esms_secret_key", ""),
        "brandname": settings_dict.get("esms_brandname", ""),
        "sms_type": settings_dict.get("esms_sms_type", "4")
    }

@router.post("/esms-settings")
def update_esms_settings(payload: EsmsSettingsModel, db: Session = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    def upsert_setting(key, value):
        setting = db.query(Setting).filter_by(key=key).first()
        if setting:
            setting.value = value
        else:
            db.add(Setting(key=key, value=value))
            
    upsert_setting("esms_api_key", payload.api_key)
    upsert_setting("esms_secret_key", payload.secret_key)
    upsert_setting("esms_brandname", payload.brandname)
    upsert_setting("esms_sms_type", payload.sms_type)
    
    db.commit()
    return {"message": "eSMS Settings updated successfully"}

@router.get("/esms-balance")
def get_balance(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_esms_balance(db)
