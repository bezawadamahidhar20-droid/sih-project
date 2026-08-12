from functools import lru_cache
from pathlib import Path
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator


class Settings(BaseSettings):
    app_name: str = "MediScan AI"
    app_version: str = "1.0.0"
    debug: bool = False
    environment: str = "production"

    host: str = "0.0.0.0"
    port: int = 8000
    # Single worker: the in-process rate limiters, login brute-force store,
    # refresh-token rotation set, and the ModelService singleton all assume
    # exactly one process (see also the backend Dockerfile).
    workers: int = 1

    jwt_secret_key: str = Field(..., min_length=32)
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    encryption_key: str = Field(..., min_length=32)
    encryption_salt: str = Field(..., min_length=16)

    database_url: str
    database_pool_size: int = 10
    database_max_overflow: int = 20

    redis_url: str = "redis://localhost:6379/0"

    model_path: str = "/app/models/model.pth"
    model_architecture: str = "resnet50"
    model_num_classes: int = 2
    model_input_size: int = 224
    model_classes: List[str] = ["Normal", "Pneumonia"]
    gradcam_target_layer: str = "layer4"

    upload_dir: str = "/app/uploads"
    max_file_size_mb: int = 50
    allowed_extensions: List[str] = [".jpg", ".jpeg", ".png", ".dcm", ".dicom"]

    ssl_certfile: Optional[str] = None
    ssl_keyfile: Optional[str] = None

    log_level: str = "INFO"
    log_format: str = "json"
    audit_log_path: str = "/app/logs/audit.log"

    # Vite dev server (5173) proxies /api to the backend, but direct-origin
    # access (VITE_API_URL override) must also be allowed.
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    external_inference_url: Optional[str] = None
    external_inference_api_key: Optional[str] = None
    use_external_inference: bool = False

    # Production safety: when the trained CNN model file is missing or fails
    # to load, the inference service FAILS LOUDLY (RuntimeError -> HTTP 500)
    # instead of silently serving hand-written heuristic guesses. Set to true
    # ONLY for demos/dev where the deterministic baseline engine is acceptable.
    allow_heuristic_fallback: bool = False

    low_confidence_threshold: float = 0.7
    high_risk_threshold: float = 0.9

    # Decision boundary for the abnormal class in binary (2-class) prediction.
    # The CNN is trained with class imbalance (pneumonia overrepresented) and
    # argmax@0.5 over-predicts the abnormal class out-of-distribution (real-
    # world normals get flagged). Raising the threshold (e.g. 0.8) keeps
    # sensitivity high while sharply cutting false positives. Ignored for
    # >2-class models, where argmax is the only sensible rule.
    model_decision_threshold: float = 0.5

    # Per-user sliding-window budgets for expensive endpoints (429 beyond).
    upload_rate_limit_per_minute: int = 30
    predict_rate_limit_per_minute: int = 30

    # Set true when the backend sits behind the nginx reverse proxy (docker
    # compose does). Enables trusting X-Forwarded-For when keying the login
    # lockout / rate limiters. Keep false when the API is directly reachable
    # (local dev), otherwise a client can spoof the header and bypass the
    # limits.
    trust_proxy_headers: bool = False

    seed_demo_users: bool = False

    # Fail fast in production: refuse placeholder secrets so a misconfigured
    # deployment can never start with forgeable JWTs / decryptable data.
    _PLACEHOLDER_MARKERS = ("change-me", "changeme", "change_me")

    @model_validator(mode="after")
    def _reject_placeholder_secrets_in_production(self) -> "Settings":
        if self.environment.lower() == "production":
            for name in ("jwt_secret_key", "encryption_key", "encryption_salt"):
                value = getattr(self, name) or ""
                lowered = value.lower()
                if any(m in lowered for m in self._PLACEHOLDER_MARKERS):
                    raise ValueError(
                        f"{name.upper()} is set to a placeholder value while "
                        "ENVIRONMENT=production. Generate strong secrets and "
                        "provide them via environment variables — never ship "
                        "well-known credentials to production."
                    )
        return self

    @model_validator(mode="after")
    def _absolutize_relative_paths(self) -> "Settings":
        """Resolve relative file paths against the backend package root.

        ``UPLOAD_DIR`` / ``AUDIT_LOG_PATH`` / ``MODEL_PATH`` may be configured
        relative to the backend directory (local dev). Resolving them here
        keeps them stable regardless of the process working directory, so
        stored DB paths (``encrypted_path``, ``gradcam_path``) can never break
        if the server is later started from a different directory.
        """
        backend_root = Path(__file__).resolve().parent.parent.parent
        for name in ("model_path", "upload_dir", "audit_log_path"):
            value = getattr(self, name)
            if value and not Path(value).is_absolute():
                setattr(self, name, str((backend_root / value).resolve()))
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()