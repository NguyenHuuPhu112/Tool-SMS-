from fastapi import APIRouter
from .sms import router as sms_router
from .logs import router as logs_router
from .devices import router as devices_router
from .settings import router as settings_router

router = APIRouter()
router.include_router(sms_router, tags=["Gateway SMS"])
router.include_router(logs_router, tags=["Gateway Logs"])
router.include_router(devices_router, tags=["Gateway Devices"])
router.include_router(settings_router, tags=["Gateway Settings"])
