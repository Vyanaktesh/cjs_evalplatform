"""
Placeholder staff auth for the KB Admin & Evaluation Service.

TODO: replace with real per-staff auth once login method is decided
(options: individual username/password per staff member, or Google/
Microsoft SSO). For now this is still a single shared admin username/
password pair from environment variables — POST /auth/login checks it
once and issues a signed, short-lived JWT, which every other route then
verifies via require_admin as a global FastAPI dependency (see main.py).

This replaces the original HTTP Basic Auth design, which sent the raw
username/password on every single request. A JWT is issued once at
login and expires on its own (settings.jwt_expiry_hours) — the browser
never needs to hold the actual password past that one request.
"""

import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from kb_admin.core.config import get_settings

JWT_ALGORITHM = "HS256"

_bearer = HTTPBearer(auto_error=False)


def create_access_token(username: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=JWT_ALGORITHM)


def verify_credentials(username: str, password: str) -> bool:
    settings = get_settings()
    correct_username = secrets.compare_digest(username, settings.admin_username)
    correct_password = secrets.compare_digest(password, settings.admin_password)
    return correct_username and correct_password


def require_admin(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired session — please sign in again",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None:
        raise unauthorized

    settings = get_settings()
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret_key, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise unauthorized

    username = payload.get("sub")
    if not isinstance(username, str):
        raise unauthorized
    return username
