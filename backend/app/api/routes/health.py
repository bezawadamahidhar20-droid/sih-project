from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.api.deps import get_current_active_user, require_roles
from app.api.schemas import HealthResponse
from app.db.session import get_db
from app.services.model_inference import get_model_service
from app.core.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=HealthResponse)
async def health_check():
    model_service = get_model_service()

    return HealthResponse(
        status="healthy",
        version=settings.app_version,
        model_loaded=model_service.is_model_loaded,
        engine=model_service.engine,
        device=model_service.device,
    )


@router.get("/ready")
async def readiness_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    model_service = get_model_service()
    # Ready when the database responds and at least one engine is available
    # (a trained CNN model or the baseline heuristic engine).
    model_ok = model_service.engine is not None

    if db_ok and model_ok:
        return {"status": "ready"}
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Service not ready")


@router.get("/live")
async def liveness_check():
    return {"status": "alive"}