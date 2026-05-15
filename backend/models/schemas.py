"""
Pydantic Schemas
────────────────
Request/Response schemas cho tất cả API endpoints.
"""

from pydantic import BaseModel, field_validator
from typing import List, Optional
from datetime import datetime
import re


# ─────────────────────────────────────────────────────────────
# Existing schemas (eSMS, Users)
# ─────────────────────────────────────────────────────────────

class SMSPayload(BaseModel):
    name: Optional[str] = "Chiến dịch tự động"
    phones: List[str]
    message: str


class EsmsSettingsModel(BaseModel):
    api_key: str
    secret_key: str
    brandname: str
    sms_type: str


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"
    monthly_quota: int = 1000
    allow_shared_devices: bool = False


class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    monthly_quota: Optional[int] = None
    allow_shared_devices: Optional[bool] = None


# ─────────────────────────────────────────────────────────────
# SMS Gateway Schemas
# ─────────────────────────────────────────────────────────────

class GatewaySMSRequest(BaseModel):
    """
    Request body để gửi SMS qua Android Gateway.

    - phone_number: 8-15 chữ số, có thể bắt đầu bằng +
    - message: nội dung tin nhắn (không rỗng)
    - request_id: (tùy chọn) idempotency key – chống gửi trùng
    """
    phone_number: str
    message: str
    request_id: Optional[str] = None

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        cleaned = re.sub(r"[^\d+]", "", v.strip())
        if not re.match(r"^\+?\d{8,15}$", cleaned):
            raise ValueError(
                "So dien thoai khong hop le (8-15 chu so, co the bat dau bang +)"
            )
        return cleaned

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Noi dung tin nhan khong duoc de trong")
        return stripped


class GatewaySMSResponse(BaseModel):
    """Response sau khi tiếp nhận yêu cầu gửi SMS."""
    status: str
    message: str
    log_id: Optional[str] = None
    request_id: Optional[str] = None


class GatewayLogResponse(BaseModel):
    """Serialize chi tiết một bản ghi SMS log."""
    id: str
    request_id: Optional[str] = None
    phone_number: str
    message: str
    status: str
    provider: str
    gateway_url: Optional[str] = None
    gateway_response: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int
    max_retries: int
    next_retry_at: Optional[datetime] = None
    last_attempt_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GatewaySettingsModel(BaseModel):
    """Cấu hình kết nối tới Android SMS Gateway."""
    android_api_url: str
    max_retries: Optional[int] = 3
    rate_limit_per_minute: Optional[int] = 30


# ─────────────────────────────────────────────────────────────
# Gateway Device Schemas (multi-device)
# ─────────────────────────────────────────────────────────────

class GatewayDeviceCreate(BaseModel):
    """Tạo thiết bị mới."""
    name: str
    base_url: str
    api_key: Optional[str] = None
    is_active: bool = True


class GatewayDeviceUpdate(BaseModel):
    """Cập nhật thiết bị."""
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    is_active: Optional[bool] = None


class GatewayDeviceResponse(BaseModel):
    """Serialize thiết bị gateway."""
    id: str
    name: str
    base_url: str
    is_active: bool
    status: str
    last_health_check_at: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
