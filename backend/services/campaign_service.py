from sqlalchemy.orm import Session
from models.database import Campaign, SMSLog, User
from services.esms_service import send_esms_sms
import time

def process_campaign_background(campaign_id: str, phones: list[str], message: str, user_id: str, db: Session):
    """
    Background task to process SMS sending for a campaign.
    """
    success_count = 0
    failed_count = 0
    errors = []

    batch_size = 50
    batch_success_count = 0
    batch_failed_count = 0

    for i, phone in enumerate(phones):
        is_success = False
        err_msg = ""
        
        # Retry mechanism (Max 3 attempts)
        for attempt in range(3):
            is_success, err_msg = send_esms_sms(phone, message, db)
            if is_success:
                break
            time.sleep(2) # Wait 2s before retry if failed/rate limited
        
        status = "SUCCESS" if is_success else "FAILED"
        if is_success:
            batch_success_count += 1
            success_count += 1
        else:
            batch_failed_count += 1
            failed_count += 1
            if err_msg not in [e.get("error") for e in errors]:
                errors.append({"phone": phone, "error": err_msg})
            
        log_entry = SMSLog(
            campaign_id=campaign_id,
            user_id=user_id,
            phone_number=phone,
            status=status,
            error_message=err_msg
        )
        db.add(log_entry)
        
        # Batch update database every batch_size or at the very end
        if (i + 1) % batch_size == 0 or (i + 1) == len(phones):
            campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
            if campaign:
                campaign.total_sent += batch_success_count
                campaign.total_failed += batch_failed_count
            db.commit()
            
            # Reset batch counters
            batch_success_count = 0
            batch_failed_count = 0
        
        # Rate limit an toàn giữa các tin nhắn (Chống spam)
        time.sleep(1)

def get_user_campaigns(user_id: str, db: Session):
    """
    Get all campaigns for a specific user. Layer 2 authorization is implicitly 
    handled by filtering by user_id.
    """
    return db.query(Campaign).filter(Campaign.user_id == user_id).order_by(Campaign.created_at.desc()).all()
