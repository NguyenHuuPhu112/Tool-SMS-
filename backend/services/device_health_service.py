import os
import asyncio
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from models.database import SessionLocal, GatewayDevice
from services.sms_gateway_service import check_device_health

logger = logging.getLogger("device_health")


async def _check_one_device(db: Session, device: GatewayDevice):
    try:
        health = await check_device_health(device.base_url, device.api_key or "")
        status_code = health.get("status_code")
        err = health.get("error")

        if status_code == 200:
            device.status = "online"
        elif status_code == 401:
            device.status = "unauthorized"
        elif err and ("Timeout" in err or "Connection" in err or "Connection refused" in err):
            device.status = "offline"
        else:
            # fallback: if health.online True but no 200 status_code
            device.status = "online" if health.get("online") else "error"

        device.last_health_check_at = datetime.utcnow()
        device.last_error = err
        db.add(device)
        db.commit()
        logger.info(f"Health check {device.id} -> {device.status} (code={status_code})")
    except Exception as e:
        logger.exception(f"Health check failed for device {device.id}: {e}")
        try:
            device.last_health_check_at = datetime.utcnow()
            device.last_error = f"Exception: {type(e).__name__}: {str(e)[:300]}"
            device.status = "error"
            db.add(device)
            db.commit()
        except:
            pass


async def device_health_loop():
    """Background loop to periodically check health of active gateway devices."""
    interval = int(os.getenv("DEVICE_HEALTH_INTERVAL_SECONDS", "30"))
    # slight startup delay
    await asyncio.sleep(5)
    logger.info(f"Device health loop started (interval={interval}s)")

    while True:
        try:
            db = SessionLocal()
            devices = db.query(GatewayDevice).filter(GatewayDevice.is_active == True).all()
            tasks = []
            for device in devices:
                tasks.append(_check_one_device(db, device))

            if tasks:
                await asyncio.gather(*tasks)
            db.close()
        except Exception as e:
            logger.exception(f"Device health loop error: {e}")

        await asyncio.sleep(interval)
