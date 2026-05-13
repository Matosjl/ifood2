"""
auth.py — JWT authentication utilities for ZapFome
---------------------------------------------------
• create_access_token  — gera JWT signed com HS256
• decode_token         — valida e decodifica JWT
• require_auth         — FastAPI Depends que extrai Bearer JWT do header
• hash_password        — bcrypt hash
• verify_password      — bcrypt compare
"""
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext

# ── Config ─────────────────────────────────────────────────────────────────────
_raw_secret = os.environ.get("JWT_SECRET", "").strip()
JWT_SECRET: str = _raw_secret if _raw_secret else secrets.token_urlsafe(40)
if not _raw_secret:
    import logging
    logging.getLogger(__name__).warning(
        "JWT_SECRET não definido no .env — usando segredo temporário. "
        "Todos os tokens expirarão ao reiniciar o servidor."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
_bearer = HTTPBearer(auto_error=False)

# ── Password helpers ───────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Retorna bcrypt hash da senha."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Compara senha plain-text com hash bcrypt."""
    return pwd_context.verify(plain, hashed)


# ── Token helpers ──────────────────────────────────────────────────────────────

def create_access_token(subject: str, extra: Optional[dict] = None) -> str:
    """
    Cria JWT com `sub` = subject, expiração em ACCESS_TOKEN_EXPIRE_DAYS dias.
    `extra` adiciona claims adicionais ao payload.
    """
    now = datetime.now(timezone.utc)
    payload: dict = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """
    Decodifica e valida JWT.
    Lança HTTP 401 se inválido ou expirado.
    """
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ── FastAPI Dependency ─────────────────────────────────────────────────────────

def require_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """
    Dependency para rotas protegidas.
    Extrai e valida Bearer JWT do header Authorization.

    Uso:
        @router.get("/endpoint")
        async def handler(_auth: dict = Depends(require_auth)):
            ...
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação ausente. Faça login em /api/auth/login",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(credentials.credentials)
