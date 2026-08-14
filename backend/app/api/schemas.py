from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, EmailStr, field_serializer
from enum import Enum


class _UtcOffsetSerialization(BaseModel):
    """Serialize naive-UTC datetimes with an explicit ``+00:00`` offset.

    The backend stores naive UTC (SQLite round-trip safety); without an
    offset the frontend's ``new Date(...)`` misinterprets them as *local*
    time, shifting every displayed timestamp (and even the calendar day of
    ``study_date`` in negative-offset zones).
    """

    @field_serializer("*")
    def _attach_utc_offset(self, value, _info):
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class UserRole(str, Enum):
    DOCTOR = "doctor"
    RADIOLOGIST = "radiologist"
    STAFF = "staff"


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    full_name: Optional[str] = None
    role: UserRole = UserRole.STAFF


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)


class UserUpdate(BaseModel):
    """Admin user update (doctor/radiologist acting on another user)."""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None

    model_config = ConfigDict(extra="forbid")


class UserSelfUpdate(BaseModel):
    """Fields a user may change on their OWN account.

    Deliberately excludes ``role`` / ``is_active`` — those are privileged
    and only changeable by doctor/radiologist via ``PATCH /auth/users/{id}``.
    Unknown fields are rejected outright so a stray ``role`` in a request body
    fails loudly instead of being silently applied.
    """
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)


class UserResponse(_UtcOffsetSerialization, BaseModel):
    # Response uses plain str: stored emails (e.g. seeded demo addresses)
    # must never fail serialization. Input validation in UserCreate/UserUpdate
    # still enforces EmailStr.
    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    role: UserRole = UserRole.STAFF
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
    exp: int
    type: str
    role: str


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshTokenRequest(BaseModel):
    # Optional: the browser SPA refreshes via the HttpOnly refresh_token
    # cookie (JavaScript cannot read it), so the body token is only used by
    # programmatic clients / tests.
    refresh_token: Optional[str] = None


class LogoutRequest(BaseModel):
    """Body for POST /auth/logout. The refresh token is optional: if present
    it is revoked server-side; the client clears local state either way."""
    refresh_token: Optional[str] = None


class ScanStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ScanResponse(_UtcOffsetSerialization, BaseModel):
    id: int
    file_hash: str
    original_filename: str
    file_size: int
    mime_type: str
    anonymized_patient_id: Optional[str] = None
    study_date: Optional[datetime] = None
    modality: Optional[str] = None
    body_part: Optional[str] = None
    status: ScanStatus
    uploaded_by: int
    created_at: datetime
    processed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)





class PredictionResponse(_UtcOffsetSerialization, BaseModel):
    id: int
    scan_id: int
    predicted_class: str
    confidence: float
    all_probabilities: Dict[str, float]
    findings: List[Dict[str, Any]] = []
    has_significant_findings: bool = True
    condition_heatmaps: Optional[Dict[str, str]] = None
    explanation: Optional[str] = None
    gradcam_url: Optional[str] = None
    processing_time_ms: Optional[float] = None
    model_version: str
    model_architecture: str
    is_low_confidence: bool
    is_high_risk: bool
    is_flagged: bool = False
    flagged_by: Optional[int] = None
    flagged_at: Optional[datetime] = None
    # Calibrated decision boundary in effect when this prediction was made
    # (surfaced for clinical transparency; 0.5 = plain argmax).
    model_decision_threshold: Optional[float] = None
    scan: Optional["ScanResponse"] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FlagPredictionRequest(BaseModel):
    flagged: bool


class PredictResponse(BaseModel):
    prediction: PredictionResponse
    scan: ScanResponse
    original_image_url: str
    gradcam_overlay_url: str
    warning: Optional[str] = None


class ScanListResponse(BaseModel):
    scans: List[ScanResponse]
    total: int
    page: int
    page_size: int


class PredictionListResponse(BaseModel):
    predictions: List[PredictionResponse]
    total: int
    page: int
    page_size: int


class ErrorResponse(BaseModel):
    detail: str
    error_code: Optional[str] = None


class ModelMetrics(BaseModel):
    """Hold-out validation metrics from ``<model>.evaluation.json``."""
    num_samples: Optional[int] = None
    accuracy: Optional[float] = None
    balanced_accuracy: Optional[float] = None
    sensitivity: Optional[float] = None
    specificity: Optional[float] = None
    precision: Optional[float] = None
    auc: Optional[float] = None
    class_names: List[str] = []


class HealthResponse(BaseModel):
    status: str
    version: str
    model_loaded: bool
    engine: str
    device: str
    heuristic_fallback_active: bool
    # Calibrated decision boundary for the abnormal class (0.5 = plain
    # argmax). Surfaced so the UI can explain WHY an image was called normal
    # vs. abnormal at a given probability.
    model_decision_threshold: Optional[float] = None
    # Real hold-out validation metrics when a trained CNN is loaded.
    model_metrics: Optional[ModelMetrics] = None