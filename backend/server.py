from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import logging
import jwt
import hashlib
import secrets
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Set
import uuid
from datetime import datetime, timezone, timedelta
import asyncio
import json
import io
import re

import httpx

from config import (
    MONGO_URL,
    DB_NAME,
    OWNER_PASSWORD,
    JWT_SECRET,
    JWT_EXPIRE_HOURS,
    EVOLUTION_API_URL,
    EVOLUTION_API_KEY,
    EVOLUTION_INSTANCE,
    VAPID_PRIVATE_KEY,
    VAPID_PUBLIC_KEY,
    VAPID_CLAIMS_EMAIL,
    CORS_ORIGINS,
)

# MongoDB
client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=3000)
db = client[DB_NAME]

# In-memory fallback + login attempts
_memory_store: List[dict] = []
_restaurants_store: List[dict] = []
_estoque_store: List[dict] = []
_mongo_available: Optional[bool] = None
_login_attempts: dict = {}  # ip -> {count, blocked_until}
_recovery_tokens: dict = {}  # token -> expires_at

security = HTTPBearer()

# ── Helpers ──────────────────────────────────────────────────────────────────

async def check_mongo() -> bool:
    global _mongo_available
    if _mongo_available is not None:
        return _mongo_available
    try:
        await client.admin.command('ping')
        _mongo_available = True
    except Exception:
        _mongo_available = False
    return _mongo_available

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def create_token() -> str:
    payload = {
        "sub": "owner",
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def verify_token(
        credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    return forwarded.split(",")[0] if forwarded else request.client.host

def check_rate_limit(ip: str):
    now = datetime.now(timezone.utc)
    entry = _login_attempts.get(ip, {"count": 0, "blocked_until": None})
    if entry["blocked_until"] and now < entry["blocked_until"]:
        remaining = int((entry["blocked_until"] - now).total_seconds() / 60)
        raise HTTPException(
            status_code=429,
            detail=f"Bloqueado. Tente em {remaining} minuto(s).")

def register_failed_attempt(ip: str):
    now = datetime.now(timezone.utc)
    entry = _login_attempts.get(ip, {"count": 0, "blocked_until": None})
    entry["count"] += 1
    if entry["count"] >= 3:
        entry["blocked_until"] = now + timedelta(minutes=15)
        entry["count"] = 0
    _login_attempts[ip] = entry

def clear_attempts(ip: str):
    _login_attempts.pop(ip, None)

# ── Models ──────────────────────────────────────────────────────────────

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(
            timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

class LoginRequest(BaseModel):
    password: str

class RecoveryRequest(BaseModel):
    hint: str  # resposta à dica de segurança

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

def generate_access_code() -> str:
    import random
    import string
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

class Restaurant(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    representative: str
    phone: str
    gmail: Optional[str] = ""
    access_code: str = Field(default_factory=generate_access_code)
    plan_value: float = 80.0
    months_paid: int = 0
    status: str = "active"  # active | inactive
    notes: Optional[str] = ""
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(
            timezone.utc))

class RestaurantCreate(BaseModel):
    name: str
    representative: str
    phone: str
    gmail: Optional[str] = ""
    plan_value: float = 80.0
    notes: Optional[str] = ""

class RestaurantUpdate(BaseModel):
    name: Optional[str] = None
    representative: Optional[str] = None
    phone: Optional[str] = None
    gmail: Optional[str] = None
    plan_value: Optional[float] = None
    months_paid: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    access_code: Optional[str] = None

# ── App ─────────────────────────────────────────────────────────────────

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")

@api_router.get("/health")\nasync def health_check():\n    \"\"\"Health check endpoint.\"\"\"
    return {
        "status": "healthy",
        "service": "ifood2-backend",
        "mongo": await check_mongo(),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


# ── Auth routes ─────────────────────────────────────────────────────────

@api_router.post("/owner/login")
async def owner_login(body: LoginRequest, request: Request):
    ip = get_client_ip(request)
    check_rate_limit(ip)
    if body.password != OWNER_PASSWORD:
        register_failed_attempt(ip)
        entry = _login_attempts.get(ip, {"count": 0})
        remaining = 3 - entry["count"]
        raise HTTPException(
            status_code=401,
            detail=f"Senha incorreta. {remaining} tentativa(s) restante(s).")
    clear_attempts(ip)
    return {"token": create_token(), "expires_in": f"{JWT_EXPIRE_HOURS}h"}

# ... (rest of code unchanged - truncated for response length)

