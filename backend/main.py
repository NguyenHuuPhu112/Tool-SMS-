"""
Auto SMS API – FastAPI Entrypoint
─────────────────────────────────
Khoi tao app, DB, routers, va startup worker.

Startup worker:
  - Scan gateway_sms_logs cho records pending/retrying
    voi next_retry_at <= now (hoac NULL cho pending).
  - Dispatch chung de gui lai.
  - Loop moi 30 giay.
  - Muc dich: neu server restart, SMS chua gui se duoc pick up lai.
"""

import os
import asyncio
import logging
from datetime import datetime

from dotenv import load_dotenv

# Load .env truoc khi import cac module khac
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from models.database import engine, Base, SessionLocal, User, GatewaySMSLog
from routers import sms, auth, admin, gateway
from services.auth_service import get_password_hash
from services.sms_gateway_service import send_sms_via_gateway

logger = logging.getLogger("main")

# Khoi tao DB SQLite (tao tat ca bang neu chua ton tai)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Auto SMS API")

# Cau hinh CORS de React co the goi API ma khong bi block
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gan module Routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(sms.router, prefix="/api", tags=["SMS"])
app.include_router(gateway.router, prefix="/api/gateway")


# ─── Startup Events ──────────────────────────────────────────

@app.on_event("startup")
def create_default_admin():
    """Tao admin mac dinh neu chua co."""
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            new_admin = User(
                username="admin",
                password_hash=get_password_hash("admin123"),
                role="admin",
                monthly_quota=1000000,
            )
            db.add(new_admin)
            db.commit()
    finally:
        db.close()


@app.on_event("startup")
def log_env_loaded():
    token_loaded = os.getenv("GATEWAY_CALLBACK_TOKEN") is not None
    print(f"GATEWAY_CALLBACK_TOKEN loaded: {token_loaded}")


@app.on_event("startup")
async def start_pending_worker():
    """
    Khoi dong background worker de pick up SMS pending/retrying.

    Worker chay moi 30 giay:
      1. Tim cac record status=pending (chua duoc dispatch)
         hoac status=retrying voi next_retry_at <= now.
      2. Dispatch chung qua send_sms_via_gateway.

    Dieu nay dam bao:
      - SMS khong bi mat khi server restart.
      - Retry duoc xu ly dung thoi diem.
      - De nang cap sang Celery/RQ sau nay (thay worker nay).
    """
    asyncio.create_task(_pending_worker_loop())


@app.on_event("startup")
async def start_device_health_loop():
    """Start background device health-check loop."""
    from services.device_health_service import device_health_loop
    asyncio.create_task(device_health_loop())


async def _pending_worker_loop():
    """Worker loop – scan va dispatch pending SMS moi 30 giay."""
    # Doi 5 giay de server hoan tat startup
    await asyncio.sleep(5)
    logger.info("Pending SMS worker started (interval: 30s)")

    while True:
        try:
            db = SessionLocal()
            now = datetime.utcnow()

            # Tim pending records (moi tao, chua dispatch)
            # Chi lay nhung record tao cach day > 60s (tranh chon record
            # vua tao va dang duoc BackgroundTasks xu ly)
            stale_threshold = datetime(
                now.year, now.month, now.day,
                now.hour, now.minute, now.second,
            )
            from datetime import timedelta
            stale_threshold = now - timedelta(seconds=60)

            pending_records = db.query(GatewaySMSLog).filter(
                GatewaySMSLog.status == "pending",
                GatewaySMSLog.created_at <= stale_threshold,
            ).limit(10).all()

            # Tim retrying records da den luc retry
            retrying_records = db.query(GatewaySMSLog).filter(
                GatewaySMSLog.status == "retrying",
                GatewaySMSLog.next_retry_at <= now,
            ).limit(10).all()

            all_records = pending_records + retrying_records
            db.close()

            for record in all_records:
                logger.info(
                    f"Worker picking up SMS {record.id} "
                    f"(status={record.status}, phone={record.phone_number})"
                )
                asyncio.create_task(
                    send_sms_via_gateway(
                        log_id=record.id,
                        phone=record.phone_number,
                        message=record.message,
                    )
                )

        except Exception as e:
            logger.error(f"Pending worker error: {e}")

        await asyncio.sleep(30)


# ─── Root ─────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "Backend is running!"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
