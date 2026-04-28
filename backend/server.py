from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import jwt
import hashlib
import secrets
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=3000)
db = client[os.environ.get('DB_NAME', 'ifood2')]

# Config
OWNER_PASSWORD = os.environ.get('OWNER_PASSWORD', 'troque_esta_senha_agora')
JWT_SECRET = os.environ.get('JWT_SECRET', 'ajax-jwt-secret')
JWT_EXPIRE_HOURS = 8

# In-memory fallback + login attempts
_memory_store: List[dict] = []
_restaurants_store: List[dict] = []
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

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
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
        raise HTTPException(status_code=429, detail=f"Bloqueado. Tente em {remaining} minuto(s).")

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

# ── Models ────────────────────────────────────────────────────────────────────

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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
    """Gera código de acesso de 8 caracteres alfanumérico maiúsculo."""
    import random, string
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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ── Auth routes ───────────────────────────────────────────────────────────────

@api_router.post("/owner/login")
async def owner_login(body: LoginRequest, request: Request):
    ip = get_client_ip(request)
    check_rate_limit(ip)
    if body.password != OWNER_PASSWORD:
        register_failed_attempt(ip)
        entry = _login_attempts.get(ip, {"count": 0})
        remaining = 3 - entry["count"]
        raise HTTPException(status_code=401, detail=f"Senha incorreta. {remaining} tentativa(s) restante(s).")
    clear_attempts(ip)
    return {"token": create_token(), "expires_in": f"{JWT_EXPIRE_HOURS}h"}

@api_router.post("/owner/recovery/request")
async def request_recovery(request: Request):
    """Gera token de recuperação — em produção enviaria por email/SMS."""
    token = secrets.token_urlsafe(32)
    _recovery_tokens[token] = datetime.now(timezone.utc) + timedelta(minutes=30)
    # Em produção: enviar por email. Por ora retorna o token direto (só para dev).
    return {
        "message": "Token de recuperação gerado. Em produção seria enviado ao seu email/SMS.",
        "token": token,
        "expires_in": "30 minutos",
        "hint": "Configure RECOVERY_EMAIL no .env para receber por email em produção."
    }

@api_router.post("/owner/recovery/reset")
async def reset_password(body: ResetPasswordRequest):
    token_expiry = _recovery_tokens.get(body.token)
    if not token_expiry:
        raise HTTPException(status_code=400, detail="Token inválido.")
    if datetime.now(timezone.utc) > token_expiry:
        _recovery_tokens.pop(body.token, None)
        raise HTTPException(status_code=400, detail="Token expirado. Solicite um novo.")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Senha deve ter no mínimo 8 caracteres.")
    # Em produção: salvar hash no banco. Aqui atualizamos em memória para dev.
    global OWNER_PASSWORD
    OWNER_PASSWORD = body.new_password
    _recovery_tokens.pop(body.token, None)
    return {"message": "Senha alterada com sucesso. Atualize o .env com a nova senha."}

# ── Restaurant routes ─────────────────────────────────────────────────────────

@api_router.get("/owner/restaurants", dependencies=[Depends(verify_token)])
async def list_restaurants():
    if await check_mongo():
        docs = await db.restaurants.find({}, {"_id": 0}).to_list(1000)
        return docs
    return _restaurants_store

@api_router.post("/owner/restaurants", dependencies=[Depends(verify_token)])
async def create_restaurant(body: RestaurantCreate):
    restaurant = Restaurant(**body.model_dump())
    doc = restaurant.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    if await check_mongo():
        await db.restaurants.insert_one(doc)
    else:
        _restaurants_store.append(doc)
    return restaurant

@api_router.get("/owner/restaurants/{restaurant_id}", dependencies=[Depends(verify_token)])
async def get_restaurant(restaurant_id: str):
    if await check_mongo():
        doc = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    else:
        doc = next((r for r in _restaurants_store if r["id"] == restaurant_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Restaurante não encontrado.")
    return doc

@api_router.patch("/owner/restaurants/{restaurant_id}", dependencies=[Depends(verify_token)])
async def update_restaurant(restaurant_id: str, body: RestaurantUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar.")
    if await check_mongo():
        result = await db.restaurants.update_one({"id": restaurant_id}, {"$set": updates})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Restaurante não encontrado.")
        return await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    else:
        for i, r in enumerate(_restaurants_store):
            if r["id"] == restaurant_id:
                _restaurants_store[i].update(updates)
                return _restaurants_store[i]
        raise HTTPException(status_code=404, detail="Restaurante não encontrado.")

@api_router.post("/owner/restaurants/{restaurant_id}/regen-code", dependencies=[Depends(verify_token)])
async def regen_access_code(restaurant_id: str):
    """Gera novo código de acesso para o restaurante."""
    new_code = generate_access_code()
    if await check_mongo():
        result = await db.restaurants.update_one({"id": restaurant_id}, {"$set": {"access_code": new_code}})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Restaurante não encontrado.")
    else:
        found = False
        for r in _restaurants_store:
            if r["id"] == restaurant_id:
                r["access_code"] = new_code
                found = True
                break
        if not found:
            raise HTTPException(status_code=404, detail="Restaurante não encontrado.")
    return {"access_code": new_code}

@api_router.delete("/owner/restaurants/{restaurant_id}", dependencies=[Depends(verify_token)])
async def delete_restaurant(restaurant_id: str):
    if await check_mongo():
        result = await db.restaurants.delete_one({"id": restaurant_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Restaurante não encontrado.")
    else:
        global _restaurants_store
        _restaurants_store = [r for r in _restaurants_store if r["id"] != restaurant_id]
    return {"message": "Restaurante removido."}

@api_router.get("/owner/summary", dependencies=[Depends(verify_token)])
async def owner_summary():
    """Resumo financeiro geral."""
    if await check_mongo():
        restaurants = await db.restaurants.find({}, {"_id": 0}).to_list(1000)
    else:
        restaurants = _restaurants_store
    active = [r for r in restaurants if r.get("status") == "active"]
    total_mrr = sum(r.get("plan_value", 80) for r in active)
    total_earned = sum(r.get("plan_value", 80) * r.get("months_paid", 0) for r in restaurants)
    return {
        "total_restaurants": len(restaurants),
        "active": len(active),
        "inactive": len(restaurants) - len(active),
        "mrr": total_mrr,
        "total_earned": total_earned,
    }

# ── General routes ────────────────────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status")
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.model_dump())
    if await check_mongo():
        doc = status_obj.model_dump()
        doc['timestamp'] = doc['timestamp'].isoformat()
        await db.status_checks.insert_one(doc)
    else:
        _memory_store.append(status_obj.model_dump())
    return status_obj

@api_router.get("/status")
async def get_status_checks():
    if await check_mongo():
        checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
        for c in checks:
            if isinstance(c['timestamp'], str):
                c['timestamp'] = datetime.fromisoformat(c['timestamp'])
        return checks
    return _memory_store

@api_router.get("/health")
async def health_check():
    mongo_ok = await check_mongo()
    return {"status": "ok", "mongo": mongo_ok, "store": "mongodb" if mongo_ok else "memory"}

# ── Seed data (dev only) ──────────────────────────────────────────────────────

@app.on_event("startup")
async def seed_dev_data():
    """Insere restaurante de teste se não existir."""
    if not await check_mongo():
        if not _restaurants_store:
            _restaurants_store.append({
                "id": str(uuid.uuid4()),
                "name": "Restaurante Teste",
                "representative": "João Silva",
                "phone": "(11) 99999-0001",
                "plan_value": 80.0,
                "months_paid": 3,
                "status": "active",
                "notes": "Cliente de teste gerado automaticamente.",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    else:
        existing = await db.restaurants.count_documents({})
        if existing == 0:
            await db.restaurants.insert_one({
                "id": str(uuid.uuid4()),
                "name": "Restaurante Teste",
                "representative": "João Silva",
                "phone": "(11) 99999-0001",
                "plan_value": 80.0,
                "months_paid": 3,
                "status": "active",
                "notes": "Cliente de teste gerado automaticamente.",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
