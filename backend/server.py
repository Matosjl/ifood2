from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect
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
from typing import List, Optional, Dict, Set
import uuid
from datetime import datetime, timezone, timedelta
import asyncio
import json

import httpx

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

# Evolution API
EVOLUTION_API_URL = os.environ.get('EVOLUTION_API_URL', '')
EVOLUTION_API_KEY = os.environ.get('EVOLUTION_API_KEY', '')
EVOLUTION_INSTANCE = os.environ.get('EVOLUTION_INSTANCE', '')

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

# ── WhatsApp ─────────────────────────────────────────────────────────────────

class WhatsAppOrderItem(BaseModel):
    name: str
    qtd: int
    salePrice: float

class WhatsAppOrderRequest(BaseModel):
    phone: str
    cliente: str
    tipo: str
    itens: List[WhatsAppOrderItem]
    total: float
    pagamento: str
    observacao: Optional[str] = ""
    agendado: Optional[bool] = False
    horarioAgendado: Optional[str] = ""
    restaurante: Optional[str] = "Restaurante"

@api_router.post("/whatsapp/send-order")
async def send_whatsapp_order(body: WhatsAppOrderRequest):
    if not EVOLUTION_API_URL or not EVOLUTION_API_KEY or not EVOLUTION_INSTANCE:
        raise HTTPException(status_code=503, detail="Evolution API não configurada. Verifique o .env.")

    # Formata número: remove tudo que não é dígito, garante DDI 55
    phone_clean = ''.join(filter(str.isdigit, body.phone))
    if not phone_clean.startswith('55'):
        phone_clean = '55' + phone_clean

    # Monta mensagem
    itens_txt = '\n'.join([f'  • {i.qtd}x {i.name} — R$ {(i.salePrice * i.qtd):.2f}' for i in body.itens])
    tipo_txt = '🛵 Entrega' if body.tipo == 'entrega' else '🏪 Retirada'
    agendado_txt = f'\n⏰ Agendado para: {body.horarioAgendado}' if body.agendado and body.horarioAgendado else ''
    obs_txt = f'\n📝 Obs: {body.observacao}' if body.observacao else ''

    mensagem = (
        f'✅ *Pedido Confirmado!*\n'
        f'━━━━━━━━━━━━━━━━━━━━\n'
        f'🏠 *{body.restaurante}*\n\n'
        f'👤 Olá, *{body.cliente}*!\n'
        f'Seu pedido foi recebido com sucesso.\n\n'
        f'🛒 *Itens:*\n{itens_txt}\n\n'
        f'💳 Pagamento: *{body.pagamento}*\n'
        f'📦 Tipo: *{tipo_txt}*{agendado_txt}{obs_txt}\n\n'
        f'💰 *Total: R$ {body.total:.2f}*\n'
        f'━━━━━━━━━━━━━━━━━━━━\n'
        f'Obrigado pela preferência! 🙏'
    )

    url = f"{EVOLUTION_API_URL}/message/sendText/{EVOLUTION_INSTANCE}"
    headers = {"apikey": EVOLUTION_API_KEY, "Content-Type": "application/json"}
    payload = {"number": phone_clean, "text": mensagem}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client_http:
            resp = await client_http.post(url, json=payload, headers=headers)
            if resp.status_code not in (200, 201):
                raise HTTPException(status_code=resp.status_code, detail=f"Evolution API erro: {resp.text}")
            return {"ok": True, "message": "WhatsApp enviado com sucesso.", "to": phone_clean}
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout ao conectar com Evolution API.")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Erro de conexão com Evolution API: {str(e)}")

# ── Estoque ──────────────────────────────────────────────────────────────────

class EstoqueItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    restauranteId: str
    categoria: str
    nome: str
    quantidade: float
    precoCusto: float = 0.0
    precoVenda: float
    porKg: bool = False
    foto: Optional[str] = None
    criadoEm: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class EstoqueItemCreate(BaseModel):
    restauranteId: str
    categoria: str
    nome: str
    quantidade: float
    precoCusto: float = 0.0
    precoVenda: float
    porKg: bool = False
    foto: Optional[str] = None

class EstoqueItemUpdate(BaseModel):
    quantidade: Optional[float] = None
    precoCusto: Optional[float] = None
    precoVenda: Optional[float] = None

@api_router.post("/estoque")
async def criar_item_estoque(body: EstoqueItemCreate):
    item = EstoqueItem(**body.model_dump())
    doc = item.model_dump()
    if await check_mongo():
        await db.estoque.insert_one(doc)
    else:
        _estoque_store.append(doc)
    return item

@api_router.get("/estoque/{restaurante_id}")
async def listar_estoque(restaurante_id: str):
    if await check_mongo():
        docs = await db.estoque.find({"restauranteId": restaurante_id}, {"_id": 0}).to_list(1000)
        return docs
    return [i for i in _estoque_store if i["restauranteId"] == restaurante_id]

@api_router.patch("/estoque/{item_id}")
async def atualizar_item_estoque(item_id: str, body: EstoqueItemUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar.")
    if await check_mongo():
        await db.estoque.update_one({"id": item_id}, {"$set": updates})
    else:
        for i in _estoque_store:
            if i["id"] == item_id:
                i.update(updates)
                break
    return {"ok": True}

@api_router.delete("/estoque/{item_id}")
async def deletar_item_estoque(item_id: str):
    global _estoque_store
    if await check_mongo():
        await db.estoque.delete_one({"id": item_id})
    else:
        _estoque_store = [i for i in _estoque_store if i["id"] != item_id]
    return {"ok": True}

# ── WebSocket Tracking ───────────────────────────────────────────────────────

# Salas: order_id -> set de WebSockets conectados
_tracking_rooms: Dict[str, Set[WebSocket]] = {}

@app.websocket("/ws/track/{order_id}")
async def ws_track(websocket: WebSocket, order_id: str):
    """Clientes se conectam aqui para receber posição do entregador em tempo real."""
    await websocket.accept()
    _tracking_rooms.setdefault(order_id, set()).add(websocket)
    try:
        while True:
            # Mantém conexão viva; entregador envia coords via POST /api/track/{order_id}
            await asyncio.sleep(30)
            await websocket.send_text(json.dumps({"ping": True}))
    except (WebSocketDisconnect, Exception):
        _tracking_rooms.get(order_id, set()).discard(websocket)

class TrackUpdate(BaseModel):
    lat: float
    lng: float
    status: Optional[str] = "O entregador está a caminho"

@api_router.post("/track/{order_id}")
async def push_location(order_id: str, body: TrackUpdate):
    """App do entregador envia coordenadas aqui; broadcast para todos os clientes da sala."""
    payload = json.dumps({"lat": body.lat, "lng": body.lng, "status": body.status})
    room = _tracking_rooms.get(order_id, set())
    dead = set()
    for ws in room:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    room -= dead
    return {"ok": True, "clients": len(room)}

# ── Financeiro ───────────────────────────────────────────────────────────────

class VendaItem(BaseModel):
    name: str
    qtd: int
    salePrice: float
    costPrice: float = 0.0

class VendaCreate(BaseModel):
    numeroPedido: str
    cliente: str
    itens: List[VendaItem]
    total: float
    pagamento: str
    tipo: str
    finalizadoEm: str
    restauranteId: Optional[str] = ""

class CaixaCreate(BaseModel):
    restauranteId: str
    fundo: float
    abertoEm: str
    status: str = "aberto"

class CaixaFechar(BaseModel):
    dinheiro: float = 0
    pix: float = 0
    cartao: float = 0
    totalInformado: float = 0
    totalVendido: float = 0
    liquido: float = 0

@api_router.post("/financeiro/venda")
async def registrar_venda(body: VendaCreate):
    doc = body.model_dump()
    doc["registradoEm"] = datetime.now(timezone.utc).isoformat()
    if await check_mongo():
        await db.vendas.insert_one(doc)
    return {"ok": True}

@api_router.get("/financeiro/vendas/{restaurante_id}/hoje")
async def vendas_hoje(restaurante_id: str):
    hoje = datetime.now(timezone.utc).date().isoformat()
    if await check_mongo():
        docs = await db.vendas.find(
            {"restauranteId": restaurante_id, "finalizadoEm": {"$regex": f"^{hoje}"}},
            {"_id": 0}
        ).to_list(1000)
        return docs
    return []

@api_router.post("/financeiro/caixa")
async def abrir_caixa(body: CaixaCreate):
    doc = body.model_dump()
    if await check_mongo():
        # Fecha qualquer caixa aberto anterior
        await db.caixas.update_many(
            {"restauranteId": body.restauranteId, "status": "aberto"},
            {"$set": {"status": "fechado", "fechadoEm": datetime.now(timezone.utc).isoformat()}}
        )
        await db.caixas.insert_one(doc)
    return {"ok": True, "caixa": doc}

@api_router.get("/financeiro/caixa/{restaurante_id}/hoje")
async def caixa_hoje(restaurante_id: str):
    if await check_mongo():
        doc = await db.caixas.find_one(
            {"restauranteId": restaurante_id, "status": "aberto"},
            {"_id": 0}
        )
        if doc:
            return doc
    return {"status": "fechado"}

@api_router.patch("/financeiro/caixa/{restaurante_id}/fechar")
async def fechar_caixa(restaurante_id: str, body: CaixaFechar):
    updates = {**body.model_dump(), "status": "fechado", "fechadoEm": datetime.now(timezone.utc).isoformat()}
    if await check_mongo():
        await db.caixas.update_one(
            {"restauranteId": restaurante_id, "status": "aberto"},
            {"$set": updates}
        )
    return {"ok": True}

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
