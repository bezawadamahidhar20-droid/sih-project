import logging
import json
import os
import sys
from logging.handlers import RotatingFileHandler
from typing import Dict, Any, Optional
from pythonjsonlogger import jsonlogger
from app.core.config import get_settings
from app.core.timeutil import utcnow_aware

settings = get_settings()


class CustomJsonFormatter(jsonlogger.JsonFormatter):
    def add_fields(self, log_record: Dict[str, Any], record: logging.LogRecord, message_dict: Dict[str, Any]) -> None:
        super().add_fields(log_record, record, message_dict)
        log_record["timestamp"] = utcnow_aware().isoformat()
        log_record["level"] = record.levelname
        log_record["logger"] = record.name
        log_record["service"] = settings.app_name


def setup_logging() -> None:
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)
    
    handler = logging.StreamHandler(sys.stdout)
    
    if settings.log_format == "json":
        formatter = CustomJsonFormatter(
            "%(timestamp)s %(level)s %(logger)s %(message)s"
        )
    else:
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
    
    handler.setFormatter(formatter)
    
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers = [handler]
    
    logging.getLogger("uvicorn").setLevel(log_level)
    logging.getLogger("uvicorn.access").setLevel(log_level)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    # The dedicated "audit" logger also persists structured events to
    # AUDIT_LOG_PATH (rotating file) in addition to stdout. Never contains PHI.
    if settings.audit_log_path:
        try:
            os.makedirs(os.path.dirname(settings.audit_log_path), exist_ok=True)
            audit_handler = RotatingFileHandler(
                settings.audit_log_path,
                maxBytes=10 * 1024 * 1024,
                backupCount=5,
                encoding="utf-8",
            )
            audit_handler.setFormatter(formatter)
            audit_logger = logging.getLogger("audit")
            audit_logger.setLevel(log_level)
            audit_logger.handlers = [audit_handler]
            # Keep propagation so audit events also reach the root stdout
            # handler (container logs), while the file handler owns the file.
            audit_logger.propagate = True
        except OSError as exc:
            logging.getLogger(__name__).warning(
                "Could not open audit log file %s: %s", settings.audit_log_path, exc
            )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


class AuditLogger:
    def __init__(self, logger: logging.Logger):
        self.logger = logger
    
    def log_prediction(
        self,
        user_id: str,
        user_role: str,
        file_hash: str,
        prediction: str,
        confidence: float,
        processing_time_ms: float,
        model_version: str,
        anonymized_patient_id: Optional[str] = None
    ) -> None:
        self.logger.info(
            "prediction_made",
            extra={
                "event_type": "prediction",
                "user_id": user_id,
                "user_role": user_role,
                "file_hash": file_hash,
                "prediction": prediction,
                "confidence": confidence,
                "processing_time_ms": processing_time_ms,
                "model_version": model_version,
                "anonymized_patient_id": anonymized_patient_id,
            }
        )
    
    def log_upload(
        self,
        user_id: str,
        user_role: str,
        file_hash: str,
        file_extension: str,
        file_size: int,
        mime_type: str
    ) -> None:
        # Only the sanitized file EXTENSION is logged, never the client-supplied
        # filename: a filename like ``John_Doe_chest_xray.png`` can embed PHI,
        # and audit logs must stay PHI-free (DICOM patient identifiers are
        # also stripped upstream).
        self.logger.info(
            "file_uploaded",
            extra={
                "event_type": "upload",
                "user_id": user_id,
                "user_role": user_role,
                "file_hash": file_hash,
                "file_extension": file_extension,
                "file_size": file_size,
                "mime_type": mime_type,
            }
        )
    
    def log_auth(
        self,
        event_type: str,
        user_id: Optional[str] = None,
        username: Optional[str] = None,
        success: bool = True,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> None:
        self.logger.info(
            f"auth_{event_type}",
            extra={
                "event_type": f"auth_{event_type}",
                "user_id": user_id,
                "username": username,
                "success": success,
                "ip_address": ip_address,
                "user_agent": user_agent,
            }
        )
    
    def log_error(
        self,
        user_id: Optional[str],
        error_type: str,
        error_message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        self.logger.error(
            "application_error",
            extra={
                "event_type": "error",
                "user_id": user_id,
                "error_type": error_type,
                "error_message": error_message,
                "context": context or {},
            }
        )


audit_logger = AuditLogger(get_logger("audit"))