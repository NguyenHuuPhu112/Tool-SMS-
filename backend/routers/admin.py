from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from models.database import get_db, User, SMSLog
from models.schemas import UserCreate, UserUpdate
from services.auth_service import get_current_admin, get_password_hash, validate_password_strength
from datetime import datetime

router = APIRouter()

@router.get("/users")
def get_users(db: Session = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    users = db.query(User).all()
    
    # Calculate usage for current month
    now = datetime.utcnow()
    start_of_month = datetime(now.year, now.month, 1)
    
    result = []
    for u in users:
        usage = db.query(SMSLog).filter(
            SMSLog.user_id == u.id,
            SMSLog.sent_at >= start_of_month
        ).count()
        
        result.append({
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "monthly_quota": u.monthly_quota,
            "allow_shared_devices": u.allow_shared_devices,
            "created_at": u.created_at,
            "current_month_usage": usage
        })
    return result

@router.post("/users")
def create_user(payload: UserCreate, db: Session = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # validate password strength
    if not validate_password_strength(payload.password):
        raise HTTPException(status_code=400, detail="Password does not meet complexity requirements (min 8 chars, upper, lower, digit)")

    hashed = get_password_hash(payload.password)
    new_user = User(
        username=payload.username,
        password_hash=hashed,
        role=payload.role,
        monthly_quota=payload.monthly_quota,
        allow_shared_devices=payload.allow_shared_devices
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User created", "user_id": new_user.id}

@router.put("/users/{user_id}")
def update_user(user_id: str, payload: UserUpdate, db: Session = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if payload.password:
        if not validate_password_strength(payload.password):
            raise HTTPException(status_code=400, detail="Password does not meet complexity requirements (min 8 chars, upper, lower, digit)")
        user.password_hash = get_password_hash(payload.password)
    if payload.role:
        user.role = payload.role
    if payload.monthly_quota is not None:
        user.monthly_quota = payload.monthly_quota
    if payload.allow_shared_devices is not None:
        user.allow_shared_devices = payload.allow_shared_devices
        
    db.commit()
    return {"message": "User updated"}
