"""Client-IP extraction that honors a trusted reverse proxy (nginx)."""

from fastapi import Request

from app.core.config import get_settings


def client_ip(request: Request) -> str:
    """Return the untrusted client's IP as seen by the reverse proxy.

    When ``TRUST_PROXY_HEADERS=true`` (deployed behind nginx) the LAST entry
    of ``X-Forwarded-For`` is used: nginx appends the direct peer, so the last
    entry is the real client across a single proxy hop, while leading entries
    are attacker-controlled. When the flag is off (API directly reachable,
    e.g. local dev) the header is ignored entirely — otherwise a client could
    spoof it and bypass the login lockout / rate limiters.
    """
    if get_settings().trust_proxy_headers:
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            parts = [p.strip() for p in xff.split(",") if p.strip()]
            if parts:
                return parts[-1]
    return request.client.host if request.client else "unknown"
