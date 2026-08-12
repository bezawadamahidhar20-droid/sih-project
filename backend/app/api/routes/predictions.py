import os
import json
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, require_roles, rate_limit
from app.core.ratelimit import predict_limiter
from app.api.schemas import (
    PredictionResponse, PredictionListResponse, PredictResponse,
    FlagPredictionRequest, ScanResponse,
)
from app.core.config import get_settings
from app.core.security import decrypt_file, decrypt_data, encrypt_file
from app.core.logging import audit_logger, get_logger
from app.core.timeutil import utcnow
from app.db.session import get_db
from app.db.models import Scan, Prediction, User, UserRole, ScanStatus
from app.services.image_processing import (
    load_image, preprocess_image, create_overlay_image, save_image,
    validate_image_quality, ImageQualityError,
)
from app.services.model_inference import get_model_service

settings = get_settings()
logger = get_logger(__name__)

router = APIRouter(prefix="/predictions", tags=["predictions"])

GRADCAM_DIR = os.path.join(settings.upload_dir, "gradcam")
os.makedirs(GRADCAM_DIR, exist_ok=True)


def _run_inference_sync(
    scan: Scan,
    temp_decrypted: str,
    input_size: int,
    upload_dir: str,
) -> tuple[dict, str]:
    """Decrypt -> load -> predict -> render & encrypt derived images.

    Executed in a worker thread (see ``run_in_threadpool``) because all of
    this is CPU/IO-bound work that would otherwise block the event loop and
    stall the entire API.

    Returns ``(result, gradcam_path)`` where ``gradcam_path`` is the logical
    (unencrypted) path stored on the Prediction row; the physical files on
    disk are encrypted as ``<name>.enc``.
    """
    decrypt_file(scan.encrypted_path, temp_decrypted)
    image, _, persist_path = load_image(temp_decrypted)

    # For DICOM, load_image() writes a transient anonymized copy — it is only
    # needed for the read, so remove it immediately (the decrypt temp itself
    # is cleaned up by the caller's ``finally``).
    if persist_path != temp_decrypted and os.path.exists(persist_path):
        os.remove(persist_path)

    # Never silently classify a blank/degenerate image: the model would still
    # answer (usually with high confidence) on garbage. Fail loudly instead.
    validate_image_quality(image)

    input_np = preprocess_image(image, input_size)

    model_service = get_model_service()
    result = model_service.predict_with_gradcam(input_np)

    gradcam_dir = os.path.join(upload_dir, "gradcam")
    os.makedirs(gradcam_dir, exist_ok=True)

    gradcam_path = os.path.join(gradcam_dir, f"gradcam_{scan.file_hash}.png")
    original_path = os.path.join(gradcam_dir, f"original_{scan.file_hash}.png")

    gradcam_overlay = create_overlay_image(image, result["gradcam"])

    # Derived images are patient data too: encrypt them at rest and only
    # decrypt transiently when serving (see get_prediction_image). Rendering
    # AND encryption happen inside the try so the ``finally`` guarantees no
    # cleartext PNG survives — even if a save or encryption step fails
    # mid-way, nothing plaintext is left behind.
    try:
        save_image(gradcam_overlay, gradcam_path)
        save_image(image, original_path)
        encrypt_file(gradcam_path, gradcam_path + ".enc")
        encrypt_file(original_path, original_path + ".enc")
    finally:
        for p in (gradcam_path, original_path):
            if os.path.exists(p):
                os.remove(p)

    return result, gradcam_path


@router.post("/predict/{scan_id}", response_model=PredictResponse)
async def predict_scan(
    scan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    _rate_limited: None = Depends(rate_limit(predict_limiter)),
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

    # Decrypt to a temp file that keeps the original upload extension so
    # load_image() can tell DICOM apart from JPEG/PNG.
    orig_ext = os.path.splitext(scan.original_filename)[1].lower() or ".png"
    temp_decrypted = os.path.join(settings.upload_dir, f"decrypt_{scan.file_hash}{orig_ext}")

    try:
        # CPU/IO-bound inference runs off the event loop so a single
        # prediction cannot stall the whole API (healthchecks, other
        # uploads, ...).
        result, gradcam_path = await run_in_threadpool(
            _run_inference_sync,
            scan,
            temp_decrypted,
            settings.model_input_size,
            settings.upload_dir,
        )

        probabilities = dict(
            zip(settings.model_classes, result["probabilities"])
        )

        # "Abnormal" = anything that is not the first configured class
        # (default: "Normal"). Class-NAME based so reordering MODEL_CLASSES
        # cannot silently invert the flag.
        normal_class = settings.model_classes[0] if settings.model_classes else "Normal"
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
                result["class_name"] != normal_class
                and result["confidence"] > settings.high_risk_threshold
            ),
        )

        scan.status = ScanStatus.COMPLETED
        scan.processed_at = utcnow()

        db.add(prediction)
        try:
            await db.commit()
        except IntegrityError:
            # Concurrent duplicate prediction: ``with_for_update()`` is a
            # no-op on SQLite, so two requests can both reach the INSERT. The
            # unique scan_id constraint is the final authority — roll back,
            # discard the derived images we just wrote, and serve the winning
            # request's cached result instead of 500ing (and never leave the
            # scan stuck in "processing"). rollback() expires every loaded
            # instance, so refresh the scan before touching its attributes
            # (accessing an expired instance in an async session would raise
            # MissingGreenlet).
            await db.rollback()
            await db.refresh(scan)
            for derived in (
                gradcam_path,
                gradcam_path + ".enc",
                os.path.join(os.path.dirname(gradcam_path), f"original_{scan.file_hash}.png.enc"),
            ):
                try:
                    if derived and os.path.exists(derived):
                        os.remove(derived)
                except OSError:
                    pass
            existing_pred = await db.execute(
                select(Prediction)
                .where(Prediction.scan_id == scan_id)
                .options(selectinload(Prediction.scan))
            )
            existing = existing_pred.scalar_one_or_none()
            if existing:
                return await _build_predict_response(existing, scan)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Scan is already being processed",
            )

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

    except ImageQualityError as e:
        # The file is a valid image but cannot support meaningful inference
        # (blank / degenerate). 422 with an actionable message, not a 500.
        await db.rollback()
        scan.status = ScanStatus.FAILED
        await db.commit()
        logger.warning("Image quality check failed (scan %s): %s", scan_id, e)
        audit_logger.log_error(
            user_id=str(current_user.id),
            error_type="image_quality_rejected",
            error_message=str(e),
            context={"scan_id": scan_id},
        )
        raise HTTPException(status_code=422, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
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
    probs = _parse_probabilities(prediction.all_probabilities)
    findings = [
        {
            "condition": cond,
            "confidence": prob,
            "is_present": prob >= 0.4,
            "severity": "high" if prob >= 0.75 else "moderate" if prob >= 0.4 else "low",
        }
        for cond, prob in probs.items()
    ]
    condition_heatmaps = (
        {cond: f"/api/v1/predictions/{prediction.id}/heatmap/{cond}" for cond in probs.keys()}
        if gradcam_url
        else None
    )

    return PredictionResponse(
        id=prediction.id,
        scan_id=prediction.scan_id,
        predicted_class=prediction.predicted_class,
        confidence=prediction.confidence,
        all_probabilities=probs,
        findings=findings,
        condition_heatmaps=condition_heatmaps,
        gradcam_url=gradcam_url,
        processing_time_ms=prediction.processing_time_ms,
        model_version=prediction.model_version,
        model_architecture=prediction.model_architecture,
        is_low_confidence=prediction.is_low_confidence,
        is_high_risk=prediction.is_high_risk,
        is_flagged=prediction.is_flagged or False,
        flagged_by=prediction.flagged_by,
        flagged_at=prediction.flagged_at,
        model_decision_threshold=(
            settings.model_decision_threshold
            if settings.model_num_classes == 2
            else None
        ),
        scan=_scan_response(scan) if scan is not None else None,
        created_at=prediction.created_at,
    )


def _scan_response(scan: Scan) -> ScanResponse:
    return ScanResponse.model_validate(scan)


@router.get("", response_model=PredictionListResponse)
async def list_predictions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
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
            _to_prediction_response(p, _gradcam_url(p), p.scan) for p in predictions
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

    return _to_prediction_response(prediction, _gradcam_url(prediction), prediction.scan)


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

    # Capture the relationship while selectinload guarantees it is loaded:
    # Session.refresh() below expires attributes, and an async session cannot
    # lazy-load a relationship afterwards (MissingGreenlet -> 500).
    scan = prediction.scan

    prediction.is_flagged = request.flagged
    prediction.flagged_by = current_user.id if request.flagged else None
    prediction.flagged_at = utcnow() if request.flagged else None

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

    return _to_prediction_response(prediction, _gradcam_url(prediction), scan)


@router.get("/{prediction_id}/heatmap/{condition}")
async def get_condition_heatmap(
    prediction_id: int,
    condition: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
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
    if current_user.role == UserRole.STAFF and prediction.scan.uploaded_by != current_user.id:
        raise HTTPException(status_code=404, detail="Prediction not found")

    gradcam_file = f"gradcam_{prediction.scan.file_hash}.png"
    gradcam_path = Path(settings.gradcam_dir) / gradcam_file
    if not gradcam_path.exists():
        raise HTTPException(status_code=404, detail="Condition heatmap image not found")
    return FileResponse(path=gradcam_path, media_type="image/png")


async def _scan_for_image(db: AsyncSession, filename: str) -> Optional[Scan]:
    """Map a derived-image filename (``original_<hash>.png`` / ``gradcam_<hash>.png``)
    back to the owning Scan so object-level authorization can be applied.
    """
    for prefix in ("original_", "gradcam_"):
        if filename.startswith(prefix):
            hash_part = filename[len(prefix):].rsplit(".", 1)[0]
            result = await db.execute(select(Scan).where(Scan.file_hash == hash_part))
            return result.scalar_one_or_none()
    return None


@router.get("/image/{filename}")
async def get_prediction_image(
    filename: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Defense-in-depth against path traversal: the filename must be a plain
    # basename and the resolved path must stay inside the gradcam directory.
    # (Checked before any DB lookup so junk input costs nothing.)
    if os.path.basename(filename) != filename:
        raise HTTPException(status_code=404, detail="Image not found")

    # Object-level authorization: the filename embeds the owning scan's file
    # hash, so resolve it back to a Scan and enforce the same ownership rule
    # as the scan endpoints (staff see their own uploads only).
    scan = await _scan_for_image(db, filename)
    if scan is None:
        raise HTTPException(status_code=404, detail="Image not found")
    if current_user.role == UserRole.STAFF and scan.uploaded_by != current_user.id:
        raise HTTPException(status_code=404, detail="Image not found")

    file_path = os.path.join(GRADCAM_DIR, filename)
    resolved = os.path.realpath(file_path)
    gradcam_real = os.path.realpath(GRADCAM_DIR)
    if not resolved.startswith(gradcam_real + os.sep):
        raise HTTPException(status_code=404, detail="Image not found")

    from fastapi.responses import FileResponse

    # Derived images are stored encrypted (``<name>.png.enc``). Decrypt into a
    # transient temp file, serve it, then delete it. Legacy plaintext files
    # (created before this fix) are still served directly.
    encrypted_path = resolved + ".enc"
    if os.path.exists(encrypted_path):
        # Decrypt fully in memory and serve the bytes directly — no temp file
        # ever touches disk, so a dropped client connection cannot strand a
        # decrypted PHI image in the gradcam directory.
        with open(encrypted_path, "rb") as f:
            plain = decrypt_data(f.read())
        return Response(
            content=plain,
            media_type="image/png",
            headers={"Cache-Control": "private, max-age=300"},
        )

    if not os.path.exists(resolved):
        raise HTTPException(status_code=404, detail="Image not found")

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

    return [_to_prediction_response(p, _gradcam_url(p), p.scan) for p in predictions]


def _gradcam_url(prediction: Prediction) -> Optional[str]:
    if not prediction.gradcam_path:
        return None
    return f"/api/v1/predictions/image/{os.path.basename(prediction.gradcam_path)}"
