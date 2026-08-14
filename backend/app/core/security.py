import base64
import uuid
from datetime import timedelta
from typing import Optional, Dict, Any

import bcrypt
from jose import jwt, JWTError
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from app.core.config import get_settings
from app.core.timeutil import utcnow_aware

settings = get_settings()

_kdf = PBKDF2HMAC(
    algorithm=hashes.SHA256(),
    length=32,
    salt=settings.encryption_salt.encode(),
    iterations=100000,
)
_key = base64.urlsafe_b64encode(_kdf.derive(settings.encryption_key.encode()))
_cipher = Fernet(_key)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except (ValueError, TypeError):
        return False


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt(rounds=12)
    ).decode("utf-8")


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = utcnow_aware() + expires_delta
    else:
        expire = utcnow_aware() + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    # jti enables refresh-token rotation (one-time use); ``ver`` ties the token
    # to the user's token_version so password/role changes can revoke it.
    to_encode.update({"exp": expire, "type": "access", "jti": uuid.uuid4().hex})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(data: Dict[str, Any]) -> str:
    """Create a refresh token; returns only the encoded JWT.

    Prefer :func:`create_refresh_token_with_jti` when the caller needs the
    token's ``jti`` (e.g. to persist a DB-backed refresh session).
    """
    token, _ = create_refresh_token_with_jti(data)
    return token


def create_refresh_token_with_jti(data: Dict[str, Any]) -> tuple[str, str]:
    """Create a refresh token and return ``(token, jti)`` so callers can
    record the one-time-use ``jti`` in durable storage (``RefreshSession``)."""
    to_encode = data.copy()
    expire = utcnow_aware() + timedelta(days=settings.jwt_refresh_token_expire_days)
    jti = uuid.uuid4().hex
    to_encode.update({"exp": expire, "type": "refresh", "jti": jti})
    return (
        jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm),
        jti,
    )


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError:
        return None


def encrypt_data(data: bytes) -> bytes:
    return _cipher.encrypt(data)


def decrypt_data(encrypted_data: bytes) -> bytes:
    return _cipher.decrypt(encrypted_data)


def encrypt_file(file_path: str, output_path: str) -> None:
    with open(file_path, "rb") as f:
        data = f.read()
    encrypted = encrypt_data(data)
    with open(output_path, "wb") as f:
        f.write(encrypted)


def decrypt_file(encrypted_path: str, output_path: str) -> None:
    with open(encrypted_path, "rb") as f:
        encrypted = f.read()
    decrypted = decrypt_data(encrypted)
    with open(output_path, "wb") as f:
        f.write(decrypted)


def generate_file_hash(file_path: str) -> str:
    import hashlib
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hasher.update(chunk)
    return hasher.hexdigest()