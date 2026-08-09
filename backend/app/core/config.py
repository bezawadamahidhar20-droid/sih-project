from functools import lru_cache
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    app_name: str = "MediScan AI"
    app_version: str = "1.0.0"
    debug: bool = False
    environment: str = "production"

    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 4

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

    low_confidence_threshold: float = 0.7
    high_risk_threshold: float = 0.9

    seed_demo_users: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()