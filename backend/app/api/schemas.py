from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, EmailStr
from enum import Enum


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


class UserResponse(UserBase):
    # Response uses plain str: stored emails (e.g. seeded *.local demo
    # addresses) must never fail serialization. Input validation in
    # UserCreate/UserUpdate still enforces EmailStr.
    email: str
    id: int
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
    refresh_token: str


class ScanStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ScanResponse(BaseModel):
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





class PredictionResponse(BaseModel):
    id: int
    scan_id: int
    predicted_class: str
    confidence: float
    all_probabilities: Dict[str, float]
    gradcam_url: Optional[str] = None
    processing_time_ms: Optional[float] = None
    model_version: str
    model_architecture: str
    is_low_confidence: bool
    is_high_risk: bool
    is_flagged: bool = False
    flagged_by: Optional[int] = None
    flagged_at: Optional[datetime] = None
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


class HealthResponse(BaseModel):
    status: str
    version: str
    model_loaded: bool
    engine: str
    device: str
    model_path: str
    heuristic_fallback_active: bool