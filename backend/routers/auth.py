from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from models.database import get_db, User
from fastapi import Body
from services.auth_service import verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES, get_current_user, create_refresh_token
from services.rate_limiter import is_ip_allowed_login, record_login_failure, record_login_success

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
