from fastapi import FastAPI, APIRouter, HTTPException, Header, Request, UploadFile, File, Body
import base64
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
from fastapi.responses import JSONResponse
import uuid
from datetime import datetime, timezone
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# ─────────────────────────────────────────────────────────────────────────────
# SETUP
# ─────────────────────────────────────────────────────────────────────────────

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

# ── Rate Limiter ─────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="ZapFome API", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

api_router = APIRouter(prefix="/api")

# ── OpenAI / LangGraph ───────────────────────────────────────────────────────
OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_MODEL: str = os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip()

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES
# ─────────────────────────────────────────────────────────────────────────────

TIPOS_PEDIDO_VALIDOS = {"retirada", "entrega", "comer_aqui", "delivery"}
PAGAMENTOS_VALIDOS = {
    "dinheiro", "pix", "cartao", "credito", "debito", "outros",
    "cartão de crédito", "cartão de débito", "vale refeição",
    "cartao de credito", "cartao de debito", "vale refeicao"
}
STATUS_PEDIDO_VALIDOS = [
    "pendente", "aceito", "confirmado", "em_preparo",
    "pronto", "em_entrega", "entregue", "cancelado"
]

# ─────────────────────────────────────────────────────────────────────────────
# MODELOS
# ─────────────────────────────────────────────────────────────────────────────

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

class PrintReceiptRequest(BaseModel):
    impressora: Optional[str] = "Knup KP-IM607"
    pedido: Dict[str, Any]
    restaurante: Optional[Dict[str, Any]] = None

class EnderecoEntrega(BaseModel):
    rua: str
    numero: str
    bairro: Optional[str] = None
    cidade: str = "São Paulo"
    complemento: Optional[str] = None
    referencia: Optional[str] = None
    cep: Optional[str] = None

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
    restauranteId: str
    clienteNome: str
    clienteTelefone: Optional[str] = ""
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
        return (v or "dinheiro").lower().strip()

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
    itens: List[Dict[str, Any]]

class EstoqueItem(BaseModel):
    nome: str
    categoria: str
    quantidade: float
    estoqueMinimo: float = 0.0
    precoCusto: float = 0.0
    precoVenda: float
    porKg: bool = False
    foto: Optional[str] = None
    descricao: Optional[str] = None
    destaque: bool = False
    ativo: bool = True

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
    foto: Optional[str] = None
    descricao: Optional[str] = None
    destaque: Optional[bool] = None
    ativo: Optional[bool] = None

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

class AIChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str

class AIChatRequest(BaseModel):
    mensagem: str
    restauranteId: Optional[str] = None
    historico: Optional[List[AIChatMessage]] = None
    modo: Optional[str] = "cliente"  # "cliente" | "operador"

class RestauranteCreate(BaseModel):
    nome: str
    slug: str
    telefone: str = ""
    endereco: str = ""
    cidade: str = ""
    categoria: str = ""
    descricao: str = ""
    logoUrl: Optional[str] = None
    taxaEntrega: float = 5.0
    tempoEstimado: str = "30-45 min"
    ativo: bool = True

class RestauranteUpdate(BaseModel):
    nome: Optional[str] = None
    slug: Optional[str] = None
    telefone: Optional[str] = None
    endereco: Optional[str] = None
    cidade: Optional[str] = None
    categoria: Optional[str] = None
    descricao: Optional[str] = None
    logoUrl: Optional[str] = None
    taxaEntrega: Optional[float] = None
    tempoEstimado: Optional[str] = None
    ativo: Optional[bool] = None

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURAÇÃO E HELPERS
# ─────────────────────────────────────────────────────────────────────────────

STATUS_CHECKS_FALLBACK: List[Dict[str, Any]] = []

OWNER_API_TOKEN: str = os.environ.get("OWNER_API_TOKEN", "").strip()
if not OWNER_API_TOKEN:
    OWNER_API_TOKEN = secrets.token_urlsafe(32)
    logger.warning("OWNER_API_TOKEN não configurado — usando token temporário por sessão.")

RECEIPT_PRINTER_NAME: str = os.environ.get("RECEIPT_PRINTER_NAME", "").strip()
PRINT_TIMEOUT_SEC: int = int(os.environ.get("PRINT_TIMEOUT_SEC", "12"))
PRINT_MAX_CHARS: int = int(os.environ.get("PRINT_MAX_CHARS", "12000"))
API_HMAC_SECRET: str = os.environ.get("API_HMAC_SECRET", "").strip()
TAXA_ENTREGA_PADRAO: float = float(os.environ.get("TAXA_ENTREGA", "5.0"))

# CORS: lê CORS_ORIGINS (docker-compose) OU APP_ALLOWED_ORIGINS — unifica aqui
_cors_raw = os.environ.get("CORS_ORIGINS") or os.environ.get("APP_ALLOWED_ORIGINS", "")
APP_ALLOWED_ORIGINS: List[str] = [
    o.strip()
    for o in _cors_raw.split(",")
    if o.strip()
] or ["http://localhost:3000", "http://127.0.0.1:3000"]


def _require_owner_token(x_owner_token: Optional[str]) -> None:
    received = (x_owner_token or "").strip()
    if not received or not secrets.compare_digest(received, OWNER_API_TOKEN):
        raise HTTPException(status_code=401, detail="Não autorizado")


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
    tipo: str,
    valor: float,
    descricao: str,
    referencia_id: Optional[str] = None,
) -> None:
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

@api_router.get("/health")
async def health() -> Dict[str, Any]:
    """Health check com ping ao MongoDB."""
    try:
        await db.command("ping")
        mongo_ok = True
    except Exception:
        mongo_ok = False
    return {
        "status": "ok" if mongo_ok else "degraded",
        "mongo": mongo_ok,
        "version": "2.0.0",
    }

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate) -> StatusCheck:
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc: Dict[str, Any] = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    try:
        await db.status_checks.insert_one(doc)
    except Exception:
        STATUS_CHECKS_FALLBACK.append(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks() -> List[Dict[str, Any]]:
    try:
        status_checks: List[Dict[str, Any]] = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    except Exception:
        status_checks = list(STATUS_CHECKS_FALLBACK)
    for check in status_checks:
        if isinstance(check.get('timestamp'), str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


# ─────────────────────────────────────────────────────────────────────────────
# IA — OpenAI
# ─────────────────────────────────────────────────────────────────────────────


@api_router.post("/ai/chat")
@limiter.limit("30/minute")
async def ai_chat(
    request: Request,
    body: AIChatRequest,
) -> Dict[str, str]:
    """Chat com agente LangGraph + OpenAI — usa ferramentas reais do banco."""
    from ai_agent import run_agent

    if not OPENAI_API_KEY:
        raise HTTPException(503, "OPENAI_API_KEY não configurado no servidor")

    try:
        historico = [{"role": m.role, "content": m.content} for m in (body.historico or [])]
        resposta = await run_agent(
            mensagem=body.mensagem,
            historico=historico,
            restaurante_id=body.restauranteId,
            modo=body.modo or "cliente",
            openai_api_key=OPENAI_API_KEY,
            openai_model=OPENAI_MODEL,
        )
        logger.info("ai_chat ok restaurante=%s modo=%s", body.restauranteId, body.modo)
        return {"resposta": resposta}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("ai_chat_error: %s", e)
        raise HTTPException(503, f"Erro ao chamar IA: {str(e)[:200]}")


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
            raise HTTPException(status_code=500, detail="Falha ao enviar impressão para o spooler")
        return _print_response(True, "PRINT_SENT", "Impressão enviada com sucesso", {"printer": printer_name or "default"})
    except subprocess.TimeoutExpired:
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
                pass


@api_router.post("/print/queue")
async def enqueue_print(
    body: PrintDirectRequest,
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> Dict[str, Any]:
    _require_owner_token(x_owner_token)
    content = _sanitize_print_content(body.content or "")
    if not content:
        raise HTTPException(status_code=400, detail="Conteúdo de impressão vazio")
    job: Dict[str, Any] = {
        "id":           str(uuid.uuid4()),
        "content":      content,
        "printer_name": body.printer_name or RECEIPT_PRINTER_NAME,
        "criadoEm":     datetime.now(timezone.utc).isoformat(),
        "status":       "pendente",
    }
    try:
        await db.print_queue.insert_one(job)
    except Exception as exc:
        logger.error("Erro ao enfileirar job de impressão: %s", exc)
        raise HTTPException(status_code=500, detail="Erro ao enfileirar job")
    job.pop("_id", None)
    return {"ok": True, "jobId": job["id"]}


@api_router.get("/print/queue")
async def dequeue_print() -> List[Dict[str, Any]]:
    try:
        jobs = await db.print_queue.find({"status": "pendente"}, {"_id": 0}).to_list(length=20)
        if jobs:
            ids = [j["id"] for j in jobs]
            await db.print_queue.update_many(
                {"id": {"$in": ids}},
                {"$set": {"status": "processando"}}
            )
        return jobs
    except Exception as exc:
        logger.error("Erro ao buscar fila de impressão: %s", exc)
        raise HTTPException(status_code=500, detail="Erro ao buscar fila")


@api_router.patch("/print/queue/{job_id}")
async def ack_print_job(job_id: str, status: str = "concluido") -> Dict[str, Any]:
    if status not in ("concluido", "falhou"):
        raise HTTPException(status_code=400, detail="Status inválido")
    await db.print_queue.update_one(
        {"id": job_id},
        {"$set": {"status": status, "atualizadoEm": datetime.now(timezone.utc).isoformat()}}
    )
    return {"ok": True}


@api_router.get("/print/status")
async def print_status() -> Dict[str, Any]:
    try:
        pendente  = await db.print_queue.count_documents({"status": "pendente"})
        concluido = await db.print_queue.count_documents({"status": "concluido"})
        falhou    = await db.print_queue.count_documents({"status": "falhou"})
    except Exception:
        pendente = concluido = falhou = -1
    return {
        "impressora":   RECEIPT_PRINTER_NAME or "não configurada",
        "pendente":     pendente,
        "concluido":    concluido,
        "falhou":       falhou,
    }


def _build_receipt_lines(order: dict, rest: dict) -> list:
    from datetime import datetime as _dt

    def money(v):
        return f"R$ {float(v or 0):.2f}".replace(".", ",")

    L = []
    nome = (rest.get("nome") or "ZapFome").strip()
    L.append({"text": nome, "size": 11, "bold": True, "align": "center", "marginTop": 2})
    if rest.get("cnpj"):
        L.append({"text": f"CNPJ: {rest['cnpj']}", "size": 7, "align": "center"})
    if rest.get("telefone"):
        L.append({"text": f"Tel: {rest['telefone']}", "size": 7, "align": "center"})

    L.append({"sep": True, "marginTop": 3})
    L.append({"text": _dt.now().strftime("%d/%m/%Y  %H:%M"), "size": 7, "align": "center"})

    oid = str(order.get("id") or "").replace("-", "")[-6:].upper() or "??????"
    L.append({"text": f"PEDIDO #{oid}", "size": 13, "bold": True, "align": "center", "marginTop": 1})
    L.append({"sep": True, "marginTop": 3})

    if order.get("agendado") and order.get("horarioAgendado"):
        try:
            dt = _dt.fromisoformat(str(order["horarioAgendado"]).replace("Z", ""))
            L.append({"text": "** AGENDADO **", "size": 9, "bold": True, "align": "center", "marginTop": 2})
            L.append({"text": dt.strftime("%d/%m  %H:%M"), "size": 14, "bold": True, "align": "center"})
            L.append({"sep": True, "marginTop": 2})
        except Exception:
            pass

    cliente = order.get("client") or order.get("clienteNome") or "-"
    tipo_map = {
        "ENTREGA": "Entrega", "RETIRADA": "Retirada", "COMER AQUI": "Comer Aqui",
        "entrega": "Entrega", "retirada": "Retirada", "comer_aqui": "Comer Aqui", "delivery": "Delivery",
    }
    tipo = tipo_map.get(str(order.get("type") or order.get("tipo") or ""), str(order.get("type") or "-"))

    L.append({"text": f"Cliente : {cliente}", "size": 8, "marginTop": 1})
    L.append({"text": f"Tipo    : {tipo}", "size": 8})
    if order.get("telefone"):
        L.append({"text": f"Tel     : {order['telefone']}", "size": 8})
    if order.get("mesa"):
        L.append({"text": f"Mesa    : {order['mesa']}", "size": 9, "bold": True})

    end = order.get("endereco")
    if end and isinstance(end, dict):
        L.append({"sep": True, "marginTop": 3})
        L.append({"text": "ENTREGA:", "size": 7, "bold": True})
        rua = f"{end.get('rua', '')}, {end.get('numero', '')}".strip(", ")
        L.append({"text": rua, "size": 8})
        if end.get("bairro"):
            L.append({"text": end["bairro"], "size": 7})
        if end.get("referencia"):
            L.append({"text": f"Ref: {end['referencia']}", "size": 7})

    L.append({"sep": True, "marginTop": 4})
    L.append({"text": "ITENS DO PEDIDO", "size": 8, "bold": True, "align": "center"})
    L.append({"sep": True, "marginTop": 1})

    itens = order.get("itensCompletos") or order.get("itens") or []
    if itens:
        for item in itens:
            qtd = item.get("qtd", 1)
            nome_item = str(item.get("nome") or item.get("name") or "")[:22]
            preco = float(item.get("precoUnitario") or item.get("salePrice") or 0)
            tot = money(preco * qtd)
            L.append({"text": f"{qtd}x {nome_item}", "size": 8, "marginTop": 1})
            L.append({"text": f"   {tot:>18}", "size": 8})
            if item.get("observacao"):
                L.append({"text": f"   -> {item['observacao'][:30]}", "size": 7})

    L.append({"sep": True, "marginTop": 3})
    total = float(order.get("total") or 0)
    L.append({"text": f"TOTAL:  {money(total)}", "size": 12, "bold": True, "align": "center", "marginTop": 2})
    L.append({"sep": True, "marginTop": 3})
    L.append({"text": "PAGAMENTO:", "size": 7, "bold": True})
    pgtos = order.get("pagamentosDetalhados") or order.get("pagamentos")
    if pgtos and isinstance(pgtos, list):
        for p in pgtos:
            met = str(p.get("metodo") or "")
            val = float(p.get("valor") or 0)
            L.append({"text": f"  {met}: {money(val)}", "size": 8})
            troco = float(p.get("troco") or 0)
            if troco > 0:
                L.append({"text": f"  Troco: {money(troco)}", "size": 7})
    else:
        pay = str(order.get("payment") or order.get("pagamento") or "-")
        L.append({"text": f"  {pay}: {money(total)}", "size": 8})

    if order.get("observacao"):
        L.append({"sep": True, "marginTop": 3})
        L.append({"text": "OBS:", "size": 7, "bold": True})
        L.append({"text": str(order["observacao"])[:60], "size": 8})

    L.append({"sep": True, "marginTop": 5})
    L.append({"text": "Obrigado pela preferencia!", "size": 7, "align": "center"})
    L.append({"text": "ZapFome  |  Delivery", "size": 6, "align": "center"})
    L.append({"text": " ", "size": 8, "marginTop": 22})
    return L


@api_router.post("/print/receipt")
async def print_receipt_gdi(
    body: PrintReceiptRequest,
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> Dict[str, Any]:
    _require_owner_token(x_owner_token)
    if os.name != "nt":
        raise HTTPException(400, "Impressão GDI disponível apenas em Windows")

    printer = (body.impressora or "Knup KP-IM607").replace("'", "")
    lines = _build_receipt_lines(body.pedido, body.restaurante or {})

    import json as _json
    tmp_path = ""
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as f:
            _json.dump(lines, f, ensure_ascii=False)
            tmp_path = f.name

        ps = f"""Add-Type -AssemblyName System.Drawing
$script:L = Get-Content '{tmp_path}' -Encoding UTF8 -Raw | ConvertFrom-Json
$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings.PrinterName = '{printer}'
$pd.add_PrintPage({{
    param($s,$e)
    $y = [float]4
    foreach ($l in $script:L) {{
        $mt = if ($null -ne $l.marginTop) {{ [float]$l.marginTop }} else {{ [float]0 }}
        $y += $mt
        $sz = if ($null -ne $l.size) {{ [float]$l.size }} else {{ [float]8 }}
        if ($l.sep) {{
            $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, [float]0.5)
            $e.Graphics.DrawLine($pen, [float]0, $y, $e.PageBounds.Width, $y)
            $pen.Dispose()
            $y += [float]3
        }} elseif ($null -ne $l.text) {{
            $style = if ($l.bold) {{ [System.Drawing.FontStyle]::Bold }} else {{ [System.Drawing.FontStyle]::Regular }}
            $font  = New-Object System.Drawing.Font('Courier New', $sz, $style)
            $txt   = [string]$l.text
            if ($l.align -eq 'center') {{
                $w = $e.Graphics.MeasureString($txt, $font).Width
                $x = [Math]::Max([float]0, ($e.PageBounds.Width - $w) / [float]2)
                $e.Graphics.DrawString($txt, $font, [System.Drawing.Brushes]::Black, $x, $y)
            }} else {{
                $e.Graphics.DrawString($txt, $font, [System.Drawing.Brushes]::Black, [float]2, $y)
            }}
            $y += $sz + [float]2
            $font.Dispose()
        }}
    }}
    $e.HasMorePages = $false
}})
$pd.Print()
"""
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            logger.error("print_receipt_gdi_error: %s", result.stderr[:400])
            raise HTTPException(500, {"error": result.stderr[:400]})

        logger.info("print_receipt_gdi_ok printer=%s", printer)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        logger.exception("print_receipt_gdi_unexpected")
        raise HTTPException(500, "Erro interno na impressão GDI")
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except Exception:
                pass


# ─────────────────────────────────────────────────────────────────────────────
# PEDIDOS
# ─────────────────────────────────────────────────────────────────────────────

@api_router.post("/pedidos")
@limiter.limit("60/minute")
async def criar_pedido(request: Request, pedido: PedidoCreate) -> Dict[str, str]:
    sem_estoque: List[str] = []
    for item in pedido.itens:
        if not item.id:
            continue
        estoque_item = await db.estoque.find_one(
            {"id": item.id, "restauranteId": pedido.restauranteId},
            {"quantidade": 1, "nome": 1}
        )
        if estoque_item and estoque_item.get("quantidade", 0) < item.qtd:
            sem_estoque.append(estoque_item.get("nome", item.nome))

    if sem_estoque:
        raise HTTPException(
            status_code=409,
            detail=f"Estoque insuficiente: {', '.join(sem_estoque)}. Pedido não registrado."
        )

    pedido_dict: Dict[str, Any] = pedido.model_dump()
    pedido_dict["id"] = str(uuid.uuid4())
    pedido_dict["status"] = "pendente"

    subtotal = sum(i.qtd * i.precoUnitario for i in pedido.itens)
    taxa_entrega = TAXA_ENTREGA_PADRAO if pedido.tipo in ("entrega", "delivery") else 0.0

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
    restaurante_id: str = Query(""),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> Dict[str, List[Dict[str, Any]]]:
    _require_owner_token(x_owner_token)
    if status and status not in STATUS_PEDIDO_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Status inválido. Use: {STATUS_PEDIDO_VALIDOS}")
    query: Dict[str, Any] = {}
    if restaurante_id:
        query["restauranteId"] = restaurante_id
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
async def atualizar_status(
    pedido_id: str,
    update: PedidoStatusUpdate,
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> Dict[str, str]:
    _require_owner_token(x_owner_token)
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

    if update.status == "entregue":
        await _registrar_lancamento_financeiro(
            restaurante_id=restaurante_id, tipo="venda", valor=total,
            descricao=f"Pedido entregue #{pedido_id[:8]}", referencia_id=pedido_id,
        )

    if update.status == "cancelado":
        await _reverter_estoque_pedido(pedido)
        if total > 0:
            await _registrar_lancamento_financeiro(
                restaurante_id=restaurante_id, tipo="cancelamento", valor=total,
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
async def criar_estoque(
    restaurante_id: Annotated[str, Query()],
    item: EstoqueItem,
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> Dict[str, str]:
    _require_owner_token(x_owner_token)
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
async def atualizar_estoque(
    item_id: str,
    update: EstoqueUpdate,
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> Dict[str, str]:
    _require_owner_token(x_owner_token)
    campos = update.model_dump(exclude_unset=True)
    if not campos:
        raise HTTPException(status_code=400, detail="Nenhum campo enviado para atualização")
    for campo in ("quantidade", "precoVenda", "precoCusto", "estoqueMinimo"):
        if campo in campos and campos[campo] is not None and campos[campo] < 0:
            raise HTTPException(status_code=400, detail=f"'{campo}' não pode ser negativo")
    try:
        result = await db.estoque.update_one({"id": item_id}, {"$set": campos})
    except Exception as e:
        logger.error("Erro atualizar estoque %s: %s", item_id, e)
        raise HTTPException(status_code=500, detail="Erro ao atualizar item")
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    return {"status": "atualizado"}


@api_router.delete("/estoque/{item_id}")
async def deletar_estoque(
    item_id: str,
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> Dict[str, str]:
    _require_owner_token(x_owner_token)
    try:
        result = await db.estoque.delete_one({"id": item_id})
    except Exception as e:
        logger.error("Erro deletar estoque %s: %s", item_id, e)
        raise HTTPException(status_code=500, detail="Erro ao deletar item")
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    return {"status": "deletado"}


@api_router.post("/estoque/deduzir")
async def deduzir_estoque(
    deduzir: EstoqueDeducir,
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> Dict[str, Any]:
    _require_owner_token(x_owner_token)
    falhas: List[str] = []
    for item in deduzir.itens:
        item_id: str = str(item.get("itemId", ""))
        qtd: int = int(item.get("qtd", 0))
        if not item_id or qtd <= 0:
            falhas.append(f"itemId='{item_id}' inválido ou qtd={qtd}")
            continue
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
        return {"status": "parcial", "falhas": falhas, "itens_processados": len(deduzir.itens) - len(falhas)}
    return {"status": "deduzido", "itens": len(deduzir.itens)}


# ─────────────────────────────────────────────────────────────────────────────
# WEBSOCKET (per-restaurant pub/sub)
# ─────────────────────────────────────────────────────────────────────────────

# {restaurante_id: [WebSocket, ...]}
_ws_rooms: Dict[str, List[WebSocket]] = {}


@api_router.websocket("/ws/track/{restaurante_id}")
async def websocket_endpoint(websocket: WebSocket, restaurante_id: str) -> None:
    await websocket.accept()
    _ws_rooms.setdefault(restaurante_id, []).append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        room = _ws_rooms.get(restaurante_id, [])
        if websocket in room:
            room.remove(websocket)


async def broadcast_pedido_status(restaurante_id: str, pedido_id: str, status: str) -> None:
    message: Dict[str, str] = {
        "type": "pedido_status_update",
        "restaurante_id": restaurante_id,
        "pedido_id": pedido_id,
        "status": status,
    }
    room = _ws_rooms.get(restaurante_id, [])
    disconnected: List[WebSocket] = []
    for conn in room:
        try:
            await conn.send_json(message)
        except Exception:
            disconnected.append(conn)
    for conn in disconnected:
        if conn in room:
            room.remove(conn)


# ─────────────────────────────────────────────────────────────────────────────
# CARDÁPIO — UPLOAD E CONSULTA
# ─────────────────────────────────────────────────────────────────────────────

_CARDAPIO_ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp"}
_CARDAPIO_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


@api_router.post("/cardapio/upload")
async def upload_cardapio(
    restaurante_id: Annotated[str, Query()],
    file: UploadFile = File(...),
) -> Dict[str, str]:
    if file.content_type not in _CARDAPIO_ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Tipo não permitido: {file.content_type}")
    contents = await file.read()
    if len(contents) > _CARDAPIO_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Arquivo excede 10 MB")
    doc: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "restauranteId": restaurante_id,
        "filename": file.filename or "cardapio",
        "contentType": file.content_type,
        "data": base64.b64encode(contents).decode("utf-8"),
        "tamanhoBytes": len(contents),
        "uploadedAt": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.cardapios.replace_one({"restauranteId": restaurante_id}, doc, upsert=True)
    except Exception as e:
        logger.error("Erro salvar cardapio %s: %s", restaurante_id, e)
        raise HTTPException(status_code=500, detail="Erro ao salvar cardápio")
    return {"id": doc["id"], "filename": doc["filename"], "status": "uploaded"}


@api_router.get("/cardapio/{restaurante_id}")
async def get_cardapio_meta(restaurante_id: str) -> Dict[str, Any]:
    try:
        doc: Optional[Dict[str, Any]] = await db.cardapios.find_one(
            {"restauranteId": restaurante_id}, {"_id": 0, "data": 0}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erro ao buscar cardápio")
    if doc is None:
        raise HTTPException(status_code=404, detail="Nenhum cardápio cadastrado")
    return doc


@api_router.get("/cardapio/{restaurante_id}/arquivo")
async def get_cardapio_arquivo(restaurante_id: str):
    from fastapi.responses import Response
    try:
        doc: Optional[Dict[str, Any]] = await db.cardapios.find_one(
            {"restauranteId": restaurante_id}, {"_id": 0}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erro ao buscar cardápio")
    if doc is None:
        raise HTTPException(status_code=404, detail="Nenhum cardápio cadastrado")
    conteudo = base64.b64decode(doc["data"])
    return Response(
        content=conteudo,
        media_type=doc.get("contentType", "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="{doc["filename"]}"'},
    )


# ─────────────────────────────────────────────────────────────────────────────
# FINANCEIRO
# ─────────────────────────────────────────────────────────────────────────────

@api_router.post("/financeiro/caixa")
async def abrir_caixa(
    caixa: CaixaAbertura,
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> Dict[str, str]:
    _require_owner_token(x_owner_token)
    hoje = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    caixa_existente: Optional[Dict[str, Any]] = await db.caixas.find_one({
        "restauranteId": caixa.restauranteId, "status": "aberto", "abertoEm": {"$gte": hoje},
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
async def caixa_hoje(
    restaurante_id: str,
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> Dict[str, Any]:
    _require_owner_token(x_owner_token)
    hoje = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    try:
        caixa: Optional[Dict[str, Any]] = await db.caixas.find_one(
            {"restauranteId": restaurante_id, "abertoEm": {"$gte": hoje}},
            {"_id": 0}, sort=[("abertoEm", -1)],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erro ao buscar caixa")
    return caixa or {"status": "fechado", "fundo": 0}


@api_router.patch("/financeiro/caixa/{restaurante_id}/fechar")
async def fechar_caixa(
    restaurante_id: str,
    fechamento: CaixaFechamento,
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> Dict[str, Any]:
    _require_owner_token(x_owner_token)
    hoje = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    caixa_aberto: Optional[Dict[str, Any]] = await db.caixas.find_one({
        "restauranteId": restaurante_id, "status": "aberto", "abertoEm": {"$gte": hoje},
    })
    if not caixa_aberto:
        raise HTTPException(status_code=404, detail="Nenhum caixa aberto hoje")

    totalInformado = fechamento.dinheiro + fechamento.pix + fechamento.cartao + fechamento.outros
    try:
        vendas_dia = await db.pedidos.find(
            {"restauranteId": restaurante_id, "status": "entregue", "criadoEm": {"$gte": hoje}},
            {"_id": 0, "total": 1}
        ).to_list(None)
        cancelados_dia = await db.pedidos.find(
            {"restauranteId": restaurante_id, "status": "cancelado", "criadoEm": {"$gte": hoje}},
            {"_id": 0, "total": 1}
        ).to_list(None)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erro ao calcular fechamento")

    totalVendido: float = sum(float(p.get("total", 0)) for p in vendas_dia)
    totalCancelado: float = sum(float(p.get("total", 0)) for p in cancelados_dia)

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
    return {
        "status": "fechado",
        "totalVendido": totalVendido,
        "totalCancelado": totalCancelado,
        "totalInformado": totalInformado,
        "diferenca": totalInformado - totalVendido,
    }


@api_router.post("/financeiro/venda")
async def registrar_venda(
    payload: Dict[str, Any] = Body(...),
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> Dict[str, Any]:
    _require_owner_token(x_owner_token)
    try:
        doc = {
            **payload,
            "tipo": "venda",
            "criadoEm": payload.get("finalizadoEm") or datetime.now(timezone.utc).isoformat(),
        }
        doc.pop("_id", None)
        await db.lancamentos.insert_one(doc)
        restaurante_id = payload.get("restauranteId", "")
        if restaurante_id:
            await db.caixas.update_one(
                {"restauranteId": restaurante_id, "status": "aberto"},
                {"$inc": {"totalVendido": float(payload.get("total", 0))}},
            )
        return {"status": "registrado"}
    except Exception as exc:
        logger.error("Erro ao registrar venda: %s", exc)
        raise HTTPException(status_code=500, detail="Erro ao registrar venda")


@api_router.get("/financeiro/lancamentos/{restaurante_id}")
async def listar_lancamentos(
    restaurante_id: str,
    tipo: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> List[Dict[str, Any]]:
    _require_owner_token(x_owner_token)
    query: Dict[str, Any] = {"restauranteId": restaurante_id}
    if tipo:
        query["tipo"] = tipo
    try:
        lancamentos = await db.lancamentos.find(query, {"_id": 0}).sort("criadoEm", -1).limit(limit).to_list(length=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erro ao buscar lançamentos")
    return lancamentos


# ─────────────────────────────────────────────────────────────────────────────
# RESTAURANTES — CRUD
# ─────────────────────────────────────────────────────────────────────────────

@api_router.get("/restaurantes")
async def listar_restaurantes() -> List[Dict[str, Any]]:
    try:
        docs = await db.restaurantes.find({}, {"_id": 0}).to_list(length=200)
        return docs
    except Exception as exc:
        logger.error("Erro ao listar restaurantes: %s", exc)
        raise HTTPException(status_code=500, detail="Erro ao buscar restaurantes")


@api_router.post("/restaurantes", status_code=201)
async def criar_restaurante(
    body: RestauranteCreate,
    x_owner_token: Optional[str] = Header(default=None, alias="X-Owner-Token"),
) -> Dict[str, Any]:
    _require_owner_token(x_owner_token)
    try:
        slug_existente = await db.restaurantes.find_one({"slug": body.slug}, {"_id": 0})
        if slug_existente:
            raise HTTPException(status_code=409, detail=f"Slug '{body.slug}' já está em uso.")
        doc: Dict[str, Any] = body.model_dump()
        doc["id"] = str(uuid.uuid4())
        doc["criadoEm"] = datetime.now(timezone.utc).isoformat()
        doc["atualizadoEm"] = doc["criadoEm"]
        await db.restaurantes.insert_one(doc)
        doc.pop("_id", None)
        return doc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Erro ao criar restaurante: %s", exc)
        raise HTTPException(status_code=500, detail="Erro ao criar restaurante")


@api_router.get("/restaurantes/{restaurante_id}")
async def buscar_restaurante(restaurante_id: str) -> Dict[str, Any]:
    try:
        doc = await db.restaurantes.find_one(
            {"$or": [{"id": restaurante_id}, {"slug": restaurante_id}]}, {"_id": 0}
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Restaurante não encontrado")
        return doc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Erro ao buscar restaurante")


@api_router.patch("/restaurantes/{restaurante_id}")
async def atualizar_restaurante(restaurante_id: str, body: RestauranteUpdate) -> Dict[str, Any]:
    campos = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not campos:
        raise HTTPException(status_code=400, detail="Nenhum campo enviado para atualização")
    if "slug" in campos:
        existente = await db.restaurantes.find_one(
            {"slug": campos["slug"], "id": {"$ne": restaurante_id}}, {"_id": 0}
        )
        if existente:
            raise HTTPException(status_code=409, detail=f"Slug '{campos['slug']}' já está em uso.")
    campos["atualizadoEm"] = datetime.now(timezone.utc).isoformat()
    try:
        result = await db.restaurantes.update_one(
            {"$or": [{"id": restaurante_id}, {"slug": restaurante_id}]},
            {"$set": campos}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Restaurante não encontrado")
        doc = await db.restaurantes.find_one(
            {"$or": [{"id": restaurante_id}, {"slug": restaurante_id}]}, {"_id": 0}
        )
        return doc or {}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Erro ao atualizar restaurante")


@api_router.delete("/restaurantes/{restaurante_id}", status_code=204)
async def deletar_restaurante(restaurante_id: str) -> None:
    try:
        result = await db.restaurantes.delete_one(
            {"$or": [{"id": restaurante_id}, {"slug": restaurante_id}]}
        )
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Restaurante não encontrado")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Erro ao deletar restaurante")


# ─────────────────────────────────────────────────────────────────────────────
# ENTREGADOR
# ─────────────────────────────────────────────────────────────────────────────

@api_router.post("/entregador/despachar")
async def despachar_entregador(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    try:
        doc = {**payload, "status": "despachado", "criadoEm": datetime.now(timezone.utc).isoformat()}
        doc.pop("_id", None)
        result = await db.despachos.insert_one(doc)
        return {"status": "despachado", "id": str(result.inserted_id)}
    except Exception as exc:
        logger.error("Erro ao despachar entregador: %s", exc)
        raise HTTPException(status_code=500, detail="Erro ao despachar")


@api_router.get("/entregador/{entregador_id}/pedidos")
async def pedidos_entregador(entregador_id: str) -> List[Dict[str, Any]]:
    try:
        docs = await db.despachos.find(
            {"entregadorId": entregador_id, "status": "despachado"}, {"_id": 0}
        ).sort("criadoEm", -1).to_list(length=50)
        return docs
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Erro ao buscar pedidos")


# ─────────────────────────────────────────────────────────────────────────────
# APP SETUP — CORS + INDEXES
# ─────────────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=APP_ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Owner-Token", "X-Signature", "Authorization"],
)

app.include_router(api_router)


async def _create_indexes() -> None:
    """Cria índices necessários para performance. Idempotente."""
    try:
        # Pedidos
        await db.pedidos.create_index([("restauranteId", 1), ("status", 1)])
        await db.pedidos.create_index([("restauranteId", 1), ("criadoEm", -1)])
        await db.pedidos.create_index([("id", 1)], unique=True, sparse=True)

        # Estoque
        await db.estoque.create_index([("restauranteId", 1), ("categoria", 1)])
        await db.estoque.create_index([("id", 1)], unique=True, sparse=True)
        await db.estoque.create_index([("restauranteId", 1), ("nome", 1)], unique=True, sparse=True)

        # Restaurantes
        await db.restaurantes.create_index([("slug", 1)], unique=True, sparse=True)
        await db.restaurantes.create_index([("id", 1)], unique=True, sparse=True)

        # Financeiro
        await db.lancamentos.create_index([("restauranteId", 1), ("criadoEm", -1)])
        await db.caixas.create_index([("restauranteId", 1), ("status", 1), ("abertoEm", -1)])

        # Fila de impressão — TTL: remove jobs concluídos após 24h
        await db.print_queue.create_index([("status", 1)])
        await db.print_queue.create_index(
            [("criadoEm", 1)],
            expireAfterSeconds=86400,
            partialFilterExpression={"status": {"$in": ["concluido", "falhou"]}},
        )

        logger.info("MongoDB indexes criados com sucesso")
    except Exception as e:
        logger.error("Erro ao criar indexes: %s", e)


@app.on_event("startup")
async def startup_event() -> None:
    await _create_indexes()
    # Injeta banco no agente LangGraph
    from ai_agent import init_agent
    init_agent(db)
    logger.info("ZapFome API v2.0 iniciada | LangGraph+OpenAI model: %s | CORS: %s",
                OPENAI_MODEL, APP_ALLOWED_ORIGINS)


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()
    logger.info("Conexão MongoDB encerrada")
