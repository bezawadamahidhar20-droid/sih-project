import secrets
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import logging

from app.core.config import get_settings
from app.core.logging import setup_logging, get_logger
from app.db.session import init_db, close_db
from app.api.routes import auth, scans, predictions, health, model
from app.db.models import UserRole

settings = get_settings()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    
    await init_db()
    logger.info("Database initialized")

    from app.db.seed import seed_demo_users
    await seed_demo_users()
    
    from app.services.model_inference import get_model_service
    get_model_service()
    logger.info("Model service initialized")
    
    yield
    
    await close_db()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI-powered medical image diagnostic tool with Grad-CAM visualization",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# CSRF protection (authentication uses HttpOnly cookies).
#
# Two independent layers, per OWASP guidance:
#   1. Origin check — state-changing requests carrying an ``Origin`` header
#      whose value is not a configured frontend origin are rejected. Cross-
#      site form/fetch attacks always send an attacker Origin.
#   2. Double-submit token — requests authenticated by cookie (no
#      Authorization header) must echo the ``csrf_token`` cookie in the
#      ``X-CSRF-Token`` header. A cross-site attacker cannot read the cookie
#      (same-origin policy) and therefore cannot forge the header.
#
# Requests authenticated with a Bearer header are not cookie-authenticated
# and are exempt — an attacker cannot forge the Authorization header
# cross-site, so there is no CSRF surface there.
# ---------------------------------------------------------------------------
_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
_CSRF_COOKIE = "csrf_token"
_CSRF_HEADER = "X-CSRF-Token"


@app.middleware("http")
async def csrf_protection(request: Request, call_next):
    if request.method in _CSRF_SAFE_METHODS:
        return await call_next(request)

    # Layer 1: origin verification (applies to every state-changing request
    # that carries an Origin header, including login).
    origin = request.headers.get("origin")
    if origin and origin not in settings.cors_origins:
        return JSONResponse(
            status_code=403,
            content={"detail": "CSRF validation failed", "error_code": "CSRF_FAILED"},
        )

    # Layer 2: double-submit token for cookie-authenticated requests.
    # Requests carrying an Authorization header are bearer-authenticated and
    # exempt: a cross-site attacker cannot forge that header, so there is no
    # CSRF surface. Only pure-cookie sessions (the browser SPA) need the
    # double-submit token.
    cookie_authenticated = (
        "access_token" in request.cookies or "refresh_token" in request.cookies
    )
    if not cookie_authenticated or request.headers.get("authorization"):
        return await call_next(request)

    cookie_token = request.cookies.get(_CSRF_COOKIE)
    header_token = request.headers.get(_CSRF_HEADER)
    if (
        not cookie_token
        or not header_token
        or not secrets.compare_digest(cookie_token, header_token)
    ):
        return JSONResponse(
            status_code=403,
            content={"detail": "CSRF validation failed", "error_code": "CSRF_FAILED"},
        )

    return await call_next(request)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    
    # Log the path only — query strings may carry patient identifiers
    # (e.g. ?patient_id=...), which must never land in access logs.
    logger.info(
        "request_completed",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "process_time_ms": process_time,
        }
    )
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Preserve headers the exception carries (e.g. Retry-After on 429) — the
    # default handler would otherwise drop them and clients could not honor
    # the back-off window.
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "error_code": f"HTTP_{exc.status_code}"},
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "error_code": "VALIDATION_ERROR"}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error_code": "INTERNAL_ERROR"}
    )


app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(scans.router, prefix="/api/v1")
app.include_router(predictions.router, prefix="/api/v1")
app.include_router(model.router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "docs": "/docs"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        workers=settings.workers if not settings.debug else 1,
        reload=settings.debug,
        ssl_certfile=settings.ssl_certfile,
        ssl_keyfile=settings.ssl_keyfile,
    )