from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import tempfile
import subprocess
import secrets
import hmac
import hashlib
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Annotated
from fastapi import Query, WebSocket, WebSocketDisconnect
import json
from datetime import timedelta
import uuid
from datetime import datetime, timezone
from pymongo.errors import PyMongoError


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

class PrintDirectRequest(BaseModel):
    content: str
    printer_name: Optional[str] = None

# ═══════════════════════════════════════════════════════════════════════════════
# MODELOS PEDIDOS PDV (Fase 1)
# ═══════════════════════════════════════════════════════════════════════════════

class EnderecoEntrega(BaseModel):
    rua: str
    numero: str
    bairro: str
    cidade: str = "São Paulo"
    complemento: Optional[str] = None
    referencia: Optional[str] = None

class PedidoItem(BaseModel):
    id: Optional[str] = None
    nome: str
    qtd: int
    precoUnitario: float
    observacao: Optional[str] = None

class PedidoCreate(BaseModel):
    restauranteId: str = "teste"
    clienteNome: str
    clienteTelefone: str
    tipo: str  # "retirada", "entrega", "comer_aqui"
    itens: List[PedidoItem]
    endereco: Optional[EnderecoEntrega] = None
    pagamento: str = "dinheiro"
    pago: bool = True
    agendado: bool = False
    horarioAgendado: Optional[str] = None  # ISO datetime
    observacao: Optional[str] = None
    mesa: Optional[str] = None

class PedidoStatusUpdate(BaseModel):
    status: str  # pendente|confirmado|em_preparo|pronto|em_entrega|entregue|cancelado
    motivoCancelamento: Optional[str] = None

class EstoqueDeducir(BaseModel):
    restauranteId: str
    itens: List[Dict[str, int]]  # [{"itemId": "1", "qtd": 2}]

class EstoqueItem(BaseModel):
    nome: str
    categoria: str
    quantidade: float
    precoCusto: float = 0.0
    precoVenda: float
    porKg: bool = False

class EstoqueUpdate(BaseModel):
    nome: Optional[str] = None
    categoria: Optional[str] = None
    quantidade: Optional[float] = None
    precoCusto: Optional[float] = None
    precoVenda: Optional[float] = None
    porKg: Optional[bool] = None


STATUS_CHECKS_FALLBACK: List[Dict[str, Any]] = []

OWNER_API_TOKEN = os.environ.get("OWNER_API_TOKEN", "")
OWNER_API_TOKEN_FALLBACK = "ifood2-token-super-seguro-2026"
RECEIPT_PRINTER_NAME = os.environ.get("RECEIPT_PRINTER_NAME", "").strip()
PRINT_TIMEOUT_SEC = int(os.environ.get("PRINT_TIMEOUT_SEC", "12"))
PRINT_MAX_CHARS = int(os.environ.get("PRINT_MAX_CHARS", "12000"))
API_HMAC_SECRET = os.environ.get("API_HMAC_SECRET", "").strip()
APP_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("APP_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]

def _require_owner_token(x_owner_token: Optional[str]) -> None:
    expected_token = (OWNER_API_TOKEN or OWNER_API_TOKEN_FALLBACK).strip()
    if not expected_token:
        raise HTTPException(status_code=503, detail="Serviço não configurado")
    received = (x_owner_token or "").strip()
    if not received or not secrets.compare_digest(received, expected_token):
        raise HTTPException(status_code=401, detail="Não autorizado")

def _require_internal_origin(request: Request) -> None:
    origin = (request.headers.get("origin") or "").strip()
    referer = (request.headers.get("referer") or "").strip()
    host = (request.headers.get("host") or "").strip()
    server_base = f"http://{host}" if host else ""
    is_allowed_origin = bool(origin and origin in APP_ALLOWED_ORIGINS)
    is_allowed_referer = bool(referer and any(referer.startswith(allowed) for allowed in APP_ALLOWED_ORIGINS))
    is_same_host = bool(server_base and referer.startswith(server_base))
    if not (is_allowed_origin or is_allowed_referer or is_same_host):
        raise HTTPException(status_code=403, detail="Origem não permitida")

def _verify_hmac_signature(payload: str, x_signature: Optional[str]) -> None:
    if not API_HMAC_SECRET:
        return
    provided = (x_signature or "").strip()
    if not provided:
        raise HTTPException(status_code=401, detail="Assinatura ausente")
    expected = hmac.new(API_HMAC_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Assinatura inválida")

def _sanitize_print_content(content: str) -> str:
    # mantém quebras de linha e remove controles não imprimíveis
    cleaned = "".join(ch for ch in content if ch == "\n" or ch == "\r" or ch == "\t" or ord(ch) >= 32)
    return cleaned.strip()

def _print_response(ok: bool, code: str, message: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    data: Dict[str, Any] = {"ok": ok, "code": code, "message": message}
    if extra:
        data.update(extra)
    return data

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root(request: Request):
    _require_internal_origin(request)
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)

    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()

    try:
        _ = await db.status_checks.insert_one(doc)
    except Exception:
        logger.warning("mongo_unavailable_on_create_status_fallback_memory")
        STATUS_CHECKS_FALLBACK.append(doc)

    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    try:
        status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    except Exception:
        logger.warning("mongo_unavailable_on_get_status_fallback_memory")
        status_checks = list(STATUS_CHECKS_FALLBACK)

    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])

    return status_checks

@api_router.get("/health")
async def health():
    return {"status": "ok"}

@api_router.post("/print/direct")
async def print_direct(
    request: Request,
    body: PrintDirectRequest,
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
    x_signature: Optional[str] = Header(default=None, alias="X-Signature"),
):
    _require_owner_token(x_owner_token)

    if os.name != "nt":
        raise HTTPException(status_code=400, detail="Impressão direta suportada apenas em Windows")

    raw_content = body.content or ""
    _verify_hmac_signature(raw_content, x_signature)
    content = _sanitize_print_content(raw_content)
    if not content:
        raise HTTPException(status_code=400, detail="Conteúdo de impressão vazio")
    if len(content) > PRINT_MAX_CHARS:
        raise HTTPException(status_code=400, detail="Conteúdo excede limite permitido")

    printer_name = (body.printer_name or RECEIPT_PRINTER_NAME or "").strip()

    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".txt", delete=False) as tf:
            tf.write(content + "\n")
            temp_path = tf.name

        if printer_name:
            ps_command = (
                f"Start-Process -FilePath '{temp_path}' -Verb PrintTo -ArgumentList '\"{printer_name}\"' -WindowStyle Hidden; "
                "Start-Sleep -Milliseconds 700"
            )
        else:
            ps_command = (
                f"Start-Process -FilePath '{temp_path}' -Verb Print -WindowStyle Hidden; "
                "Start-Sleep -Milliseconds 700"
            )

        completed = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_command],
            capture_output=True,
            text=True,
            timeout=PRINT_TIMEOUT_SEC
        )

        if completed.returncode != 0:
            logger.error("print_direct_failed returncode=%s printer=%s", completed.returncode, printer_name or "default")
            raise HTTPException(status_code=500, detail="Falha ao enviar impressão para o spooler")

        logger.info("print_direct_ok printer=%s chars=%s", printer_name or "default", len(content))
        return _print_response(True, "PRINT_SENT", "Impressão enviada com sucesso", {"printer": printer_name or "default"})
    except subprocess.TimeoutExpired:
        logger.error("print_direct_timeout printer=%s", printer_name or "default")
        raise HTTPException(status_code=504, detail="Timeout ao enviar impressão")
    except HTTPException:
        raise
    except Exception:
        logger.exception("print_direct_unexpected_error")
        raise HTTPException(status_code=500, detail="Erro interno na impressão")
    finally:
        if temp_path:
            try:
                os.remove(temp_path)
            except Exception:
    logger.warning("print_direct_tempfile_cleanup_failed")

# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS PEDIDOS PDV (Fase 1-2)
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.post("/pedidos")
async def criar_pedido(pedido: PedidoCreate):
    """Cria novo pedido do PDV/Checkout"""
    pedido_dict = pedido.model_dump()
    pedido_dict["id"] = str(uuid.uuid4())
    pedido_dict["status"] = "pendente"
    pedido_dict["statusTimeline"] = [{
        "status": "pendente",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }]
    pedido_dict["criadoEm"] = datetime.now(timezone.utc).isoformat()
    pedido_dict["total"] = sum(i.qtd * i.precoUnitario for i in pedido.itens)
    pedido_dict["subtotal"] = pedido_dict["total"]
    pedido_dict["taxaEntrega"] = 5.0 if pedido.tipo == "entrega" else 0.0
    pedido_dict["desconto"] = 0.0

    try:
        result = await db.pedidos.insert_one(pedido_dict)
        await broadcast_pedido_status(pedido.restauranteId, pedido_dict["id"], "pendente")
        logger.info(f"Pedido criado: {pedido_dict['id']} por {pedido.clienteNome}")
        return {"id": pedido_dict["id"], "status": "criado"}
    except Exception as e:
        logger.error(f"Erro criar pedido: {e}")
        raise HTTPException(status_code=500, detail="Erro ao salvar pedido")

@api_router.get("/pedidos")
async def listar_pedidos(
    restaurante_id: str = Query("teste"),
    status: Optional[str] = Query(None),
    limit: int = Query(100)
):
    """Lista pedidos para painel restaurante"""
    query = {"restauranteId": restaurante_id}
    if status:
        query["status"] = status
    
    pedidos = await db.pedidos.find(query).sort("criadoEm", -1).limit(limit).to_list(length=limit)
    return {"pedidos": pedidos}

@api_router.patch("/pedidos/{pedido_id}/status")
async def atualizar_status(pedido_id: str, update: PedidoStatusUpdate):
    """Atualiza status do pedido (painel)"""
    valid_statuses = ["pendente", "confirmado", "em_preparo", "pronto", "em_entrega", "entregue", "cancelado"]
    if update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Status inválido")
    
    timeline_entry = {
        "status": update.status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "motivo": update.motivoCancelamento
    }
    
    result = await db.pedidos.update_one(
        {"id": pedido_id},
        {
            "$set": {
                "status": update.status,
                "atualizadoEm": datetime.now(timezone.utc).isoformat()
            },
            "$push": {"statusTimeline": timeline_entry}
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    
    pedido = await db.pedidos.find_one({"id": pedido_id})
    await broadcast_pedido_status(pedido["restauranteId"], pedido_id, update.status)
    return {"status": "atualizado"}

@api_router.post("/estoque/deduzir")
async def deduzir_estoque(deduzir: EstoqueDeducir):
    """Abate estoque após pedido (PDV)"""
    for item in deduzir.itens:
        item_id = item["itemId"]
        qtd = item["qtd"]
        result = await db.estoque.update_one(
            {"id": item_id, "restauranteId": deduzir.restauranteId},
            {"$inc": {"estoque": -qtd}}
        )
        if result.modified_count == 0:
            logger.warning(f"Estoque não encontrado/deduído: {item_id}")
    return {"status": "deduzido", "itens": len(deduzir.itens)}

# WebSocket connections for real-time updates
websocket_connections: List[WebSocket] = []

@api_router.websocket("/ws/track/{restaurante_id}")
async def websocket_endpoint(websocket: WebSocket, restaurante_id: str):
    await websocket.accept()
    websocket_connections.append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        websocket_connections.remove(websocket)

@api_router.get("/estoque/{restaurante_id}")
async def listar_estoque(restaurante_id: str):
    """Lista estoque restaurante (Estoque.jsx)"""
    itens = await db.estoque.find({"restauranteId": restaurante_id}).sort("categoria", 1).to_list(length=500)
    return itens

@api_router.post("/estoque")
async def criar_estoque(restaurante_id: Annotated[str, Query()], item: EstoqueItem):
    """Cria novo item estoque"""
    item_dict = item.model_dump()
    item_dict["id"] = str(uuid.uuid4())
    item_dict["restauranteId"] = restaurante_id
    await db.estoque.insert_one(item_dict)
    return {"id": item_dict["id"], "status": "criado"}

@api_router.patch("/estoque/{item_id}")
async def atualizar_estoque(item_id: str, update: EstoqueUpdate):
    """Atualiza item estoque (inline edit)"""
    result = await db.estoque.update_one(
        {"id": item_id},
        {"$set": {k: v for k, v in update.model_dump(exclude_unset=True).items() if v is not None}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    return {"status": "atualizado"}

@api_router.delete("/estoque/{item_id}")
async def deletar_estoque(item_id: str):
    """Deleta item estoque"""
    result = await db.estoque.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    return {"status": "deletado"}

# ── FINANCEIRO CAIXA (fechar salva caixas, limpa pedidos dia) ──
class CaixaAbertura(BaseModel):
    restauranteId: str
    fundo: float

class CaixaFechamento(BaseModel):
    dinheiro: float = 0
    pix: float = 0
    cartao: float = 0
    outros: float = 0

@api_router.post("/financeiro/caixa")
async def abrir_caixa(caixa: CaixaAbertura):
    """Abre novo caixa"""
    caixa_dict = caixa.model_dump()
    caixa_dict["id"] = str(uuid.uuid4())
    caixa_dict["abertoEm"] = datetime.now(timezone.utc).isoformat()
    caixa_dict["status"] = "aberto"
    await db.caixas.insert_one(caixa_dict)
    return {"id": caixa_dict["id"]}

@api_router.get("/financeiro/caixa/{restaurante_id}/hoje")
async def caixa_hoje(restaurante_id: str):
    """Último caixa aberto/fechado hoje"""
    hoje = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    caixa = await db.caixas.find_one({
        "restauranteId": restaurante_id,
        "abertoEm": {"$gte": hoje}
    }, sort=[("abertoEm", -1)])
    return caixa or {"status": "fechado", "fundo": 0}

@api_router.patch("/financeiro/caixa/{restaurante_id}/fechar")
async def fechar_caixa(restaurante_id: str, fechamento: CaixaFechamento):
    """Fecha caixa, salva vendas dia em histórico"""
    hoje = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    caixa_aberto = await db.caixas.find_one({
        "restauranteId": restaurante_id,
        "status": "aberto",
        "abertoEm": {"$gte": hoje}
    })
    if not caixa_aberto:
        raise HTTPException(404, "Nenhum caixa aberto hoje")

    totalInformado = fechamento.dinheiro + fechamento.pix + fechamento.cartao + fechamento.outros
    
    # Soma vendas dia
    vendas_dia = await db.pedidos.find({
        "restauranteId": restaurante_id,
        "status": "entregue",  # só entregues/finalizados
        "criadoEm": {"$gte": hoje}
    }).to_list(None)
    totalVendido = sum(p.get("total", 0) for p in vendas_dia)

    await db.caixas.update_one(
        {"id": caixa_aberto["id"]},
        {"$set": {
            "fechadoEm": datetime.now(timezone.utc).isoformat(),
            "status": "fechado",
            "dinheiro": fechamento.dinheiro,
            "pix": fechamento.pix,
            "cartao": fechamento.cartao,
            "outros": fechamento.outros,
            "totalInformado": totalInformado,
            "totalVendido": totalVendido,
            "diferenca": totalInformado - totalVendido,
            "vendasCount": len(vendas_dia)
        }}
    )
    return {"status": "fechado", "diferenca": totalInformado - totalVendido}

async def broadcast_pedido_status(restaurante_id: str, pedido_id: str, status: str):
    """Broadcast status para painéis conectados"""
    message = {"type": "pedido_status_update", "restaurante_id": restaurante_id, "pedido_id": pedido_id, "status": status}
    disconnected = []
    for conn in websocket_connections:
        try:
            await conn.send_json(message)
        except:
            disconnected.append(conn)
    for conn in disconnected:
        websocket_connections.remove(conn)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=APP_ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Owner-Token", "X-Signature"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Startup: Inicia task periódica timeout (60s)
@app.on_event("startup")
async def startup_event():
    from tasks import verificar_timeout_pedidos
    # Simula periodic task (Celery completo futuro)
    import asyncio
    asyncio.create_task(timeout_loop())

async def timeout_loop():
    from tasks import verificar_timeout_pedidos
    while True:
        try:
            verificar_timeout_pedidos.delay()
            await asyncio.sleep(60)
        except Exception as e:
            logger.error(f"Timeout loop error: {e}")
            await asyncio.sleep(60)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()