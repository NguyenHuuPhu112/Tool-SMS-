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
