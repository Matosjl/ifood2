from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, Request, Query, HTTPException, Depends, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import socketio
import os
import logging
import json
import base64
import jwt as pyjwt
from passlib.context import CryptContext
from openai import AsyncOpenAI
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Dict, Any, Literal
import uuid
import re
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ['DB_NAME']]

# OpenAI
openai_client = AsyncOpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))

# Socket.io (CORS aberto; restrinja em produção via CORS_ORIGINS)
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
)

# Auth config
JWT_SECRET = os.environ.get("JWT_SECRET", "troque_em_producao")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "admin123")

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()

def create_token(username: str) -> str:
    payload = {"sub": username, "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)}
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def require_auth(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    try:
        payload = pyjwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s — %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
)
logger = logging.getLogger(__name__)

# Rate limiter (in-memory; swap for Redis in multi-process deploys)
limiter = Limiter(key_func=get_remote_address, default_limits=[])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class OrderItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    quantity: int = Field(default=1, ge=1, le=9999)
    unit_price: float = Field(default=0.0, ge=0.0)
    sale_type: str = Field(default="unit")
    weight_kg: Optional[float] = Field(default=None, ge=0.0)
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name não pode ser vazio ou apenas espaços")
        return v

    @field_validator("sale_type")
    @classmethod
    def valid_sale_type(cls, v: str) -> str:
        if v not in ("unit", "kg"):
            raise ValueError("sale_type deve ser 'unit' ou 'kg'")
        return v


class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    order_number: int = 0
    customer_phone: str
    customer_name: Optional[str] = None
    address: Optional[str] = None
    items: List[OrderItem] = []
    total: float = 0.0
    status: str = "pending"
    raw_message: str = ""
    ai_response: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OrderStatusUpdate(BaseModel):
    status: Literal["pending", "confirmed", "preparing", "delivered", "cancelled"]


# ---------------------------------------------------------------------------
# Auth models
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------------------------------------------------------------------------
# Stock models
# ---------------------------------------------------------------------------

class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name não pode ser vazio ou apenas espaços")
        return v

class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    image_base64: Optional[str] = None
    sale_type: str = "unit"          # "unit" | "kg"
    cost_price: float = 0.0
    sale_price: float = 0.0
    margin_pct: float = 0.0          # calculado automaticamente
    stock_qty: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category_id: Optional[str] = None
    sale_type: str = Field(default="unit")
    cost_price: float = Field(default=0.0, ge=0.0)
    sale_price: float = Field(default=0.0, ge=0.0)
    stock_qty: float = Field(default=0.0, ge=0.0)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name não pode ser vazio ou apenas espaços")
        return v

    @field_validator("sale_type")
    @classmethod
    def valid_sale_type(cls, v: str) -> str:
        if v not in ("unit", "kg"):
            raise ValueError("sale_type deve ser 'unit' ou 'kg'")
        return v

class StockMovement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    product_id: str
    product_name: str
    quantity: float
    movement_type: str               # "in" | "out" | "replenishment"
    reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ReplenishRequest(BaseModel):
    quantity: float = Field(..., gt=0.0)
    reason: Optional[str] = Field(default="Reposição manual", max_length=300)


class ManualOrderItem(BaseModel):
    product_id: str = Field(..., min_length=1)
    quantity: int = Field(default=1, ge=1, le=9999)
    weight_kg: Optional[float] = Field(default=None, ge=0.0)
    notes: Optional[str] = Field(default=None, max_length=500)


class ManualOrderCreate(BaseModel):
    customer_name: Optional[str] = Field(default=None, max_length=200)
    customer_phone: str = Field(default="manual", max_length=50)
    address: Optional[str] = Field(default=None, max_length=500)
    items: List[ManualOrderItem] = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# AI helper
# ---------------------------------------------------------------------------

ORDER_SYSTEM_PROMPT = """Você é um assistente de restaurante que interpreta pedidos recebidos via WhatsApp.

Quando o cliente enviar um pedido, retorne SOMENTE este JSON:
{
  "is_order": true,
  "address": "endereço mencionado ou null",
  "items": [
    {
      "name": "nome do item",
      "quantity": 1,
      "unit_price": 0.0,
      "sale_type": "unit",
      "weight_kg": null,
      "notes": "observação opcional"
    }
  ],
  "total": 0.0,
  "reply": "mensagem amigável de confirmação para o cliente"
}

Regras para sale_type:
- "unit" para itens vendidos por unidade (esfiha, refrigerante, etc.)
- "kg" para itens vendidos por peso (carne, peixe, etc.)
- Se for "kg", preencha weight_kg com o peso mencionado (ex: 0.5 para 500g)
- Se for "kg" sem peso mencionado, deixe weight_kg como null
- unit_price deve ser o preço por unidade ou preço por kg, conforme o caso

Se NÃO for um pedido, retorne SOMENTE:
{
  "is_order": false,
  "reply": "resposta amigável para o cliente"
}

Use português do Brasil. Retorne somente JSON sem markdown."""


async def send_whatsapp_reply(to_phone: str, text: str) -> None:
    """Send a WhatsApp message back to the customer (only if API credentials are set)."""
    phone_number_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
    access_token = os.environ.get("WHATSAPP_ACCESS_TOKEN")
    if not phone_number_id or not access_token:
        return
    import httpx
    url = f"https://graph.facebook.com/v19.0/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {"body": text},
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload, headers={"Authorization": f"Bearer {access_token}"})
        if resp.status_code != 200:
            logger.error("WhatsApp reply failed: %s", resp.text)


async def next_order_number() -> int:
    result = await db.counters.find_one_and_update(
        {"_id": "order_number"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return result["seq"]


async def deduct_stock_for_order(order_doc: dict) -> list[str]:
    """
    Atomically deduct stock for each item using findOneAndUpdate with stock filter.
    If any item has insufficient stock, rolls back already-deducted items.
    Returns empty list on success, list of error strings on failure.
    """
    deducted: list[tuple[str, str, float]] = []  # (product_id, product_name, qty)

    for item in order_doc.get("items", []):
        name_pattern = re.compile(re.escape(item["name"]), re.IGNORECASE)
        product = await db.products.find_one({"name": name_pattern}, {"_id": 0})
        if not product:
            continue  # not in catalog → no stock to track

        qty: float = (
            float(item.get("weight_kg") or 0)
            if item.get("sale_type") == "kg"
            else float(item.get("quantity", 1))
        )
        if qty <= 0:
            continue

        # Single atomic operation: check stock AND decrement in one round-trip.
        # If stock_qty < qty the filter won't match → returns None.
        updated = await db.products.find_one_and_update(
            {"id": product["id"], "stock_qty": {"$gte": qty}},
            {"$inc": {"stock_qty": -qty}},
        )

        if updated is None:
            # Insufficient stock — roll back every deduction done so far
            for pid, pname, rolled_qty in deducted:
                await db.products.update_one({"id": pid}, {"$inc": {"stock_qty": rolled_qty}})
                logger.warning("Stock rollback: %s +%.2f (order rollback)", pname, rolled_qty)
            unit = "kg" if item.get("sale_type") == "kg" else "un"
            current = product.get("stock_qty", 0.0)
            return [
                f"Estoque insuficiente para '{item['name']}': "
                f"disponível {current:.2f}{unit}, solicitado {qty:.2f}{unit}."
            ]

        deducted.append((product["id"], product["name"], qty))
        logger.info("Stock deducted: %s −%.2f (order #%s)", product["name"], qty, order_doc.get("order_number", ""))

        movement = StockMovement(
            product_id=product["id"],
            product_name=product["name"],
            quantity=qty,
            movement_type="out",
            reason=f"Pedido #{order_doc.get('order_number', '')}",
        )
        mv_doc = movement.model_dump()
        mv_doc["created_at"] = mv_doc["created_at"].isoformat()
        await db.stock_movements.insert_one(mv_doc)

    return []


async def parse_order_with_ai(message: str, customer_name: Optional[str]) -> Dict[str, Any]:
    user_content = f"[Cliente: {customer_name}]\n{message}" if customer_name else message
    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": ORDER_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            max_tokens=512,
        )
        raw = response.choices[0].message.content.strip()
        return json.loads(raw)
    except Exception as exc:
        logger.error("AI call failed: %s", exc)
        return {
            "is_order": False,
            "reply": "Ops! Tivemos um problema interno. Tente novamente em instantes.",
        }


# ---------------------------------------------------------------------------
# FastAPI app + router
# ---------------------------------------------------------------------------

# ── Structured request logging ──────────────────────────────────────────────
class _RequestLogger(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = datetime.now(timezone.utc)
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
            return JSONResponse(status_code=500, content={"message": "Erro interno do servidor. Tente novamente."})
        ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000
        logger.info("%s %s %d %.0fms %s", request.method, request.url.path, response.status_code, ms,
                    request.client.host if request.client else "-")
        return response


@asynccontextmanager
async def _lifespan(application: FastAPI):
    # Startup
    try:
        await db.command("ping")
        logger.info("MongoDB connection OK — db=%s", os.environ.get("DB_NAME"))
    except Exception as exc:
        logger.error("MongoDB connection FAILED: %s", exc)
    yield
    # Shutdown
    mongo_client.close()
    logger.info("MongoDB connection closed")


app = FastAPI(title="iFood2 API", version="1.0.0", lifespan=_lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api_router = APIRouter(prefix="/api")


# ── Validation error → readable JSON ────────────────────────────────────────
@app.exception_handler(RequestValidationError)
async def _validation_handler(request: Request, exc: RequestValidationError):
    logger.warning("Validation error %s %s: %s", request.method, request.url.path, exc.errors())
    return JSONResponse(
        status_code=422,
        content={"message": "Dados inválidos. Verifique os campos enviados.", "detail": exc.errors()},
    )


# ---------------------------------------------------------------------------
# Status routes (originais)
# ---------------------------------------------------------------------------

@api_router.get("/")
async def root():
    return {"message": "Hello World"}


@api_router.get("/health")
async def health_check():
    """Liveness probe — used by Docker / load balancers."""
    try:
        await db.command("ping")
        return {"status": "ok", "db": "connected"}
    except Exception as exc:
        logger.error("Health check failed: %s", exc)
        return JSONResponse(status_code=503, content={"status": "error", "db": "unreachable"})


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.model_dump())
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    docs = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for d in docs:
        if isinstance(d.get('timestamp'), str):
            d['timestamp'] = datetime.fromisoformat(d['timestamp'])
    return docs


# ---------------------------------------------------------------------------
# Orders routes
# ---------------------------------------------------------------------------

@api_router.post("/orders", response_model=Order)
@limiter.limit("60/minute")
async def create_order_manual(request: Request, body: ManualOrderCreate, _: str = Depends(require_auth)):
    order_items: list[OrderItem] = []
    total = 0.0

    for mi in body.items:
        product = await db.products.find_one({"id": mi.product_id}, {"_id": 0})
        if not product:
            raise HTTPException(404, f"Produto {mi.product_id} não encontrado")

        if product["sale_type"] == "kg":
            wkg = mi.weight_kg or 0.0
            line_total = product["sale_price"] * wkg
            order_items.append(OrderItem(
                name=product["name"],
                quantity=1,
                unit_price=product["sale_price"],
                sale_type="kg",
                weight_kg=wkg,
                notes=mi.notes,
            ))
        else:
            line_total = product["sale_price"] * mi.quantity
            order_items.append(OrderItem(
                name=product["name"],
                quantity=mi.quantity,
                unit_price=product["sale_price"],
                sale_type="unit",
                notes=mi.notes,
            ))
        total += line_total

    order = Order(
        order_number=await next_order_number(),
        customer_phone=body.customer_phone or "manual",
        customer_name=body.customer_name,
        address=body.address,
        items=order_items,
        total=round(total, 2),
        status="pending",
    )
    doc = order.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["items"] = [i.model_dump() for i in order_items]
    await db.orders.insert_one(doc)

    payload = {
        "id": order.id,
        "order_number": order.order_number,
        "customer_phone": order.customer_phone,
        "customer_name": order.customer_name,
        "address": order.address,
        "items": doc["items"],
        "total": order.total,
        "status": order.status,
        "created_at": doc["created_at"],
    }
    await sio.emit("novo_pedido", payload)
    logger.info("Manual order created: %s", order.id)
    return order


@api_router.get("/orders", response_model=List[Order])
async def list_orders():
    docs = await db.orders.find({}, {"_id": 0}).to_list(1000)
    for d in docs:
        if isinstance(d.get('created_at'), str):
            d['created_at'] = datetime.fromisoformat(d['created_at'])
    return docs


@api_router.get("/orders/{order_id}", response_model=Order)
async def get_order(order_id: str):
    doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    if isinstance(doc.get('created_at'), str):
        doc['created_at'] = datetime.fromisoformat(doc['created_at'])
    return doc


@api_router.patch("/orders/{order_id}/status", response_model=Order)
async def update_order_status(order_id: str, body: OrderStatusUpdate):
    doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")

    # Deduct stock when confirming
    if body.status == "confirmed":
        stock_errors = await deduct_stock_for_order(doc)
        if stock_errors:
            raise HTTPException(status_code=400, detail={"errors": stock_errors})

    await db.orders.update_one({"id": order_id}, {"$set": {"status": body.status}})
    doc["status"] = body.status

    # Auto-reply when order is confirmed
    if body.status == "confirmed" and doc.get("customer_phone"):
        num = doc.get("order_number", "")
        items_text = ", ".join(
            f"{i.get('quantity')}x {i.get('name')}" for i in doc.get("items", [])
        )
        total = doc.get("total", 0)
        reply = (
            f"✅ Pedido #{num} confirmado!\n"
            f"{items_text}\n"
            f"Total: R$ {total:.2f}\n"
            f"Tempo estimado: 30min. Obrigado! 🛵"
        )
        await send_whatsapp_reply(doc["customer_phone"], reply)

    # Emit Socket.io event
    await sio.emit("atualizar_status", {"order_id": order_id, "status": body.status})
    logger.info("atualizar_status emitted for order %s → %s", order_id, body.status)

    if isinstance(doc.get('created_at'), str):
        doc['created_at'] = datetime.fromisoformat(doc['created_at'])
    return doc


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@api_router.post("/auth/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest):
    if body.username != ADMIN_USER or body.password != ADMIN_PASS:
        logger.warning("Failed login attempt for user '%s' from %s", body.username, request.client.host if request.client else "-")
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos")
    logger.info("Successful login: %s", body.username)
    return TokenResponse(access_token=create_token(body.username))


# ---------------------------------------------------------------------------
# Category routes
# ---------------------------------------------------------------------------

@api_router.get("/categories", response_model=List[Category])
async def list_categories(_: str = Depends(require_auth)):
    return await db.categories.find({}, {"_id": 0}).to_list(500)

@api_router.post("/categories", response_model=Category)
async def create_category(body: CategoryCreate, _: str = Depends(require_auth)):
    cat = Category(name=body.name)
    await db.categories.insert_one(cat.model_dump())
    return cat

@api_router.patch("/categories/{cat_id}")
async def update_category(cat_id: str, body: CategoryCreate, _: str = Depends(require_auth)):
    result = await db.categories.update_one({"id": cat_id}, {"$set": {"name": body.name}})
    if result.matched_count == 0:
        raise HTTPException(404, "Categoria não encontrada")
    return {"ok": True}

@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, _: str = Depends(require_auth)):
    await db.categories.delete_one({"id": cat_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Product routes
# ---------------------------------------------------------------------------

def calc_margin(cost: float, sale: float) -> float:
    if cost <= 0:
        return 0.0
    return round(((sale - cost) / cost) * 100, 2)

@api_router.get("/products", response_model=List[Product])
async def list_products(_: str = Depends(require_auth)):
    docs = await db.products.find({}, {"_id": 0}).to_list(1000)
    for d in docs:
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
    return docs

@api_router.post("/products", response_model=Product)
async def create_product(body: ProductCreate, _: str = Depends(require_auth)):
    cat_name = None
    if body.category_id:
        cat = await db.categories.find_one({"id": body.category_id}, {"_id": 0})
        cat_name = cat["name"] if cat else None

    product = Product(
        **body.model_dump(),
        category_name=cat_name,
        margin_pct=calc_margin(body.cost_price, body.sale_price),
    )
    doc = product.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.products.insert_one(doc)
    return product

@api_router.patch("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, body: ProductCreate, _: str = Depends(require_auth)):
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Produto não encontrado")

    cat_name = doc.get("category_name")
    if body.category_id:
        cat = await db.categories.find_one({"id": body.category_id}, {"_id": 0})
        cat_name = cat["name"] if cat else None

    updates = {
        **body.model_dump(),
        "category_name": cat_name,
        "margin_pct": calc_margin(body.cost_price, body.sale_price),
    }
    await db.products.update_one({"id": product_id}, {"$set": updates})
    doc.update(updates)
    if isinstance(doc.get("created_at"), str):
        doc["created_at"] = datetime.fromisoformat(doc["created_at"])
    return doc

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, _: str = Depends(require_auth)):
    await db.products.delete_one({"id": product_id})
    return {"ok": True}

@api_router.post("/products/{product_id}/image")
async def upload_image(product_id: str, file: UploadFile = File(...), _: str = Depends(require_auth)):
    content = await file.read()
    b64 = "data:" + file.content_type + ";base64," + base64.b64encode(content).decode()
    result = await db.products.update_one({"id": product_id}, {"$set": {"image_base64": b64}})
    if result.matched_count == 0:
        raise HTTPException(404, "Produto não encontrado")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Stock routes
# ---------------------------------------------------------------------------

@api_router.post("/products/{product_id}/replenish", response_model=StockMovement)
async def replenish_stock(product_id: str, body: ReplenishRequest, _: str = Depends(require_auth)):
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Produto não encontrado")

    new_qty = doc.get("stock_qty", 0) + body.quantity
    await db.products.update_one({"id": product_id}, {"$set": {"stock_qty": new_qty}})

    movement = StockMovement(
        product_id=product_id,
        product_name=doc["name"],
        quantity=body.quantity,
        movement_type="replenishment",
        reason=body.reason,
    )
    mv_doc = movement.model_dump()
    mv_doc["created_at"] = mv_doc["created_at"].isoformat()
    await db.stock_movements.insert_one(mv_doc)
    return movement

@api_router.get("/stock/movements", response_model=List[StockMovement])
async def list_movements(product_id: Optional[str] = None, _: str = Depends(require_auth)):
    query = {"product_id": product_id} if product_id else {}
    docs = await db.stock_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    for d in docs:
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
    return docs


# ---------------------------------------------------------------------------
# WhatsApp Webhook
# ---------------------------------------------------------------------------

@api_router.get("/webhook")
async def whatsapp_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
):
    expected = os.environ.get('WHATSAPP_VERIFY_TOKEN', 'meu_token_secreto')
    if hub_mode == "subscribe" and hub_verify_token == expected:
        logger.info("WhatsApp webhook verified.")
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification token mismatch")


@api_router.post("/webhook")
@limiter.limit("120/minute")
async def whatsapp_webhook(request: Request):
    try:
        body = await request.json()
    except Exception:
        return {"status": "ok"}

    logger.info("Webhook payload: %s", json.dumps(body))

    if body.get("object") != "whatsapp_business_account":
        return {"status": "ignored"}

    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            contacts = value.get("contacts", [])
            contact_map: Dict[str, str] = {
                c["wa_id"]: c.get("profile", {}).get("name", "")
                for c in contacts
            }

            for msg in value.get("messages", []):
                if msg.get("type") != "text":
                    continue

                from_phone: str = msg.get("from", "")
                text_body: str = msg.get("text", {}).get("body", "").strip()
                customer_name: Optional[str] = contact_map.get(from_phone)

                if not text_body:
                    continue

                logger.info("Message from %s (%s): %s", from_phone, customer_name, text_body)

                try:
                    ai_result = await parse_order_with_ai(text_body, customer_name)

                    if ai_result.get("is_order"):
                        raw_items = ai_result.get("items", [])
                        items = []
                        for i in raw_items:
                            try:
                                items.append(OrderItem(**i))
                            except Exception as e:
                                logger.warning("Skipping invalid item from AI: %s — %s", i, e)

                        total = ai_result.get("total") or sum(
                            (i.unit_price * (i.weight_kg or 0) if i.sale_type == "kg"
                             else i.unit_price * i.quantity)
                            for i in items
                        )
                        order = Order(
                            order_number=await next_order_number(),
                            customer_phone=from_phone,
                            customer_name=customer_name,
                            address=ai_result.get("address"),
                            items=items,
                            total=total,
                            raw_message=text_body,
                            ai_response=ai_result.get("reply", ""),
                        )
                        doc = order.model_dump()
                        doc['created_at'] = doc['created_at'].isoformat()
                        doc['items'] = [i.model_dump() for i in items]
                        await db.orders.insert_one(doc)

                        payload = {
                            "id": order.id,
                            "order_number": order.order_number,
                            "customer_phone": order.customer_phone,
                            "customer_name": order.customer_name,
                            "address": order.address,
                            "items": doc['items'],
                            "total": order.total,
                            "status": order.status,
                            "created_at": doc['created_at'],
                        }
                        await sio.emit("novo_pedido", payload)
                        logger.info("novo_pedido emitted for order %s", order.id)

                        await send_whatsapp_reply(from_phone, ai_result.get("reply", ""))
                    else:
                        logger.info("Non-order from %s: %s", from_phone, ai_result.get("reply"))
                        await send_whatsapp_reply(from_phone, ai_result.get("reply", ""))

                except Exception as exc:
                    logger.error("Failed to process message from %s: %s", from_phone, exc, exc_info=True)
                    await send_whatsapp_reply(
                        from_phone,
                        "Ops! Tivemos um problema ao processar seu pedido. Tente novamente em instantes."
                    )

    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Mount apps + middleware
# ---------------------------------------------------------------------------

app.include_router(api_router)

# Middleware order: logging wraps everything, then CORS
app.add_middleware(_RequestLogger)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Wrap FastAPI with Socket.io ASGI – Socket.io handles /socket.io/* paths
combined_app = socketio.ASGIApp(sio, other_asgi_app=app)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    reload = os.environ.get("ENV", "production") == "development"
    logger.info("Starting server on port %d (reload=%s)", port, reload)
    uvicorn.run("server:combined_app", host="0.0.0.0", port=port, reload=reload)
