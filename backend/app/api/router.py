from fastapi import APIRouter

from app.api import auth, health


router = APIRouter(prefix="/api")
router.include_router(health.router)
router.include_router(auth.router)
