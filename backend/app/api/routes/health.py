import json
from pathlib import Path

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


def _load_model_metrics() -> dict:
    """Read the validated evaluation report (``<model>.evaluation.json``)
    written by ``app.models.evaluate``, if present, so the UI can show real
    hold-out metrics (accuracy, sensitivity, ...) instead of invented ones.
    """
    try:
        eval_path = Path(settings.model_path).with_suffix(".evaluation.json")
        if not eval_path.exists():
            return {}
        data = json.loads(eval_path.read_text(encoding="utf-8"))
        metrics = data.get("metrics") or {}
        return {
            "num_samples": data.get("num_samples"),
            "accuracy": metrics.get("accuracy"),
            "balanced_accuracy": metrics.get("balanced_accuracy"),
            "sensitivity": metrics.get("sensitivity"),
            "specificity": metrics.get("specificity"),
            "precision": metrics.get("precision"),
            "auc": metrics.get("auc"),
            "class_names": data.get("class_names") or [],
        }
    except Exception:
        return {}


@router.get("", response_model=HealthResponse)
async def health_check():
    model_service = get_model_service()

    return HealthResponse(
        status="healthy",
        version=settings.app_version,
        model_loaded=model_service.is_model_loaded,
        engine=model_service.engine,
        device=model_service.device,
        heuristic_fallback_active=model_service.heuristic_fallback_active,
        model_decision_threshold=(
            settings.model_decision_threshold
            if model_service.is_model_loaded and settings.model_num_classes == 2
            else None
        ),
        model_metrics=_load_model_metrics() if model_service.is_model_loaded else None,
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