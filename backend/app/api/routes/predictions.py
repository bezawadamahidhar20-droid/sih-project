import os
import json
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, require_roles
from app.api.schemas import (
    PredictionResponse, PredictionListResponse, PredictResponse,
    FlagPredictionRequest, ScanResponse,
)
from app.core.config import get_settings
from app.core.security import decrypt_file
from app.core.logging import audit_logger, get_logger
from app.db.session import get_db
from app.db.models import Scan, Prediction, User, UserRole, ScanStatus
from app.services.image_processing import load_image, preprocess_image, create_overlay_image, save_image
from app.services.model_inference import get_model_service

settings = get_settings()
logger = get_logger(__name__)

router = APIRouter(prefix="/predictions", tags=["predictions"])

GRADCAM_DIR = os.path.join(settings.upload_dir, "gradcam")
os.makedirs(GRADCAM_DIR, exist_ok=True)


@router.post("/predict/{scan_id}", response_model=PredictResponse)
async def predict_scan(
    scan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    query = select(Scan).where(Scan.id == scan_id).with_for_update()

    if current_user.role == UserRole.STAFF:
        query = query.where(Scan.uploaded_by == current_user.id)

    result = await db.execute(query)
    scan = result.scalar_one_or_none()

    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    if scan.status == ScanStatus.PROCESSING:
        raise HTTPException(status_code=409, detail="Scan is already being processed")

    if scan.status == ScanStatus.COMPLETED:
        existing_pred = await db.execute(
            select(Prediction)
            .where(Prediction.scan_id == scan_id)
            .options(selectinload(Prediction.scan))
        )
        existing = existing_pred.scalar_one_or_none()
        if existing:
            return await _build_predict_response(existing, scan)

    scan.status = ScanStatus.PROCESSING
    await db.commit()

    temp_decrypted = os.path.join(settings.upload_dir, f"decrypt_{scan.file_hash}.tmp")

    try:
        decrypt_file(scan.encrypted_path, temp_decrypted)
        image, _ = load_image(temp_decrypted)

        input_np = preprocess_image(image, settings.model_input_size)

        model_service = get_model_service()
        result = model_service.predict_with_gradcam(input_np)

        gradcam_filename = f"gradcam_{scan.file_hash}.png"
        gradcam_path = os.path.join(GRADCAM_DIR, gradcam_filename)

        gradcam_overlay = create_overlay_image(image, result["gradcam"])
        save_image(gradcam_overlay, gradcam_path)

        original_image_path = os.path.join(GRADCAM_DIR, f"original_{scan.file_hash}.png")
        save_image(image, original_image_path)

        probabilities = dict(
            zip(settings.model_classes, result["probabilities"])
        )

        prediction = Prediction(
            scan_id=scan.id,
            user_id=current_user.id,
            predicted_class=result["class_name"],
            confidence=result["confidence"],
            all_probabilities=json.dumps(probabilities),
            gradcam_path=gradcam_path,
            processing_time_ms=result["processing_time_ms"],
            model_version=settings.app_version,
            model_architecture=result["engine"],
            is_low_confidence=result["confidence"] < settings.low_confidence_threshold,
            is_high_risk=(
                result["predicted_class"] != 0
                and result["confidence"] > settings.high_risk_threshold
            ),
        )

        scan.status = ScanStatus.COMPLETED
        scan.processed_at = datetime.utcnow()

        db.add(prediction)
        await db.commit()
        await db.refresh(prediction)

        audit_logger.log_prediction(
            user_id=str(current_user.id),
            user_role=current_user.role.value,
            file_hash=scan.file_hash,
            prediction=result["class_name"],
            confidence=result["confidence"],
            processing_time_ms=result["processing_time_ms"],
            model_version=settings.app_version,
            anonymized_patient_id=scan.anonymized_patient_id,
        )

        return await _build_predict_response(prediction, scan)

    except Exception as e:
        scan.status = ScanStatus.FAILED
        await db.commit()
        logger.error(f"Prediction failed: {e}")
        audit_logger.log_error(
            user_id=str(current_user.id),
            error_type="prediction_failed",
            error_message=str(e),
            context={"scan_id": scan_id}
        )
        raise HTTPException(status_code=500, detail="Prediction failed")
    finally:
        if os.path.exists(temp_decrypted):
            os.remove(temp_decrypted)


async def _build_predict_response(
    prediction: Prediction,
    scan: Scan,
) -> PredictResponse:
    original_url = f"/api/v1/predictions/image/original_{scan.file_hash}.png"
    gradcam_url = f"/api/v1/predictions/image/gradcam_{scan.file_hash}.png"

    warning = None
    if prediction.is_low_confidence:
        warning = f"Low confidence prediction ({prediction.confidence:.1%}). Clinical correlation recommended."
    elif prediction.is_high_risk:
        warning = f"High confidence abnormal finding ({prediction.confidence:.1%}). Urgent review recommended."

    return PredictResponse(
        prediction=_to_prediction_response(prediction, gradcam_url, scan),
        scan=_scan_response(scan),
        original_image_url=original_url,
        gradcam_overlay_url=gradcam_url,
        warning=warning
    )


def _parse_probabilities(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return {}


def _to_prediction_response(
    prediction: Prediction,
    gradcam_url: Optional[str] = None,
    scan: Optional[Scan] = None,
) -> PredictionResponse:
    return PredictionResponse(
        id=prediction.id,
        scan_id=prediction.scan_id,
        predicted_class=prediction.predicted_class,
        confidence=prediction.confidence,
        all_probabilities=_parse_probabilities(prediction.all_probabilities),
        gradcam_url=gradcam_url,
        processing_time_ms=prediction.processing_time_ms,
        model_version=prediction.model_version,
        model_architecture=prediction.model_architecture,
        is_low_confidence=prediction.is_low_confidence,
        is_high_risk=prediction.is_high_risk,
        is_flagged=prediction.is_flagged or False,
        flagged_by=prediction.flagged_by,
        flagged_at=prediction.flagged_at,
        scan=_scan_response(scan) if scan is not None else None,
        created_at=prediction.created_at,
    )


def _scan_response(scan: Scan) -> ScanResponse:
    return ScanResponse.model_validate(scan)


@router.get("", response_model=PredictionListResponse)
async def list_predictions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    patient_id: Optional[str] = Query(None),
    predicted_class: Optional[str] = Query(None),
    min_confidence: Optional[float] = Query(None, ge=0, le=1),
    flagged: Optional[bool] = Query(None),
    from_date: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    query = select(Prediction).join(Scan).options(selectinload(Prediction.scan))

    if current_user.role == UserRole.STAFF:
        query = query.where(Scan.uploaded_by == current_user.id)

    if patient_id:
        query = query.where(Scan.anonymized_patient_id == patient_id)

    if predicted_class:
        query = query.where(Prediction.predicted_class == predicted_class)

    if min_confidence is not None:
        query = query.where(Prediction.confidence >= min_confidence)

    if flagged is not None:
        query = query.where(Prediction.is_flagged == flagged)

    if from_date is not None:
        query = query.where(Prediction.created_at >= from_date)

    query = query.order_by(desc(Prediction.created_at))

    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    predictions = result.scalars().all()

    return {
        "predictions": [
            _to_prediction_response(p, _gradcam_url(p)) for p in predictions
        ],
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.get("/{prediction_id}", response_model=PredictionResponse)
async def get_prediction(
    prediction_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    query = (
        select(Prediction)
        .join(Scan)
        .where(Prediction.id == prediction_id)
        .options(selectinload(Prediction.scan))
    )

    if current_user.role == UserRole.STAFF:
        query = query.where(Scan.uploaded_by == current_user.id)

    result = await db.execute(query)
    prediction = result.scalar_one_or_none()

    if not prediction:
        raise HTTPException(status_code=404, detail="Prediction not found")

    return _to_prediction_response(prediction, _gradcam_url(prediction))


@router.post("/{prediction_id}/flag", response_model=PredictionResponse)
async def flag_prediction(
    prediction_id: int,
    request: FlagPredictionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.RADIOLOGIST))
):
    query = (
        select(Prediction)
        .where(Prediction.id == prediction_id)
        .options(selectinload(Prediction.scan))
    )
    result = await db.execute(query)
    prediction = result.scalar_one_or_none()

    if not prediction:
        raise HTTPException(status_code=404, detail="Prediction not found")

    prediction.is_flagged = request.flagged
    prediction.flagged_by = current_user.id if request.flagged else None
    prediction.flagged_at = datetime.utcnow() if request.flagged else None

    await db.commit()
    await db.refresh(prediction)

    audit_logger.logger.info(
        "prediction_flagged",
        extra={
            "event_type": "flag",
            "user_id": str(current_user.id),
            "prediction_id": prediction_id,
            "flagged": request.flagged,
        }
    )

    return _to_prediction_response(prediction, _gradcam_url(prediction))


@router.get("/image/{filename}")
async def get_prediction_image(
    filename: str,
    current_user: User = Depends(get_current_active_user)
):
    # Defense-in-depth against path traversal: the filename must be a plain
    # basename and the resolved path must stay inside the gradcam directory.
    if os.path.basename(filename) != filename:
        raise HTTPException(status_code=404, detail="Image not found")

    file_path = os.path.join(GRADCAM_DIR, filename)
    resolved = os.path.realpath(file_path)
    gradcam_real = os.path.realpath(GRADCAM_DIR)
    if not resolved.startswith(gradcam_real + os.sep):
        raise HTTPException(status_code=404, detail="Image not found")
    if not os.path.exists(resolved):
        raise HTTPException(status_code=404, detail="Image not found")

    from fastapi.responses import FileResponse
    return FileResponse(resolved)


@router.get("/patient/{patient_id}/history", response_model=List[PredictionResponse])
async def get_patient_history(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.RADIOLOGIST))
):
    query = (
        select(Prediction)
        .join(Scan)
        .where(Scan.anonymized_patient_id == patient_id)
        .options(selectinload(Prediction.scan))
        .order_by(desc(Prediction.created_at))
    )

    result = await db.execute(query)
    predictions = result.scalars().all()

    return [_to_prediction_response(p, _gradcam_url(p)) for p in predictions]


def _gradcam_url(prediction: Prediction) -> Optional[str]:
    if not prediction.gradcam_path:
        return None
    return f"/api/v1/predictions/image/{os.path.basename(prediction.gradcam_path)}"
