from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from models.database import get_db, User
from fastapi import Body
from services.auth_service import verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES, get_current_user, create_refresh_token, get_password_hash
from services.rate_limiter import is_ip_allowed_login, record_login_failure, record_login_success
from models.schemas import RegisterRequest, VerifyEmailOtpRequest, ResendEmailOtpRequest
from services.otp_service import create_email_otp, verify_email_otp, check_resend_cooldown
from services.email_service import send_otp_email

router = APIRouter()

@router.post("/login")
def login_for_access_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"

    allowed, msg = is_ip_allowed_login(client_ip)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=msg)

    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        # record failure for IP
        try:
            record_login_failure(client_ip)
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if user.email and not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"message": "Vui lòng xác thực email trước khi đăng nhập.", "email": user.email}
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    # successful login -> reset failures
    try:
        record_login_success(client_ip)
    except Exception:
        pass

    access_token = create_access_token(
        data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token({"sub": user.username, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer", "refresh_token": refresh_token}

@router.get("/me")
def read_users_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "monthly_quota": current_user.monthly_quota
    }


@router.post("/refresh")
def refresh_access_token(payload: dict = Body(...)):
    """Exchange a refresh token for a new access token.
    Payload: {"refresh_token": "..."}
    """
    refresh_token = payload.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="refresh_token required")

    import jwt
    from services.auth_service import SECRET_KEY, ALGORITHM

    try:
        data = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if data.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token is not a refresh token")

    username = data.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": username, "role": data.get("role")}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/register")
def register(request: Request, payload: RegisterRequest = Body(...), db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"

    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username đã tồn tại.")

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email đã tồn tại.")
        
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu phải có ít nhất 6 ký tự.")

    new_user = User(
        username=payload.username,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role="user",
        is_email_verified=False,
        is_active=False
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    otp_code = create_email_otp(db, payload.email, new_user.id, purpose="register", ip_address=client_ip)
    
    try:
        send_otp_email(payload.email, otp_code)
    except Exception as e:
        db.delete(new_user)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Không thể gửi email OTP. Vui lòng kiểm tra cấu hình SMTP.")

    return {"message": "Đăng ký thành công. Vui lòng kiểm tra email để nhập mã OTP.", "email": payload.email}


@router.post("/verify-email-otp")
def verify_email(payload: VerifyEmailOtpRequest = Body(...), db: Session = Depends(get_db)):
    success, msg = verify_email_otp(db, payload.email, payload.otp, purpose="register")
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}


@router.post("/resend-email-otp")
def resend_email(request: Request, payload: ResendEmailOtpRequest = Body(...), db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        return {"message": "Nếu email tồn tại trong hệ thống, mã OTP đã được gửi."}
        
    if user.is_email_verified:
        return {"message": "Email này đã được xác thực."}

    allowed, msg = check_resend_cooldown(db, payload.email, purpose="register")
    if not allowed:
        raise HTTPException(status_code=429, detail=msg)

    otp_code = create_email_otp(db, payload.email, user.id, purpose="register", ip_address=client_ip)
    
    try:
        send_otp_email(payload.email, otp_code)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Không thể gửi email lúc này.")

    return {"message": "Mã OTP mới đã được gửi."}
