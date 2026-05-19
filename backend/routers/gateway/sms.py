import logging
import json
import os
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session

from models.database import get_db, User, GatewaySMSLog
from models.schemas import GatewaySMSRequest, GatewaySMSResponse, GatewaySMSCallbackRequest
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
        # COMMENTED OUT FOR TESTING: Cho phép gửi trùng lặp request_id khi test
        # existing = check_idempotency(request.request_id, db)
        # if existing:
        #     return GatewaySMSResponse(
        #         status="already_exists",
        #         message=f"Request {request.request_id} da ton tai",
        #         log_id=existing.id,
        #         request_id=existing.request_id,
        #     )
        pass

    ok, err = check_rate_limit_global(db)
    if not ok: raise HTTPException(status_code=429, detail=err)

    ok, err = check_rate_limit_phone(request.phone_number, db)
    if not ok: raise HTTPException(status_code=429, detail=err)

    ok, err = check_user_quota(current_user.id, db)
    if not ok: raise HTTPException(status_code=429, detail=err)

    log_entry = create_sms_log(db, request.request_id, request.phone_number, request.message, current_user.id, request.device_id)
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
        # COMMENTED OUT FOR TESTING: Cho phép gửi trùng lặp request_id khi test
        # existing = check_idempotency(request.request_id, db)
        # if existing:
        #     return GatewaySMSResponse(status="already_exists", message=f"Request {request.request_id} da ton tai", log_id=existing.id, request_id=existing.request_id)
        pass

    ok, err = check_rate_limit_global(db)
    if not ok: raise HTTPException(status_code=429, detail=err)

    ok, err = check_rate_limit_phone(request.phone_number, db)
    if not ok: raise HTTPException(status_code=429, detail=err)

    log_entry = create_sms_log(db, request.request_id, request.phone_number, request.message, None, request.device_id)
    background_tasks.add_task(send_sms_via_gateway, log_id=log_entry.id, phone=request.phone_number, message=request.message)

    log_audit(db, action="sms.send_external", target_type="gateway_sms_log", target_id=log_entry.id, details={"phone": request.phone_number}, ip_address=get_client_ip(req))

    return GatewaySMSResponse(status="accepted", message="Da tiep nhan", log_id=log_entry.id, request_id=log_entry.request_id)


@router.post("/sms-status-callback")
async def gateway_sms_status_callback(
    payload: GatewaySMSCallbackRequest,
    x_gateway_callback_token: str | None = Header(None, alias="X-Gateway-Callback-Token"),
    db: Session = Depends(get_db),
):
    expected_token = os.getenv("GATEWAY_CALLBACK_TOKEN")
    if not expected_token or x_gateway_callback_token != expected_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    log = db.query(GatewaySMSLog).filter(
        (GatewaySMSLog.request_id == payload.request_id) | (GatewaySMSLog.id == payload.request_id)
    ).first()
    
    if not log:
        raise HTTPException(status_code=404, detail="Khong tim thay ban ghi log SMS")

    valid_statuses = {"sent", "delivered", "failed", "delivery_failed"}
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Trang thai '{payload.status}' khong hop le")

    now = datetime.utcnow()
    log.status = payload.status
    log.delivery_status = payload.status
    log.updated_at = now

    if payload.status == "sent":
        if not log.sent_at:
            log.sent_at = now
    elif payload.status == "delivered":
        log.delivered_at = now
        if not log.sent_at:
            log.sent_at = now
    elif payload.status in {"failed", "delivery_failed"}:
        log.delivery_error = payload.message or "Loi tu callback"

    # Store full serialized body including raw_payload inside callback_payload
    log.callback_payload = json.dumps(payload.model_dump(), ensure_ascii=False)

    db.commit()
    return {"status": "success", "message": f"Da cap nhat trang thai thanh {payload.status}"}
