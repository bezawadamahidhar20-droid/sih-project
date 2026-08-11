import os
import uuid
import mimetypes
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, require_roles, require_staff_or_above
from app.api.schemas import (
    ScanResponse, ScanListResponse, ScanStatus
)
from app.core.config import get_settings
from app.core.security import encrypt_file
from app.core.logging import audit_logger, get_logger
from app.db.session import get_db
from app.db.models import Scan, Prediction, User, UserRole
from app.services.image_processing import load_image

settings = get_settings()
logger = get_logger(__name__)

router = APIRouter(prefix="/scans", tags=["scans"])

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/dicom",
    "application/dicom", "application/octet-stream"
}

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".dcm", ".dicom"}


def validate_file(file: UploadFile) -> None:
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"MIME type not allowed: {file.content_type}"
        )


@router.post("/upload", response_model=ScanResponse, status_code=status.HTTP_201_CREATED)
async def upload_scan(
    request: Request,
    file: UploadFile = File(...),
    anonymized_patient_id: Optional[str] = Form(None, max_length=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff_or_above)
):
    validate_file(file)

    # Reject oversized uploads before buffering the body when the client
    # sends a Content-Length (multipart parsers may not, so the in-memory
    # check below remains authoritative).
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    try:
        content_length = int(request.headers.get("content-length", "0") or "0")
    except (TypeError, ValueError):
        content_length = 0
    if content_length > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max size: {settings.max_file_size_mb}MB"
        )

    content = await file.read()
    file_size = len(content)
    
    if file_size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max size: {settings.max_file_size_mb}MB"
        )
    
    file_hash = generate_file_hash_from_bytes(content)
    
    existing = await db.execute(select(Scan).where(Scan.file_hash == file_hash))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="File already uploaded (duplicate detected)"
        )
    
    os.makedirs(settings.upload_dir, exist_ok=True)
    
    temp_path = os.path.join(settings.upload_dir, f"temp_{file_hash}{os.path.splitext(file.filename)[1]}")
    with open(temp_path, "wb") as f:
        f.write(content)
    
    try:
        image, dicom_metadata, persist_path = load_image(temp_path)
    except Exception as e:
        os.remove(temp_path)
        logger.error(f"Failed to load image: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or corrupted image file"
        )

    # For DICOM uploads ``persist_path`` is a freshly-written anonymized copy
    # (no PHI); for JPEG/PNG it is the original temp file. Only that file is
    # ever encrypted and stored at rest.
    encrypted_filename = f"{file_hash}.enc"
    encrypted_path = os.path.join(settings.upload_dir, encrypted_filename)
    encrypt_file(persist_path, encrypted_path)

    # Clean up temp artifacts.
    if os.path.exists(temp_path):
        os.remove(temp_path)
    if persist_path != temp_path and os.path.exists(persist_path):
        os.remove(persist_path)
    
    scan = Scan(
        file_hash=file_hash,
        original_filename=file.filename,
        encrypted_path=encrypted_path,
        file_size=file_size,
        mime_type=file.content_type or "application/octet-stream",
        anonymized_patient_id=anonymized_patient_id
        or (dicom_metadata.get("PatientID") if dicom_metadata else None),
        study_date=parse_dicom_date(dicom_metadata.get("StudyDate")) if dicom_metadata else None,
        modality=dicom_metadata.get("Modality") if dicom_metadata else None,
        body_part=dicom_metadata.get("BodyPartExamined") if dicom_metadata else None,
        uploaded_by=current_user.id,
        status=ScanStatus.UPLOADED,
    )
    
    db.add(scan)
    try:
        await db.commit()
    except IntegrityError:
        # Concurrent duplicate upload slipping past the pre-check: the unique
        # index on file_hash is the final authority.
        await db.rollback()
        if os.path.exists(encrypted_path):
            os.remove(encrypted_path)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="File already uploaded (duplicate detected)"
        )
    await db.refresh(scan)
    
    audit_logger.log_upload(
        user_id=str(current_user.id),
        user_role=current_user.role.value,
        file_hash=file_hash,
        filename=file.filename,
        file_size=file_size,
        mime_type=scan.mime_type
    )
    
    return scan


def generate_file_hash_from_bytes(content: bytes) -> str:
    import hashlib
    return hashlib.sha256(content).hexdigest()


def parse_dicom_date(date_str: Optional[str]) -> Optional[datetime]:
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y%m%d")
    except ValueError:
        return None


@router.get("", response_model=ScanListResponse)
async def list_scans(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[ScanStatus] = Query(None),
    patient_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    query = select(Scan)
    
    if current_user.role == UserRole.STAFF:
        query = query.where(Scan.uploaded_by == current_user.id)
    
    if status_filter:
        query = query.where(Scan.status == status_filter)
    
    if patient_id:
        query = query.where(Scan.anonymized_patient_id == patient_id)
    
    query = query.order_by(desc(Scan.created_at))
    
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)
    
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    scans = result.scalars().all()
    
    return {
        "scans": scans,
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.get("/{scan_id}", response_model=ScanResponse)
async def get_scan(
    scan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    query = select(Scan).where(Scan.id == scan_id)
    
    if current_user.role == UserRole.STAFF:
        query = query.where(Scan.uploaded_by == current_user.id)
    
    result = await db.execute(query)
    scan = result.scalar_one_or_none()
    
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    return scan


@router.delete("/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scan(
    scan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.RADIOLOGIST))
):
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Cascade cleanup: remove the associated prediction (FK), the derived
    # original/gradcam images, and the encrypted upload. Without this the
    # prediction row would orphan on SQLite and the FK constraint would make
    # the delete crash with a 500 on Postgres.
    prediction = await db.execute(
        select(Prediction).where(Prediction.scan_id == scan_id)
    )
    pred_row = prediction.scalar_one_or_none()
    if pred_row:
        await db.delete(pred_row)

    gradcam_dir = os.path.join(settings.upload_dir, "gradcam")
    for stem in (f"original_{scan.file_hash}.png", f"gradcam_{scan.file_hash}.png"):
        for candidate in (os.path.join(gradcam_dir, stem), os.path.join(gradcam_dir, stem + ".enc")):
            try:
                if os.path.exists(candidate):
                    os.remove(candidate)
            except OSError:
                pass

    try:
        if os.path.exists(scan.encrypted_path):
            os.remove(scan.encrypted_path)
    except OSError:
        pass

    await db.delete(scan)
    await db.commit()
    logger.info("Scan %s deleted by user %s", scan_id, current_user.id)