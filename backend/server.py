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
from typing import List, Optional, Dict, Any
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()