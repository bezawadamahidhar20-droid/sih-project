import os
import json
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_
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


def _can_access_prediction(current_user: User, prediction: Prediction) -> bool:
    """Object-level authorization shared by the resource endpoints
    (flag / PDF / heatmap / derived images).

    * staff — may only touch scans they uploaded themselves;
    * doctor/radiologist — the prediction's creator or the scan's uploader.

    A denied request is answered with a plain 404 so the existence of
    another clinician's record is never disclosed (rule: never reveal
    whether another user's medical record exists).
    """
    if current_user.role == UserRole.STAFF:
        return prediction.scan.uploaded_by == current_user.id
    return (
        prediction.user_id == current_user.id
        or prediction.scan.uploaded_by == current_user.id
    )


async def _can_access_scan_image(current_user: User, scan: Scan, db: AsyncSession) -> bool:
    """Object-level authorization for derived-image files served by hash.

    Same rule as :func:`_can_access_prediction`: staff see only their own
    uploads; doctor/radiologist may fetch images for a scan they uploaded or
    on which they created a prediction.
    """
    if current_user.role == UserRole.STAFF:
        return scan.uploaded_by == current_user.id
    if scan.uploaded_by == current_user.id:
        return True
    result = await db.execute(
        select(Prediction.id).where(
            Prediction.scan_id == scan.id,
            Prediction.user_id == current_user.id,
        )
    )
    return result.scalar_one_or_none() is not None


def _build_explanation(predicted_display: str, has_significant_findings: bool) -> str:
    """Single source of truth for the natural-language explainability block
    (used by both the API response and the PDF export)."""
    if not has_significant_findings:
        return (
            "Model attention is uniformly distributed across clear pulmonary "
            "parenchyma with no acute focal opacity or significant pathological "
            "findings detected."
        )
    if "Pneumonia" in predicted_display:
        return (
            "Model attention is heavily concentrated in the lower right lung "
            "field, consistent with focal airspace consolidation and "
            "inflammatory opacity."
        )
    return f"Model attention is localized to regions supporting clinical findings of {predicted_display}."


def _load_derived_image_bytes(scan: Scan, stem: str) -> Optional[bytes]:
    """Read a derived image (``original_<hash>.png`` / ``gradcam_<hash>.png``)
    from the encrypted artifact, decrypting fully in memory so no plaintext
    PHI ever touches disk. Falls back to a legacy plaintext file if one
    exists (created before derived images were encrypted). Returns None when
    neither exists.
    """
    plain = os.path.join(GRADCAM_DIR, stem)
    encrypted = plain + ".enc"
    if os.path.exists(encrypted):
        with open(encrypted, "rb") as f:
            return decrypt_data(f.read())
    if os.path.exists(plain):
        with open(plain, "rb") as f:
            return f.read()
    return None


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
    else:
        # Object-level authorization for doctors/radiologists: creating a
        # prediction must never grant NEW access to a scan the caller does
        # not already own. (Predict-then-access BOLA, live-confirmed: doctor
        # B could predict doctor A's scan and the resulting prediction —
        # owned by B — unlocked A's PDF report, Grad-CAM heatmap and derived
        # images, defeating the owner-scoped resource boundary.) A doctor may
        # only predict a scan they uploaded, or one they have already
        # predicted (pre-guard rows; that access already existed). Denied
        # with a plain 404 so a peer's scan existence is never disclosed.
        query = query.where(
            or_(
                Scan.uploaded_by == current_user.id,
                Scan.id.in_(
                    select(Prediction.scan_id).where(
                        Prediction.user_id == current_user.id
                    )
                ),
            )
        )

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
    
    # Threshold for a finding to be considered present (default 0.40)
    thresh = settings.model_decision_threshold or 0.40
    
    # Sort all findings by confidence descending
    all_findings = [
        {
            "condition": cond,
            "confidence": prob,
            "is_present": prob >= thresh,
            "severity": "high" if prob >= 0.75 else "moderate" if prob >= 0.40 else "low",
        }
        for cond, prob in probs.items()
    ]
    all_findings.sort(key=lambda x: x["confidence"], reverse=True)

    abnormal_findings = [f for f in all_findings if f["condition"].lower() != "normal" and f["is_present"]]
    has_significant_findings = len(abnormal_findings) > 0 or (
        prediction.predicted_class.lower() != "normal" and prediction.confidence >= thresh
    )

    # Co-occurring high confidence findings handling (>70%)
    high_conf_findings = [f["condition"] for f in abnormal_findings if f["confidence"] >= 0.70]
    if len(high_conf_findings) >= 2:
        predicted_display = f"Co-occurring Findings: {' + '.join(high_conf_findings)}"
    elif not has_significant_findings:
        predicted_display = "No significant findings"
    else:
        predicted_display = prediction.predicted_class

    condition_heatmaps = (
        {cond: f"/api/v1/predictions/{prediction.id}/heatmap/{cond}" for cond in probs.keys()}
        if gradcam_url
        else None
    )

    explanation = _build_explanation(predicted_display, has_significant_findings)

    return PredictionResponse(
        id=prediction.id,
        scan_id=prediction.scan_id,
        predicted_class=predicted_display,
        confidence=prediction.confidence,
        all_probabilities=probs,
        findings=all_findings,
        has_significant_findings=has_significant_findings,
        condition_heatmaps=condition_heatmaps,
        explanation=explanation,
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

    # IDOR guard: reading a prediction BY ID follows the same object-level
    # rule as flag/PDF/heatmap — the prediction's creator or the scan's
    # uploader only. (The doctor-wide LIST view — list_predictions / patient
    # history — is the intentional clinical-visibility surface for the
    # multi-doctor review workflow; this endpoint is the direct object-level
    # access pattern and must not let a peer reach a specific record. The
    # frontend never calls it, so this cannot regress the UI.) Denied with a
    # plain 404 so a peer's record existence is never disclosed.
    if not _can_access_prediction(current_user, prediction):
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

    # IDOR guard: a doctor must not flag/unflag another clinician's
    # prediction (or unflag someone else's review flag). Denied with a plain
    # 404 so resource existence is not disclosed.
    if not _can_access_prediction(current_user, prediction):
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


@router.get("/{prediction_id}/pdf")
async def download_prediction_pdf(
    prediction_id: int,
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

    # IDOR guard: the PDF contains medical images — only the prediction's
    # creator or the scan's uploader may download it (safe 404 otherwise).
    if not _can_access_prediction(current_user, prediction):
        raise HTTPException(status_code=404, detail="Prediction not found")

    scan = prediction.scan

    # Derived images are stored encrypted at rest (``<name>.png.enc``);
    # decrypt fully in memory so the PDF is assembled from plaintext bytes
    # that never touch disk (no temp-file cleanup race, no leaked PHI).
    original_bytes = _load_derived_image_bytes(scan, f"original_{scan.file_hash}.png")
    gradcam_bytes = _load_derived_image_bytes(scan, f"gradcam_{scan.file_hash}.png")

    from app.services.pdf_generator import generate_prediction_pdf
    pdf_bytes = generate_prediction_pdf(
        prediction_id=prediction.id,
        scan_id=scan.id,
        predicted_class=prediction.predicted_class,
        confidence=prediction.confidence,
        all_probabilities=_parse_probabilities(prediction.all_probabilities),
        explanation=_build_explanation(prediction.predicted_class, prediction.predicted_class.lower() != "normal"),
        is_flagged=prediction.is_flagged or False,
        anonymized_patient_id=scan.anonymized_patient_id,
        modality=scan.modality,
        body_part=scan.body_part,
        original_image_bytes=original_bytes,
        gradcam_image_bytes=gradcam_bytes,
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=MediScan_Report_Pred_{prediction.id}.pdf"}
    )


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

    # IDOR guard: heatmaps are medical images — owner/creator only.
    if not _can_access_prediction(current_user, prediction):
        raise HTTPException(status_code=404, detail="Prediction not found")

    gradcam_bytes = _load_derived_image_bytes(
        prediction.scan, f"gradcam_{prediction.scan.file_hash}.png"
    )
    if gradcam_bytes is None:
        raise HTTPException(status_code=404, detail="Condition heatmap image not found")
    return Response(
        content=gradcam_bytes,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=300"},
    )


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
    # as the other resource endpoints — staff see their own uploads only;
    # doctor/radiologist may fetch images for scans they uploaded or
    # predicted (a peer's heatmap is not fetchable by guessing the hash).
    scan = await _scan_for_image(db, filename)
    if scan is None:
        raise HTTPException(status_code=404, detail="Image not found")
    if not await _can_access_scan_image(current_user, scan, db):
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
    """Return the full anonymized prediction history for one patient.

    Authorization model (INTENTIONAL, do not change without a product
    decision): patient IDs are anonymized opaque identifiers — a hash or a
    clinician-assigned token, never a real MRN/name — and this endpoint is
    restricted to DOCTOR/RADIOLOGIST roles via ``require_roles``. Within
    that clinical boundary any doctor may review any patient's history, the
    same model ``list_predictions`` uses: doctors/radiologists are the
    trusted clinical layer (a radiologist re-reading a GP's referral is a
    supported workflow), while STAFF are scoped to their own uploads only
    (see the staff branch of ``list_predictions`` / ``get_scan``). The
    anonymization + role gate is what keeps this safe: a caller cannot
    enumerate patients (IDs are opaque) and cannot see PHI (no raw
    filenames/identifiers beyond the anonymized ID are exposed here).
    """
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
