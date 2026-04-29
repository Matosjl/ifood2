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
    """Gera código de acesso de 8 caracteres alfanumérico maiúsculo."""
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
api_router = APIRouter(prefix="/api")

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


@api_router.post("/owner/recovery/request")
async def request_recovery(request: Request):
    """Gera token de recuperação — em produção enviaria por email/SMS."""
    token = secrets.token_urlsafe(32)
    _recovery_tokens[token] = datetime.now(
        timezone.utc) + timedelta(minutes=30)
    # Em produção: enviar por email. Por ora retorna o token direto (só para
    # dev).
    return {
        "message": "Token de recuperação gerado. Em produção seria enviado ao seu email/SMS.",
        "token": token,
        "expires_in": "30 minutos",
        "hint": "Configure RECOVERY_EMAIL no .env para receber por email em produção."}


@api_router.post("/owner/recovery/reset")
async def reset_password(body: ResetPasswordRequest):
    token_expiry = _recovery_tokens.get(body.token)
    if not token_expiry:
        raise HTTPException(status_code=400, detail="Token inválido.")
    if datetime.now(timezone.utc) > token_expiry:
        _recovery_tokens.pop(body.token, None)
        raise HTTPException(status_code=400,
                            detail="Token expirado. Solicite um novo.")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400,
                            detail="Senha deve ter no mínimo 8 caracteres.")
    # Em produção: salvar hash no banco. Aqui atualizamos em memória para dev.
    global OWNER_PASSWORD
    OWNER_PASSWORD = body.new_password
    _recovery_tokens.pop(body.token, None)
    return {"message": "Senha alterada com sucesso. Atualize o .env com a nova senha."}

# ── Restaurant routes ───────────────────────────────────────────────────


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


@api_router.get("/owner/restaurants/{restaurant_id}",
                dependencies=[Depends(verify_token)])
async def get_restaurant(restaurant_id: str):
    if await check_mongo():
        doc = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    else:
        doc = next(
            (r for r in _restaurants_store if r["id"] == restaurant_id),
            None)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Restaurante não encontrado.")
    return doc


@api_router.patch("/owner/restaurants/{restaurant_id}",
                  dependencies=[Depends(verify_token)])
async def update_restaurant(restaurant_id: str, body: RestaurantUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(
            status_code=400,
            detail="Nenhum campo para atualizar.")
    if await check_mongo():
        result = await db.restaurants.update_one({"id": restaurant_id}, {"$set": updates})
        if result.matched_count == 0:
            raise HTTPException(
                status_code=404,
                detail="Restaurante não encontrado.")
        return await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    else:
        for i, r in enumerate(_restaurants_store):
            if r["id"] == restaurant_id:
                _restaurants_store[i].update(updates)
                return _restaurants_store[i]
        raise HTTPException(
            status_code=404,
            detail="Restaurante não encontrado.")


@api_router.post("/owner/restaurants/{restaurant_id}/regen-code",
                 dependencies=[Depends(verify_token)])
async def regen_access_code(restaurant_id: str):
    """Gera novo código de acesso para o restaurante."""
    new_code = generate_access_code()
    if await check_mongo():
        result = await db.restaurants.update_one({"id": restaurant_id}, {"$set": {"access_code": new_code}})
        if result.matched_count == 0:
            raise HTTPException(
                status_code=404,
                detail="Restaurante não encontrado.")
    else:
        found = False
        for r in _restaurants_store:
            if r["id"] == restaurant_id:
                r["access_code"] = new_code
                found = True
                break
        if not found:
            raise HTTPException(
                status_code=404,
                detail="Restaurante não encontrado.")
    return {"access_code": new_code}


@api_router.delete("/owner/restaurants/{restaurant_id}",
                   dependencies=[Depends(verify_token)])
async def delete_restaurant(restaurant_id: str):
    if await check_mongo():
        result = await db.restaurants.delete_one({"id": restaurant_id})
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=404,
                detail="Restaurante não encontrado.")
    else:
        global _restaurants_store
        _restaurants_store = [
            r for r in _restaurants_store if r["id"] != restaurant_id]
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
    total_earned = sum(r.get("plan_value", 80) *
                       r.get("months_paid", 0) for r in restaurants)
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
        raise HTTPException(
            status_code=503,
            detail="Evolution API não configurada. Verifique o .env.")

    # Formata número: remove tudo que não é dígito, garante DDI 55
    phone_clean = ''.join(filter(str.isdigit, body.phone))
    if not phone_clean.startswith('55'):
        phone_clean = '55' + phone_clean

    # Monta mensagem
    itens_txt = '\n'.join(
        [f'  • {i.qtd}x {i.name} — R$ {(i.salePrice * i.qtd):.2f}' for i in body.itens])
    tipo_txt = '🛵 Entrega' if body.tipo == 'entrega' else '🏪 Retirada'
    agendado_txt = f'\n⏰ Agendado para: {
        body.horarioAgendado}' if body.agendado and body.horarioAgendado else ''
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
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=f"Evolution API erro: {
                        resp.text}")
            return {
                "ok": True,
                "message": "WhatsApp enviado com sucesso.",
                "to": phone_clean}
    except httpx.TimeoutException:
        raise HTTPException(status_code=504,
                            detail="Timeout ao conectar com Evolution API.")
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Erro de conexão com Evolution API: {
                str(e)}")

# ── Pedidos ───────────────────────────────────────────────────────────────────

# Status do pedido
PEDIDO_STATUS = [
    "pendente",           # Cliente fez o pedido, aguardando restaurante
    "confirmado",         # Restaurante aceitou
    "em_preparo",         # Cozinha está preparando
    "pronto",             # Pedido pronto para retirada/entrega
    "em_entrega",         # Saiu para entrega
    "entregue",           # Cliente recebeu
    "cancelado",          # Cancelado (restaurante, cliente ou timeout)
]

# Timeout em minutos para cada status
PEDIDO_TIMEOUT_MINUTOS = {
    "pendente": 10,       # Restaurante tem 10 min para aceitar
    "confirmado": 5,      # 5 min para começar preparo
    "em_preparo": 60,     # 60 min para ficar pronto
    "pronto": 15,         # 15 min para ser retirado/despachado
    "em_entrega": 90,     # 90 min para entregar
}

# Store in-memory para fallback
_pedidos_store: List[dict] = []


class PedidoItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nome: str
    qtd: int = Field(ge=1)
    precoUnitario: float = Field(ge=0)
    observacao: Optional[str] = ""
    # Campos opcionais para variações
    tamanho: Optional[str] = None
    adicionais: Optional[List[str]] = None


class EnderecoEntrega(BaseModel):
    rua: str
    numero: str
    bairro: str
    cidade: str
    estado: str = "SP"
    cep: Optional[str] = ""
    complemento: Optional[str] = ""
    referencia: Optional[str] = ""
    lat: Optional[float] = None
    lng: Optional[float] = None


class PedidoCreate(BaseModel):
    restauranteId: str
    clienteNome: str
    clienteTelefone: str
    clienteId: Optional[str] = None  # para usuários logados
    tipo: str = "entrega"  # entrega | retirada
    itens: List[PedidoItem]
    endereco: Optional[EnderecoEntrega] = None
    pagamento: str  # pix | cartao_credito | cartao_debito | dinheiro
    trocoPara: Optional[float] = None  # se pagamento = dinheiro
    taxaEntrega: float = 5.0
    desconto: float = 0.0
    observacao: Optional[str] = ""
    agendado: bool = False
    horarioAgendado: Optional[str] = None


class PedidoUpdateStatus(BaseModel):
    status: str
    motivoCancelamento: Optional[str] = None


class PedidoAvaliacao(BaseModel):
    nota: int = Field(ge=1, le=5)
    comentario: Optional[str] = ""


def calcular_total_pedido(itens: List[dict], taxaEntrega: float, desconto: float) -> dict:
    subtotal = sum(i["qtd"] * i["precoUnitario"] for i in itens)
    total = subtotal + taxaEntrega - desconto
    return {
        "subtotal": round(subtotal, 2),
        "taxaEntrega": round(taxaEntrega, 2),
        "desconto": round(desconto, 2),
        "total": round(max(total, 0), 2),
    }


def create_pedido_doc(body: PedidoCreate) -> dict:
    now = datetime.now(timezone.utc)
    valores = calcular_total_pedido(
        [i.model_dump() for i in body.itens],
        body.taxaEntrega,
        body.desconto
    )
    return {
        "id": str(uuid.uuid4()),
        "restauranteId": body.restauranteId,
        "clienteNome": body.clienteNome,
        "clienteTelefone": body.clienteTelefone,
        "clienteId": body.clienteId,
        "tipo": body.tipo,
        "itens": [i.model_dump() for i in body.itens],
        "endereco": body.endereco.model_dump() if body.endereco else None,
        "pagamento": body.pagamento,
        "trocoPara": body.trocoPara,
        **valores,
        "observacao": body.observacao,
        "agendado": body.agendado,
        "horarioAgendado": body.horarioAgendado,
        "status": "pendente",
        "statusTimeline": [{"status": "pendente", "timestamp": now.isoformat()}],
        "entregadorId": None,
        "avaliacao": None,
        "motivoCancelamento": None,
        "criadoEm": now.isoformat(),
        "atualizadoEm": now.isoformat(),
    }


async def broadcast_pedido_status(pedido_id: str, status: str, data: dict = None):
    """Broadcast via WebSocket para todos os clientes acompanhando o pedido."""
    payload = json.dumps({
        "type": "pedido_status_update",
        "pedidoId": pedido_id,
        "status": status,
        "data": data or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    room = _tracking_rooms.get(pedido_id, set())
    dead = set()
    for ws in room:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    room -= dead


async def verificar_timeout_pedidos():
    """Task de background que verifica pedidos expirados a cada 60 segundos."""
    while True:
        await asyncio.sleep(60)
        now = datetime.now(timezone.utc)
        try:
            if await check_mongo():
                # Busca pedidos que podem ter expirado
                cursor = db.pedidos.find({
                    "status": {"$in": list(PEDIDO_TIMEOUT_MINUTOS.keys())},
                }, {"_id": 0})
                async for pedido in cursor:
                    status_atual = pedido["status"]
                    timeout_min = PEDIDO_TIMEOUT_MINUTOS.get(status_atual)
                    if not timeout_min:
                        continue
                    # Pega o timestamp do status atual
                    timeline = pedido.get("statusTimeline", [])
                    status_entry = next(
                        (t for t in reversed(timeline) if t["status"] == status_atual),
                        None
                    )
                    if status_entry:
                        status_time = datetime.fromisoformat(status_entry["timestamp"])
                        if now - status_time > timedelta(minutes=timeout_min):
                            # Timeout! Cancela o pedido
                            await db.pedidos.update_one(
                                {"id": pedido["id"]},
                                {
                                    "$set": {
                                        "status": "cancelado",
                                        "motivoCancelamento": f"Timeout: {status_atual} expirou apos {timeout_min} minutos",
                                        "atualizadoEm": now.isoformat(),
                                    },
                                    "$push": {
                                        "statusTimeline": {"status": "cancelado", "timestamp": now.isoformat()}
                                    }
                                }
                            )
                            await broadcast_pedido_status(pedido["id"], "cancelado", {
                                "motivo": f"Timeout: pedido expirou no status '{status_atual}'"
                            })
                            logger.info(f"Pedido {pedido['id']} cancelado por timeout ({status_atual})")
            else:
                # Fallback in-memory
                for pedido in _pedidos_store:
                    status_atual = pedido["status"]
                    if status_atual not in PEDIDO_TIMEOUT_MINUTOS:
                        continue
                    timeout_min = PEDIDO_TIMEOUT_MINUTOS[status_atual]
                    timeline = pedido.get("statusTimeline", [])
                    status_entry = next(
                        (t for t in reversed(timeline) if t["status"] == status_atual),
                        None
                    )
                    if status_entry:
                        status_time = datetime.fromisoformat(status_entry["timestamp"])
                        if now - status_time > timedelta(minutes=timeout_min):
                            pedido["status"] = "cancelado"
                            pedido["motivoCancelamento"] = f"Timeout: {status_atual} expirou apos {timeout_min} minutos"
                            pedido["atualizadoEm"] = now.isoformat()
                            pedido["statusTimeline"].append({"status": "cancelado", "timestamp": now.isoformat()})
                            await broadcast_pedido_status(pedido["id"], "cancelado", {
                                "motivo": f"Timeout: pedido expirou no status '{status_atual}'"
                            })
                            logger.info(f"Pedido {pedido['id']} cancelado por timeout ({status_atual})")
        except Exception as e:
            logger.error(f"Erro no verificador de timeout: {e}")


@api_router.post("/pedidos")
async def criar_pedido(body: PedidoCreate):
    """Cliente cria um novo pedido."""
    doc = create_pedido_doc(body)
    if await check_mongo():
        await db.pedidos.insert_one(doc)
    else:
        _pedidos_store.append(doc)
    # Notifica via WebSocket + Push
    await broadcast_pedido_status(doc["id"], "pendente", doc)
    asyncio.create_task(notify_pedido_status_change(doc, "pendente"))
    logger.info(f"Novo pedido criado: {doc['id']} - Restaurante: {doc['restauranteId']}")
    return doc


@api_router.get("/pedidos")
async def listar_pedidos(
    restaurante_id: Optional[str] = None,
    cliente_telefone: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """Lista pedidos com filtros opcionais."""
    filtro = {}
    if restaurante_id:
        filtro["restauranteId"] = restaurante_id
    if cliente_telefone:
        filtro["clienteTelefone"] = cliente_telefone
    if status:
        filtro["status"] = status

    if await check_mongo():
        docs = await db.pedidos.find(filtro, {"_id": 0}).sort("criadoEm", -1).skip(offset).limit(limit).to_list(limit)
        total = await db.pedidos.count_documents(filtro)
        return {"pedidos": docs, "total": total, "limit": limit, "offset": offset}
    else:
        resultados = _pedidos_store
        if restaurante_id:
            resultados = [p for p in resultados if p["restauranteId"] == restaurante_id]
        if cliente_telefone:
            resultados = [p for p in resultados if p["clienteTelefone"] == cliente_telefone]
        if status:
            resultados = [p for p in resultados if p["status"] == status]
        resultados = sorted(resultados, key=lambda x: x["criadoEm"], reverse=True)
        total = len(resultados)
        return {"pedidos": resultados[offset:offset + limit], "total": total, "limit": limit, "offset": offset}


@api_router.get("/pedidos/{pedido_id}")
async def obter_pedido(pedido_id: str):
    """Obtém detalhes de um pedido específico."""
    if await check_mongo():
        doc = await db.pedidos.find_one({"id": pedido_id}, {"_id": 0})
    else:
        doc = next((p for p in _pedidos_store if p["id"] == pedido_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Pedido nao encontrado.")
    return doc


@api_router.patch("/pedidos/{pedido_id}/status")
async def atualizar_status_pedido(pedido_id: str, body: PedidoUpdateStatus):
    """Atualiza o status de um pedido (restaurante, entregador ou sistema)."""
    if body.status not in PEDIDO_STATUS:
        raise HTTPException(
            status_code=400,
            detail=f"Status invalido. Opcoes: {', '.join(PEDIDO_STATUS)}"
        )

    now = datetime.now(timezone.utc)
    update_data = {
        "status": body.status,
        "atualizadoEm": now.isoformat(),
    }
    if body.motivoCancelamento:
        update_data["motivoCancelamento"] = body.motivoCancelamento

    if await check_mongo():
        result = await db.pedidos.update_one(
            {"id": pedido_id},
            {
                "$set": update_data,
                "$push": {"statusTimeline": {"status": body.status, "timestamp": now.isoformat()}}
            }
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Pedido nao encontrado.")
        doc = await db.pedidos.find_one({"id": pedido_id}, {"_id": 0})
    else:
        doc = next((p for p in _pedidos_store if p["id"] == pedido_id), None)
        if not doc:
            raise HTTPException(status_code=404, detail="Pedido nao encontrado.")
        doc.update(update_data)
        doc.setdefault("statusTimeline", []).append({"status": body.status, "timestamp": now.isoformat()})

    # Broadcast para todos os conectados + Push
    await broadcast_pedido_status(pedido_id, body.status, doc)
    asyncio.create_task(notify_pedido_status_change(doc, body.status))
    logger.info(f"Pedido {pedido_id} atualizado para: {body.status}")
    return doc


@api_router.post("/pedidos/{pedido_id}/avaliar")
async def avaliar_pedido(pedido_id: str, body: PedidoAvaliacao):
    """Cliente avalia o pedido apos entrega."""
    if await check_mongo():
        pedido = await db.pedidos.find_one({"id": pedido_id}, {"_id": 0})
        if not pedido:
            raise HTTPException(status_code=404, detail="Pedido nao encontrado.")
        if pedido["status"] != "entregue":
            raise HTTPException(status_code=400, detail="So pode avaliar pedidos entregues.")
        await db.pedidos.update_one(
            {"id": pedido_id},
            {"$set": {"avaliacao": body.model_dump(), "atualizadoEm": datetime.now(timezone.utc).isoformat()}}
        )
        return {"ok": True}
    else:
        pedido = next((p for p in _pedidos_store if p["id"] == pedido_id), None)
        if not pedido:
            raise HTTPException(status_code=404, detail="Pedido nao encontrado.")
        if pedido["status"] != "entregue":
            raise HTTPException(status_code=400, detail="So pode avaliar pedidos entregues.")
        pedido["avaliacao"] = body.model_dump()
        pedido["atualizadoEm"] = datetime.now(timezone.utc).isoformat()
        return {"ok": True}


@api_router.get("/pedidos/{pedido_id}/timeline")
async def timeline_pedido(pedido_id: str):
    """Retorna a timeline de status do pedido."""
    if await check_mongo():
        doc = await db.pedidos.find_one({"id": pedido_id}, {"_id": 0, "statusTimeline": 1, "id": 1})
    else:
        doc = next((p for p in _pedidos_store if p["id"] == pedido_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Pedido nao encontrado.")
    return {"pedidoId": doc["id"], "timeline": doc.get("statusTimeline", [])}


@api_router.get("/pedidos/stats/{restaurante_id}")
async def estatisticas_pedidos(restaurante_id: str):
    """Estatisticas de pedidos para o restaurante (hoje)."""
    hoje = datetime.now(timezone.utc).date().isoformat()
    if await check_mongo():
        pipeline = [
            {"$match": {"restauranteId": restaurante_id, "criadoEm": {"$regex": f"^{hoje}"}}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "total": {"$sum": "$total"}
            }}
        ]
        stats = await db.pedidos.aggregate(pipeline).to_list(100)
        total_pedidos = sum(s["count"] for s in stats)
        total_valor = sum(s["total"] for s in stats)
    else:
        pedidos_hoje = [p for p in _pedidos_store if p["restauranteId"] == restaurante_id and p["criadoEm"].startswith(hoje)]
        from collections import defaultdict
        stats_map = defaultdict(lambda: {"count": 0, "total": 0})
        for p in pedidos_hoje:
            stats_map[p["status"]]["count"] += 1
            stats_map[p["status"]]["total"] += p.get("total", 0)
        stats = [{"_id": k, **v} for k, v in stats_map.items()]
        total_pedidos = len(pedidos_hoje)
        total_valor = sum(p.get("total", 0) for p in pedidos_hoje)

    return {
        "restauranteId": restaurante_id,
        "data": hoje,
        "totalPedidos": total_pedidos,
        "totalValor": round(total_valor, 2),
        "porStatus": stats,
    }

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
    criadoEm: str = Field(
        default_factory=lambda: datetime.now(
            timezone.utc).isoformat())


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
    nome: Optional[str] = None
    categoria: Optional[str] = None
    quantidade: Optional[float] = None
    precoCusto: Optional[float] = None
    precoVenda: Optional[float] = None
    porKg: Optional[bool] = None
    foto: Optional[str] = None


class EstoqueDeduzirItem(BaseModel):
    itemId: str
    qtd: float


class EstoqueDeduzirRequest(BaseModel):
    restauranteId: str
    itens: List[EstoqueDeduzirItem]


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
        raise HTTPException(
            status_code=400,
            detail="Nenhum campo para atualizar.")
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


@api_router.post("/estoque/deduzir")
async def deduzir_estoque(body: EstoqueDeduzirRequest):
    \"\"\"Deduz quantidade vendida do estoque apos cada venda.\"\"\"
    if await check_mongo():
        for item in body.itens:
            await db.estoque.update_one(
                {\"id\": item.itemId, \"restauranteId\": body.restauranteId},
                {\"$inc\": {\"quantidade\": -item.qtd}}
            )
    else:
        for item in body.itens:
            for i in _estoque_store:
                if i[\"id\"] == item.itemId and i[\"restauranteId\"] == body.restauranteId:
                    i[\"quantidade\"] = max(0, i[\"quantidade\"] - item.qtd)
                    break
    return {\"ok\": True}

# ── WebSocket Tracking ───────────────────────────────────────────────────────

# Salas: order_id -> set de WebSockets conectados
_tracking_rooms: Dict[str, Set[WebSocket]] = {}
# Entregadores conectados: entregador_id -> WebSocket
_entregador_sockets: Dict[str, WebSocket] = {}


@app.websocket("/ws/track/{order_id}")
async def ws_track(websocket: WebSocket, order_id: str):
    """Clientes se conectam aqui para receber posição do entregador em tempo real."""
    await websocket.accept()
    _tracking_rooms.setdefault(order_id, set()).add(websocket)
    try:
        while True:
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
    payload = json.dumps(
        {"lat": body.lat, "lng": body.lng, "status": body.status})
    room = _tracking_rooms.get(order_id, set())
    dead = set()
    for ws in room:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    room -= dead
    return {"ok": True, "clients": len(room)}


@app.websocket("/ws/entregador/{entregador_id}")
async def ws_entregador(websocket: WebSocket, entregador_id: str):
    """App do entregador conecta aqui para receber pedidos e enviar respostas."""
    await websocket.accept()
    _entregador_sockets[entregador_id] = websocket
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue

            msg_type = data.get("type")
            order_id = data.get("orderId")

            if msg_type == "resposta" and order_id:
                resposta = data.get("resposta")
                # Notifica clientes rastreando se entregue
                if resposta == "entregue":
                    room = _tracking_rooms.get(order_id, set())
                    payload = json.dumps(
                        {"type": "entregue", "orderId": order_id, "status": "Entregue"})
                    for ws in list(room):
                        try:
                            await ws.send_text(payload)
                        except Exception:
                            pass

    except (WebSocketDisconnect, Exception):
        _entregador_sockets.pop(entregador_id, None)


class DespacharPedidoRequest(BaseModel):
    entregadorId: str
    orderId: str
    restaurante: str
    endereco: str
    referencia: Optional[str] = ""
    itens: List[dict] = []
    pagamento: Optional[str] = ""
    observacao: Optional[str] = ""
    taxaEntrega: float = 5.0
    distanciaKm: Optional[float] = None


@api_router.post("/entregador/despachar")
async def despachar_pedido(body: DespacharPedidoRequest):
    """Restaurante despacha pedido para um entregador específico."""
    ws = _entregador_sockets.get(body.entregadorId)
    if not ws:
        raise HTTPException(
            status_code=404,
            detail="Entregador não conectado.")
    try:
        await ws.send_text(json.dumps({"type": "novo_pedido", "pedido": body.model_dump()}))
    except Exception:
        _entregador_sockets.pop(body.entregadorId, None)
        raise HTTPException(status_code=503,
                            detail="Falha ao enviar para o entregador.")
    return {"ok": True}


@api_router.get("/entregador/online")
async def entregadores_online():
    """Retorna IDs de entregadores conectados."""
    return {"online": list(_entregador_sockets.keys())}

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
    updates = {
        **body.model_dump(),
        "status": "fechado",
        "fechadoEm": datetime.now(
            timezone.utc).isoformat()}
    if await check_mongo():
        await db.caixas.update_one(
            {"restauranteId": restaurante_id, "status": "aberto"},
            {"$set": updates}
        )
    return {"ok": True}

# ── Cardápio PDF Upload ────────────────────────────────────────────────────

@api_router.post("/cardapio/pdf-upload")
async def upload_pdf_cardapio(
    file: UploadFile = File(...),
    restauranteId: str = Form(...)
):
    \"\"\"Recebe PDF do cardápio, extrai texto e retorna itens detectados.\"\"\"
    try:
        from PyPDF2 import PdfReader
        contents = await file.read()
        reader = PdfReader(io.BytesIO(contents))
        text = \"\\n\".join(page.extract_text() or \"\" for page in reader.pages)
        
        # Heurística simples para detectar itens: nome + preço
        itens = []
        categorias_detectadas = set()
        
        # Regex para capturar linhas com nome e preços
        # Padrao: Nome do item ... R$ XX,XX ou R$ XX.XX
        lines = text.split('\\n')
        for line in lines:
            line = line.strip()
            # Tenta encontrar preço de venda
            match = re.search(r'R?\\$?\\s*([\\d,[.]]\\d{2})', line)
            if match and len(line) > 3:
                preco_str = match.group(1).replace(',', '.')
                preco_venda = float(preco_str)
                nome = line[:match.start()].strip().rstrip('.,- ')
                # Remove caracteres estranhos
                nome = re.sub(r'[^\\w\\s\\-]', '', nome).strip()
                if nome and len(nome) > 2:
                    itens.append({
                        \"nome\": nome,
                        \"precoVenda\": preco_venda,
                        \"precoCusto\": round(preco_venda * 0.6, 2),  # estimativa 60%
                        \"quantidade\": 0,
                        \"categoria\": \"Geral\"
                    })
                    categorias_detectadas.add(\"Geral\")
        
        return {
            \"ok\": True,
            \"restauranteId\": restauranteId,
            \"itensDetectados\": itens,
            \"categoriasDetectadas\": list(categorias_detectadas),
            \"rawPreview\": text[:2000]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f\"Erro ao processar PDF: {str(e)}\")

# ── IA / Celery ────────────────────────────────────────────────────────────

class IATextoPedidoRequest(BaseModel):
    pedido_id: str
    texto: str


@api_router.post("/ia/processar-pedido")
async def disparar_processamento_ia(body: IATextoPedidoRequest):
    """
    Dispara a tarefa Celery para processar o pedido via IA.
    Útil para pedidos por WhatsApp ou texto livre.
    """
    from tasks import processar_pedido_ia
    task = processar_pedido_ia.delay(body.pedido_id, body.texto)
    return {"ok": True, "task_id": task.id, "status": "enviado_para_fila"}


# ── General routes ──────────────────────────────────────────────────────


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
    return {"status": "ok", "mongo": mongo_ok,
            "store": "mongodb" if mongo_ok else "memory"}

# ── Push Notifications ──────────────────────────────────────────────────

_push_subscriptions_store: List[dict] = []

class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: dict
    userType: str = "cliente"  # cliente | restaurante | entregador
    userId: Optional[str] = None
    restauranteId: Optional[str] = None


async def send_push_notification(subscription: dict, title: str, body: str, data: dict = None):
    """Envia notificação push via Web Push (VAPID)."""
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.warning("VAPID keys não configuradas. Push notification ignorado.")
        return False
    try:
        from pywebpush import webpush, WebPushException
        webpush(
            subscription_info=subscription,
            data=json.dumps({
                "title": title,
                "body": body,
                "data": data or {},
                "icon": "/logo192.png",
                "badge": "/badge72.png",
                "tag": data.get("pedidoId", "ifood2") if data else "ifood2",
                "requireInteraction": True,
            }),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{VAPID_CLAIMS_EMAIL}"},
        )
        return True
    except WebPushException as e:
        logger.error(f"Erro ao enviar push: {e}")
        return False
    except Exception as e:
        logger.error(f"Erro inesperado no push: {e}")
        return False


@api_router.get("/push/vapid-public-key")
async def get_vapid_public_key():
    """Retorna a chave pública VAPID para o frontend se inscrever."""
    return {"publicKey": VAPID_PUBLIC_KEY or ""}


@api_router.post("/push/subscribe")
async def subscribe_push(body: PushSubscriptionCreate):
    """Cliente/Restaurante/Entregador se inscreve para notificações push."""
    sub = {
        "id": str(uuid.uuid4()),
        "endpoint": body.endpoint,
        "keys": body.keys,
        "userType": body.userType,
        "userId": body.userId,
        "restauranteId": body.restauranteId,
        "criadoEm": datetime.now(timezone.utc).isoformat(),
    }
    if await check_mongo():
        # Remove duplicatas pelo endpoint
        await db.push_subscriptions.delete_one({"endpoint": body.endpoint})
        await db.push_subscriptions.insert_one(sub)
    else:
        _push_subscriptions_store[:] = [
            s for s in _push_subscriptions_store if s["endpoint"] != body.endpoint
        ]
        _push_subscriptions_store.append(sub)
    logger.info(f"Push subscription criada: {body.userType} - {body.endpoint[:60]}...")
    return {"ok": True}


@api_router.delete("/push/unsubscribe")
async def unsubscribe_push(endpoint: str):
    """Remove inscrição push."""
    if await check_mongo():
        await db.push_subscriptions.delete_one({"endpoint": endpoint})
    else:
        global _push_subscriptions_store
        _push_subscriptions_store = [
            s for s in _push_subscriptions_store if s["endpoint"] != endpoint
        ]
    return {"ok": True}


async def notify_pedido_status_change(pedido: dict, novo_status: str):
    """Envia notificações push para cliente e restaurante quando status muda."""
    pedido_id = pedido["id"]
    restaurante_id = pedido.get("restauranteId")
    cliente_telefone = pedido.get("clienteTelefone")

    status_labels = {
        "pendente": ("Pedido Recebido!", f"Seu pedido #{pedido_id[-6:].upper()} foi recebido e está aguardando confirmação."),
        "confirmado": ("Pedido Confirmado!", f"Restaurante aceitou seu pedido #{pedido_id[-6:].upper()}."),
        "em_preparo": ("Em Preparo!", f"Sua comida do pedido #{pedido_id[-6:].upper()} está sendo preparada."),
        "pronto": ("Pedido Pronto!", f"Pedido #{pedido_id[-6:].upper()} pronto para retirada/entrega."),
        "em_entrega": ("Saiu para Entrega!", f"O entregador está a caminho com seu pedido #{pedido_id[-6:].upper()}."),
        "entregue": ("Pedido Entregue!", f"Seu pedido #{pedido_id[-6:].upper()} foi entregue. Aproveite!"),
        "cancelado": ("Pedido Cancelado", f"Seu pedido #{pedido_id[-6:].upper()} foi cancelado."),
    }
    title, body = status_labels.get(novo_status, ("Atualização de Pedido", f"Status atualizado para: {novo_status}"))

    subs = []
    if await check_mongo():
        cursor = db.push_subscriptions.find({
            "$or": [
                {"restauranteId": restaurante_id, "userType": "restaurante"},
                {"userId": cliente_telefone, "userType": "cliente"},
                {"userId": pedido.get("clienteId"), "userType": "cliente"},
            ]
        }, {"_id": 0})
        subs = await cursor.to_list(100)
    else:
        subs = [
            s for s in _push_subscriptions_store
            if (s.get("restauranteId") == restaurante_id and s.get("userType") == "restaurante")
            or (s.get("userId") == cliente_telefone and s.get("userType") == "cliente")
            or (s.get("userId") == pedido.get("clienteId") and s.get("userType") == "cliente")
        ]

    for sub in subs:
        subscription_info = {"endpoint": sub["endpoint"], "keys": sub["keys"]}
        asyncio.create_task(send_push_notification(
            subscription_info, title, body,
            {"pedidoId": pedido_id, "status": novo_status, "restauranteId": restaurante_id}
        ))

# ── Seed data (dev only) ────────────────────────────────────────────────


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
    # Inicia verificador de timeout de pedidos em background
    asyncio.create_task(verificar_timeout_pedidos())

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
