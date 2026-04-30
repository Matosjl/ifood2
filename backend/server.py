from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import tempfile
import subprocess
import secrets
import hmac
import hashlib
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Dict, Any, Annotated
from fastapi import Query, WebSocket, WebSocketDisconnect
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

mongo_url: str = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ─────────────────────────────────────────────────────────────────────────────
# MODELOS
# ─────────────────────────────────────────────────────────────────────────────

TIPOS_PEDIDO_VALIDOS = {"retirada", "entrega", "comer_aqui"}
PAGAMENTOS_VALIDOS = {"dinheiro", "pix", "cartao", "credito", "debito", "outros"}
STATUS_PEDIDO_VALIDOS = ["pendente", "confirmado", "em_preparo", "pronto", "em_entrega", "entregue", "cancelado"]

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

class PrintDirectRequest(BaseModel):
    content: str
    printer_name: Optional[str] = None

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

    @field_validator("qtd")
    @classmethod
    def qtd_positiva(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Quantidade deve ser maior que zero")
        return v

    @field_validator("precoUnitario")
    @classmethod
    def preco_positivo(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Preço unitário não pode ser negativo")
        return v

class PedidoCreate(BaseModel):
    restauranteId: str = "teste"
    clienteNome: str
    clienteTelefone: str
    tipo: str
    itens: List[PedidoItem]
    endereco: Optional[EnderecoEntrega] = None
    pagamento: str = "dinheiro"
    pago: bool = True
    agendado: bool = False
    horarioAgendado: Optional[str] = None
    observacao: Optional[str] = None
    mesa: Optional[str] = None

    @field_validator("tipo")
    @classmethod
    def tipo_valido(cls, v: str) -> str:
        if v not in TIPOS_PEDIDO_VALIDOS:
            raise ValueError(f"Tipo inválido. Use: {TIPOS_PEDIDO_VALIDOS}")
        return v

    @field_validator("pagamento")
    @classmethod
    def pagamento_valido(cls, v: str) -> str:
        if v not in PAGAMENTOS_VALIDOS:
            raise ValueError(f"Pagamento inválido. Use: {PAGAMENTOS_VALIDOS}")
        return v

    @field_validator("itens")
    @classmethod
    def itens_nao_vazios(cls, v: List[PedidoItem]) -> List[PedidoItem]:
        if not v:
            raise ValueError("Pedido deve ter ao menos um item")
        return v

class PedidoStatusUpdate(BaseModel):
    status: str
    motivoCancelamento: Optional[str] = None

class EstoqueDeducir(BaseModel):
    restauranteId: str
    itens: List[Dict[str, Any]]  # [{"itemId": "uuid", "qtd": 2}]

class EstoqueItem(BaseModel):
    nome: str
    categoria: str
    quantidade: float
    estoqueMinimo: float = 0.0
    precoCusto: float = 0.0
    precoVenda: float
    porKg: bool = False

    @field_validator("quantidade", "precoVenda", "precoCusto", "estoqueMinimo")
    @classmethod
    def nao_negativo(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Valor não pode ser negativo")
        return v

class EstoqueUpdate(BaseModel):
    nome: Optional[str] = None
    categoria: Optional[str] = None
    quantidade: Optional[float] = None
    estoqueMinimo: Optional[float] = None
    precoCusto: Optional[float] = None
    precoVenda: Optional[float] = None
    porKg: Optional[bool] = None

class CaixaAbertura(BaseModel):
    restauranteId: str
    fundo: float

    @field_validator("fundo")
    @classmethod
    def fundo_nao_negativo(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Fundo de caixa não pode ser negativo")
        return v

class CaixaFechamento(BaseModel):
    dinheiro: float = 0.0
    pix: float = 0.0
    cartao: float = 0.0
    outros: float = 0.0

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURAÇÃO E HELPERS
# ─────────────────────────────────────────────────────────────────────────────

STATUS_CHECKS_FALLBACK: List[Dict[str, Any]] = []

OWNER_API_TOKEN: str = os.environ.get("OWNER_API_TOKEN", "")
OWNER_API_TOKEN_FALLBACK = "ifood2-token-super-seguro-2026"
RECEIPT_PRINTER_NAME: str = os.environ.get("RECEIPT_PRINTER_NAME", "").strip()
PRINT_TIMEOUT_SEC: int = int(os.environ.get("PRINT_TIMEOUT_SEC", "12"))
PRINT_MAX_CHARS: int = int(os.environ.get("PRINT_MAX_CHARS", "12000"))
API_HMAC_SECRET: str = os.environ.get("API_HMAC_SECRET", "").strip()
TAXA_ENTREGA_PADRAO: float = float(os.environ.get("TAXA_ENTREGA", "5.0"))
APP_ALLOWED_ORIGINS: List[str] = [
    o.strip()
    for o in os.environ.get("APP_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if o.strip()
]

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
    is_allowed_referer = bool(referer and any(referer.startswith(a) for a in APP_ALLOWED_ORIGINS))
    is_same_host = bool(server_base and referer.startswith(server_base))
    if not (is_allowed_origin or is_allowed_referer or is_same_host):
        raise HTTPException(status_code=403, detail="Origem não permitida")

def _verify_hmac_signature(payload: str, x_signature: Optional[str]) -> None:
    if not API_HMAC_SECRET:
        return
    provided = (x_signature or "").strip()
    if not provided:
        raise HTTPException(status_code=401, detail="Assinatura ausente")
    expected = hmac.new(
        API_HMAC_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    if not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Assinatura inválida")

def _sanitize_print_content(content: str) -> str:
    cleaned = "".join(ch for ch in content if ch in ("\n", "\r", "\t") or ord(ch) >= 32)
    return cleaned.strip()

def _print_response(ok: bool, code: str, message: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    data: Dict[str, Any] = {"ok": ok, "code": code, "message": message}
    if extra:
        data.update(extra)
    return data

async def _registrar_lancamento_financeiro(
    restaurante_id: str,
    tipo: str,  # "venda" | "custo" | "cancelamento"
    valor: float,
    descricao: str,
    referencia_id: Optional[str] = None,
) -> None:
    """Registra lançamento no diário financeiro."""
    lancamento: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "restauranteId": restaurante_id,
        "tipo": tipo,
        "valor": valor,
        "descricao": descricao,
        "referenciaId": referencia_id,
        "criadoEm": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.lancamentos.insert_one(lancamento)
    except Exception as e:
        logger.error("Falha ao registrar lançamento financeiro: %s", e)

async def _reverter_estoque_pedido(pedido: Dict[str, Any]) -> None:
    """Devolve ao estoque os itens de um pedido cancelado."""
    itens = pedido.get("itens", [])
    restaurante_id = pedido.get("restauranteId", "")
    for item in itens:
        item_id = item.get("id")
        qtd = item.get("qtd", 0)
        if not item_id or qtd <= 0:
            continue
        result = await db.estoque.update_one(
            {"id": item_id, "restauranteId": restaurante_id},
            {"$inc": {"quantidade": qtd}}
        )
        if result.modified_count == 0:
            logger.warning("Reversão de estoque ignorada (item não encontrado): %s", item_id)

# ─────────────────────────────────────────────────────────────────────────────
# ROTAS BASE
# ─────────────────────────────────────────────────────────────────────────────

@api_router.get("/")
async def root(request: Request) -> Dict[str, str]:
    _require_internal_origin(request)
    return {"message": "Hello World"}

@api_router.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate) -> StatusCheck:
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc: Dict[str, Any] = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    try:
        await db.status_checks.insert_one(doc)
    except Exception:
        logger.warning("mongo_unavailable_on_create_status_fallback_memory")
        STATUS_CHECKS_FALLBACK.append(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks() -> List[Dict[str, Any]]:
    try:
        status_checks: List[Dict[str, Any]] = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    except Exception:
        logger.warning("mongo_unavailable_on_get_status_fallback_memory")
        status_checks = list(STATUS_CHECKS_FALLBACK)
    for check in status_checks:
        if isinstance(check.get('timestamp'), str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks

# ─────────────────────────────────────────────────────────────────────────────
# IMPRESSÃO
# ─────────────────────────────────────────────────────────────────────────────

@api_router.post("/print/direct")
async def print_direct(
    request: Request,
    body: PrintDirectRequest,
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
    x_signature: Optional[str] = Header(default=None, alias="X-Signature"),
) -> Dict[str, Any]:
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
            capture_output=True, text=True, timeout=PRINT_TIMEOUT_SEC
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

# ─────────────────────────────────────────────────────────────────────────────
# PEDIDOS
# ─────────────────────────────────────────────────────────────────────────────

@api_router.post("/pedidos")
async def criar_pedido(pedido: PedidoCreate) -> Dict[str, str]:
    pedido_dict: Dict[str, Any] = pedido.model_dump()
    pedido_dict["id"] = str(uuid.uuid4())
    pedido_dict["status"] = "pendente"

    subtotal = sum(i.qtd * i.precoUnitario for i in pedido.itens)
    taxa_entrega = TAXA_ENTREGA_PADRAO if pedido.tipo == "entrega" else 0.0

    pedido_dict["subtotal"] = subtotal
    pedido_dict["taxaEntrega"] = taxa_entrega
    pedido_dict["desconto"] = 0.0
    pedido_dict["total"] = subtotal + taxa_entrega
    pedido_dict["statusTimeline"] = [{
        "status": "pendente",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }]
    pedido_dict["criadoEm"] = datetime.now(timezone.utc).isoformat()

    try:
        await db.pedidos.insert_one(pedido_dict)
    except Exception as e:
        logger.error("Erro criar pedido: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao salvar pedido")

    await broadcast_pedido_status(pedido.restauranteId, pedido_dict["id"], "pendente")
    logger.info("Pedido criado: %s por %s", pedido_dict['id'], pedido.clienteNome)
    return {"id": pedido_dict["id"], "status": "criado"}

@api_router.get("/pedidos")
async def listar_pedidos(
    restaurante_id: str = Query("teste"),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> Dict[str, List[Dict[str, Any]]]:
    if status and status not in STATUS_PEDIDO_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Status inválido. Use: {STATUS_PEDIDO_VALIDOS}")
    query: Dict[str, Any] = {"restauranteId": restaurante_id}
    if status:
        query["status"] = status
    try:
        pedidos: List[Dict[str, Any]] = await db.pedidos.find(query, {"_id": 0}).sort("criadoEm", -1).limit(limit).to_list(length=limit)
    except Exception as e:
        logger.error("Erro listar pedidos: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao buscar pedidos")
    return {"pedidos": pedidos}

@api_router.get("/pedidos/{pedido_id}")
async def buscar_pedido(pedido_id: str) -> Dict[str, Any]:
    try:
        pedido: Optional[Dict[str, Any]] = await db.pedidos.find_one({"id": pedido_id}, {"_id": 0})
    except Exception as e:
        logger.error("Erro buscar pedido %s: %s", pedido_id, e)
        raise HTTPException(status_code=500, detail="Erro ao buscar pedido")
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return pedido

@api_router.patch("/pedidos/{pedido_id}/status")
async def atualizar_status(pedido_id: str, update: PedidoStatusUpdate) -> Dict[str, str]:
    if update.status not in STATUS_PEDIDO_VALIDOS:
        raise HTTPException(status_code=400, detail="Status inválido")

    try:
        pedido: Optional[Dict[str, Any]] = await db.pedidos.find_one({"id": pedido_id}, {"_id": 0})
    except Exception as e:
        logger.error("Erro buscar pedido para status update %s: %s", pedido_id, e)
        raise HTTPException(status_code=500, detail="Erro ao buscar pedido")

    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    status_atual = pedido.get("status", "")

    # Impede transições inválidas: pedido já finalizado ou cancelado não muda
    if status_atual in ("entregue", "cancelado"):
        raise HTTPException(
            status_code=409,
            detail=f"Pedido já está '{status_atual}' e não pode ser alterado"
        )

    timeline_entry: Dict[str, Any] = {
        "status": update.status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "motivo": update.motivoCancelamento,
    }
    set_fields: Dict[str, Any] = {
        "status": update.status,
        "atualizadoEm": datetime.now(timezone.utc).isoformat(),
    }
    if update.status == "cancelado" and update.motivoCancelamento:
        set_fields["motivoCancelamento"] = update.motivoCancelamento

    try:
        result = await db.pedidos.update_one(
            {"id": pedido_id},
            {"$set": set_fields, "$push": {"statusTimeline": timeline_entry}}
        )
    except Exception as e:
        logger.error("Erro atualizar status pedido %s: %s", pedido_id, e)
        raise HTTPException(status_code=500, detail="Erro ao atualizar pedido")

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    restaurante_id: str = pedido.get("restauranteId", "")
    total: float = float(pedido.get("total", 0))

    # Lançamento financeiro automático ao entregar
    if update.status == "entregue":
        await _registrar_lancamento_financeiro(
            restaurante_id=restaurante_id,
            tipo="venda",
            valor=total,
            descricao=f"Pedido entregue #{pedido_id[:8]}",
            referencia_id=pedido_id,
        )

    # Reversão de estoque ao cancelar
    if update.status == "cancelado":
        await _reverter_estoque_pedido(pedido)
        if total > 0:
            await _registrar_lancamento_financeiro(
                restaurante_id=restaurante_id,
                tipo="cancelamento",
                valor=total,
                descricao=f"Pedido cancelado #{pedido_id[:8]}: {update.motivoCancelamento or ''}",
                referencia_id=pedido_id,
            )

    await broadcast_pedido_status(restaurante_id, pedido_id, update.status)
    return {"status": "atualizado"}

# ─────────────────────────────────────────────────────────────────────────────
# ESTOQUE
# ─────────────────────────────────────────────────────────────────────────────

@api_router.get("/estoque/{restaurante_id}")
async def listar_estoque(restaurante_id: str) -> List[Dict[str, Any]]:
    try:
        itens: List[Dict[str, Any]] = await db.estoque.find(
            {"restauranteId": restaurante_id}, {"_id": 0}
        ).sort("categoria", 1).to_list(length=500)
    except Exception as e:
        logger.error("Erro listar estoque %s: %s", restaurante_id, e)
        raise HTTPException(status_code=500, detail="Erro ao buscar estoque")
    return itens

@api_router.post("/estoque")
async def criar_estoque(restaurante_id: Annotated[str, Query()], item: EstoqueItem) -> Dict[str, str]:
    existente = await db.estoque.find_one({"nome": item.nome, "restauranteId": restaurante_id})
    if existente:
        raise HTTPException(status_code=409, detail=f"Item '{item.nome}' já existe no estoque")
    item_dict: Dict[str, Any] = item.model_dump()
    item_dict["id"] = str(uuid.uuid4())
    item_dict["restauranteId"] = restaurante_id
    item_dict["criadoEm"] = datetime.now(timezone.utc).isoformat()
    try:
        await db.estoque.insert_one(item_dict)
    except Exception as e:
        logger.error("Erro criar item estoque: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao salvar item no estoque")
    return {"id": item_dict["id"], "status": "criado"}

@api_router.patch("/estoque/{item_id}")
async def atualizar_estoque(item_id: str, update: EstoqueUpdate) -> Dict[str, str]:
    campos = update.model_dump(exclude_unset=True)
    if not campos:
        raise HTTPException(status_code=400, detail="Nenhum campo enviado para atualização")
    # Valida campos numéricos negativos
    for campo in ("quantidade", "precoVenda", "precoCusto", "estoqueMinimo"):
        if campo in campos and campos[campo] is not None and campos[campo] < 0:
            raise HTTPException(status_code=400, detail=f"'{campo}' não pode ser negativo")
    try:
        result = await db.estoque.update_one(
            {"id": item_id},
            {"$set": campos}
        )
    except Exception as e:
        logger.error("Erro atualizar estoque %s: %s", item_id, e)
        raise HTTPException(status_code=500, detail="Erro ao atualizar item")
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    return {"status": "atualizado"}

@api_router.delete("/estoque/{item_id}")
async def deletar_estoque(item_id: str) -> Dict[str, str]:
    try:
        result = await db.estoque.delete_one({"id": item_id})
    except Exception as e:
        logger.error("Erro deletar estoque %s: %s", item_id, e)
        raise HTTPException(status_code=500, detail="Erro ao deletar item")
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    return {"status": "deletado"}

@api_router.post("/estoque/deduzir")
async def deduzir_estoque(deduzir: EstoqueDeducir) -> Dict[str, Any]:
    """Abate estoque após pedido. Rejeita se qualquer item ficaria negativo."""
    falhas: List[str] = []
    for item in deduzir.itens:
        item_id: str = str(item.get("itemId", ""))
        qtd: int = int(item.get("qtd", 0))
        if not item_id or qtd <= 0:
            falhas.append(f"itemId='{item_id}' inválido ou qtd={qtd}")
            continue

        # Verifica se há quantidade suficiente antes de deduzir
        doc: Optional[Dict[str, Any]] = await db.estoque.find_one(
            {"id": item_id, "restauranteId": deduzir.restauranteId}, {"_id": 0}
        )
        if doc is None:
            falhas.append(f"Item '{item_id}' não encontrado no estoque")
            continue

        disponivel: float = float(doc.get("quantidade", 0))
        if disponivel < qtd:
            falhas.append(
                f"Estoque insuficiente para '{doc.get('nome', item_id)}': "
                f"disponível={disponivel}, solicitado={qtd}"
            )
            continue

        result = await db.estoque.update_one(
            {"id": item_id, "restauranteId": deduzir.restauranteId},
            {"$inc": {"quantidade": -qtd}}
        )
        if result.modified_count == 0:
            falhas.append(f"Falha ao deduzir item '{item_id}'")

    if falhas:
        # Retorna 207 Multi-Status se houve falhas parciais
        return {"status": "parcial", "falhas": falhas, "itens_processados": len(deduzir.itens) - len(falhas)}

    return {"status": "deduzido", "itens": len(deduzir.itens)}

# ─────────────────────────────────────────────────────────────────────────────
# WEBSOCKET
# ─────────────────────────────────────────────────────────────────────────────

websocket_connections: List[WebSocket] = []

@api_router.websocket("/ws/track/{restaurante_id}")
async def websocket_endpoint(websocket: WebSocket, restaurante_id: str) -> None:
    await websocket.accept()
    websocket_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in websocket_connections:
            websocket_connections.remove(websocket)

async def broadcast_pedido_status(restaurante_id: str, pedido_id: str, status: str) -> None:
    message: Dict[str, str] = {
        "type": "pedido_status_update",
        "restaurante_id": restaurante_id,
        "pedido_id": pedido_id,
        "status": status,
    }
    disconnected: List[WebSocket] = []
    for conn in websocket_connections:
        try:
            await conn.send_json(message)
        except Exception:
            disconnected.append(conn)
    for conn in disconnected:
        if conn in websocket_connections:
            websocket_connections.remove(conn)

# ─────────────────────────────────────────────────────────────────────────────
# FINANCEIRO
# ─────────────────────────────────────────────────────────────────────────────

@api_router.post("/financeiro/caixa")
async def abrir_caixa(caixa: CaixaAbertura) -> Dict[str, str]:
    hoje = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    # Impede abrir segundo caixa no mesmo dia
    caixa_existente: Optional[Dict[str, Any]] = await db.caixas.find_one({
        "restauranteId": caixa.restauranteId,
        "status": "aberto",
        "abertoEm": {"$gte": hoje},
    })
    if caixa_existente:
        raise HTTPException(status_code=409, detail="Já existe um caixa aberto hoje")
    caixa_dict: Dict[str, Any] = caixa.model_dump()
    caixa_dict["id"] = str(uuid.uuid4())
    caixa_dict["abertoEm"] = datetime.now(timezone.utc).isoformat()
    caixa_dict["status"] = "aberto"
    try:
        await db.caixas.insert_one(caixa_dict)
    except Exception as e:
        logger.error("Erro abrir caixa: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao abrir caixa")
    return {"id": caixa_dict["id"]}

@api_router.get("/financeiro/caixa/{restaurante_id}/hoje")
async def caixa_hoje(restaurante_id: str) -> Dict[str, Any]:
    hoje = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    try:
        caixa: Optional[Dict[str, Any]] = await db.caixas.find_one(
            {"restauranteId": restaurante_id, "abertoEm": {"$gte": hoje}},
            {"_id": 0},
            sort=[("abertoEm", -1)],
        )
    except Exception as e:
        logger.error("Erro buscar caixa hoje %s: %s", restaurante_id, e)
        raise HTTPException(status_code=500, detail="Erro ao buscar caixa")
    return caixa or {"status": "fechado", "fundo": 0}

@api_router.patch("/financeiro/caixa/{restaurante_id}/fechar")
async def fechar_caixa(restaurante_id: str, fechamento: CaixaFechamento) -> Dict[str, Any]:
    hoje = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    caixa_aberto: Optional[Dict[str, Any]] = await db.caixas.find_one({
        "restauranteId": restaurante_id,
        "status": "aberto",
        "abertoEm": {"$gte": hoje},
    })
    if not caixa_aberto:
        raise HTTPException(status_code=404, detail="Nenhum caixa aberto hoje")

    totalInformado = fechamento.dinheiro + fechamento.pix + fechamento.cartao + fechamento.outros

    try:
        vendas_dia: List[Dict[str, Any]] = await db.pedidos.find({
            "restauranteId": restaurante_id,
            "status": "entregue",
            "criadoEm": {"$gte": hoje},
        }, {"_id": 0, "total": 1, "id": 1}).to_list(None)

        cancelados_dia: List[Dict[str, Any]] = await db.pedidos.find({
            "restauranteId": restaurante_id,
            "status": "cancelado",
            "criadoEm": {"$gte": hoje},
        }, {"_id": 0, "total": 1}).to_list(None)
    except Exception as e:
        logger.error("Erro buscar pedidos para fechamento caixa: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao calcular fechamento")

    totalVendido: float = sum(float(p.get("total", 0)) for p in vendas_dia)
    totalCancelado: float = sum(float(p.get("total", 0)) for p in cancelados_dia)

    try:
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
                "totalCancelado": totalCancelado,
                "diferenca": totalInformado - totalVendido,
                "vendasCount": len(vendas_dia),
                "canceladosCount": len(cancelados_dia),
            }}
        )
    except Exception as e:
        logger.error("Erro fechar caixa: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao fechar caixa")

    return {
        "status": "fechado",
        "totalVendido": totalVendido,
        "totalCancelado": totalCancelado,
        "totalInformado": totalInformado,
        "diferenca": totalInformado - totalVendido,
    }

@api_router.get("/financeiro/lancamentos/{restaurante_id}")
async def listar_lancamentos(
    restaurante_id: str,
    tipo: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"restauranteId": restaurante_id}
    if tipo:
        query["tipo"] = tipo
    try:
        lancamentos: List[Dict[str, Any]] = await db.lancamentos.find(
            query, {"_id": 0}
        ).sort("criadoEm", -1).limit(limit).to_list(length=limit)
    except Exception as e:
        logger.error("Erro listar lancamentos %s: %s", restaurante_id, e)
        raise HTTPException(status_code=500, detail="Erro ao buscar lançamentos")
    return lancamentos

# ─────────────────────────────────────────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────────────────────────────────────────

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=APP_ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Owner-Token", "X-Signature"],
)

async def _timeout_loop() -> None:
    while True:
        try:
            await asyncio.sleep(60)
        except Exception as e:
            logger.error("Timeout loop error: %s", e)
            await asyncio.sleep(60)

@app.on_event("startup")
async def startup_event() -> None:
    asyncio.create_task(_timeout_loop())

@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()
