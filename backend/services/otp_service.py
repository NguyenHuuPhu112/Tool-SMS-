import os
import secrets
import hashlib
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from models.database import EmailOTP, User
from dotenv import load_dotenv

load_dotenv()

OTP_EXPIRE_MINUTES = int(os.getenv("OTP_EXPIRE_MINUTES", 10))
OTP_RESEND_COOLDOWN_SECONDS = int(os.getenv("OTP_RESEND_COOLDOWN_SECONDS", 60))

def generate_otp(length: int = 6) -> str:
    """Generate a secure numeric OTP of given length."""
    return ''.join(secrets.choice('0123456789') for _ in range(length))

def hash_otp(otp: str) -> str:
    """Hash OTP using SHA256 before storing."""
    # Using SHA256 with a simple salt mechanism
    secret_key = os.getenv("SECRET_KEY", "default-secret")
    return hashlib.sha256(f"{otp}{secret_key}".encode()).hexdigest()

def verify_otp_hash(input_otp: str, otp_hash: str) -> bool:
    """Verify if the input OTP matches the hash."""
    return hash_otp(input_otp) == otp_hash

def create_email_otp(db: Session, email: str, user_id: str, purpose: str = "register", ip_address: str = None) -> str:
    """
    Create a new OTP, invalidate older ones, and return the plaintext OTP.
    It does NOT send the email. Call email_service separately.
    """
    # Invalidate existing pending OTPs for this email and purpose
    db.query(EmailOTP).filter(
        EmailOTP.email == email,
        EmailOTP.purpose == purpose,
        EmailOTP.consumed_at == None
    ).update({"consumed_at": datetime.utcnow()})
    
    otp_code = generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)
    
    new_otp = EmailOTP(
        user_id=user_id,
        email=email,
        otp_hash=hash_otp(otp_code),
        purpose=purpose,
        expires_at=expires_at,
        ip_address=ip_address
    )
    db.add(new_otp)
    db.commit()
    
    return otp_code

def verify_email_otp(db: Session, email: str, input_otp: str, purpose: str = "register") -> tuple[bool, str]:
    """
    Verify the OTP for a given email.
    Returns (success: bool, message: str)
    """
    # Find the latest unconsumed OTP
    otp_record = db.query(EmailOTP).filter(
        EmailOTP.email == email,
        EmailOTP.purpose == purpose,
        EmailOTP.consumed_at == None
    ).order_by(EmailOTP.created_at.desc()).first()

    if not otp_record:
        return False, "Không tìm thấy mã OTP hợp lệ."

    if datetime.utcnow() > otp_record.expires_at:
        return False, "Mã OTP đã hết hạn."

    if otp_record.attempts >= otp_record.max_attempts:
        return False, "Bạn đã nhập sai quá số lần cho phép. Vui lòng gửi lại mã mới."

    if not verify_otp_hash(input_otp, otp_record.otp_hash):
        # Increment attempt count
        otp_record.attempts += 1
        db.commit()
        return False, "Mã OTP không đúng."

    # Mark as consumed
    otp_record.consumed_at = datetime.utcnow()
    
    # Update user verification status
    if otp_record.user_id:
        user = db.query(User).filter(User.id == otp_record.user_id).first()
        if user:
            user.is_email_verified = True
            user.is_active = True
    
    db.commit()
    return True, "Xác thực email thành công."

def check_resend_cooldown(db: Session, email: str, purpose: str = "register") -> tuple[bool, str]:
    """
    Check if the user is allowed to resend OTP.
    Returns (allowed: bool, message: str)
    """
    latest_otp = db.query(EmailOTP).filter(
        EmailOTP.email == email,
        EmailOTP.purpose == purpose
    ).order_by(EmailOTP.created_at.desc()).first()

    if latest_otp:
        elapsed = (datetime.utcnow() - latest_otp.created_at).total_seconds()
        if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
            remaining = int(OTP_RESEND_COOLDOWN_SECONDS - elapsed)
            return False, f"Vui lòng chờ {remaining} giây trước khi gửi lại mã."
            
    return True, ""
