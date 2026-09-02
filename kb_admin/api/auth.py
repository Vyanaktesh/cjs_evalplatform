"""
POST /auth/login — the one route in this service that must NOT sit behind
require_admin (you don't have a token yet when logging in). Every other
router is mounted with require_admin as an explicit per-router dependency
in main.py instead of the old app-wide one, specifically so this route can
be excluded.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from kb_admin.core.auth import create_access_token, verify_credentials

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest) -> LoginResponse:
    if not verify_credentials(body.username, body.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    return LoginResponse(access_token=create_access_token(body.username))
