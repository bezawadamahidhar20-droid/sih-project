import enum
from typing import Optional
from sqlalchemy import (
    Column, Integer, String, DateTime, Enum, ForeignKey, Index, Text, Float, Boolean
)
from sqlalchemy.orm import relationship
from app.core.timeutil import utcnow
from app.db.session import Base


class UserRole(str, enum.Enum):
    DOCTOR = "doctor"
    RADIOLOGIST = "radiologist"
    STAFF = "staff"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.STAFF)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    last_login = Column(DateTime, nullable=True)
    # Bumped to revoke ALL outstanding JWTs (password change, role/status
    # change). Access/refresh tokens embed this value in their ``ver`` claim.
    token_version = Column(Integer, default=0, nullable=False)

    predictions = relationship(
        "Prediction", back_populates="user", lazy="selectin",
        foreign_keys="Prediction.user_id"
    )


class ScanStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Scan(Base):
    __tablename__ = "scans"

    id = Column(Integer, primary_key=True, index=True)
    file_hash = Column(String(64), unique=True, index=True, nullable=False)
    original_filename = Column(String(255), nullable=False)
    encrypted_path = Column(String(512), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=False)
    anonymized_patient_id = Column(String(100), nullable=True, index=True)
    study_date = Column(DateTime, nullable=True)
    modality = Column(String(50), nullable=True)
    body_part = Column(String(50), nullable=True)
    status = Column(Enum(ScanStatus), default=ScanStatus.UPLOADED, nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow)
    processed_at = Column(DateTime, nullable=True)

    uploader = relationship("User", foreign_keys=[uploaded_by])
    prediction = relationship("Prediction", back_populates="scan", uselist=False, lazy="selectin")

    __table_args__ = (
        Index("ix_scans_anonymized_patient_created", "anonymized_patient_id", "created_at"),
    )


class RefreshSession(Base):
    """Persistent record of an issued (not yet consumed) refresh token.

    Unlike the legacy in-memory consumed-jti set, this survives process
    restarts, so a replayed refresh token stays rejected across a redeploy
    and revocation (logout / password change) is durable. Every refresh
    token minted by the API gets a row here; the in-memory set in
    ``auth.py`` is kept only as a backstop for tokens minted before this
    table existed.
    """

    __tablename__ = "refresh_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    jti = Column(String(64), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id"), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    predicted_class = Column(String(100), nullable=False)
    confidence = Column(Float, nullable=False)
    all_probabilities = Column(Text, nullable=True)
    gradcam_path = Column(String(512), nullable=True)
    processing_time_ms = Column(Float, nullable=True)
    model_version = Column(String(50), nullable=False)
    model_architecture = Column(String(50), nullable=False)
    is_low_confidence = Column(Boolean, default=False)
    is_high_risk = Column(Boolean, default=False)
    is_flagged = Column(Boolean, default=False)
    flagged_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    flagged_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    scan = relationship("Scan", back_populates="prediction")
    user = relationship("User", back_populates="predictions", foreign_keys=[user_id])

    __table_args__ = (
        Index("ix_predictions_user_created", "user_id", "created_at"),
        Index("ix_predictions_class_confidence", "predicted_class", "confidence"),
    )