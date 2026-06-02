import base64
import logging
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel
from ..auth import verify_ai_engine_key, require_tenant_id
from ..config import settings
from ..utils.image_processing import prepare_receipt_image
from ..services.receipt_parser import parse_receipt

logger = logging.getLogger(__name__)

router = APIRouter(tags=["financial"])

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


# ── Modelo para o endpoint JSON (chamado pelo VPS1) ───────────────────────────

class SyncOcrRequest(BaseModel):
    imageBase64: str  # base64 puro (sem data URI prefix)


# ── Endpoint principal — chamado pelo VPS1 (ai.service.js) ───────────────────
# POST /api/v1/ocr/invoice/sync  { imageBase64: "..." }

@router.post("/api/v1/ocr/invoice/sync", dependencies=[Depends(verify_ai_engine_key)])
async def ocr_invoice_sync(
    body: SyncOcrRequest,
    tenant_id: str = Depends(require_tenant_id),
):
    """
    Endpoint principal: recebe imageBase64 do VPS1 e retorna JSON estruturado.
    Usa modelo de visão Ollama (qwen2.5vl) — lê a imagem diretamente sem PaddleOCR.
    """
    raw_b64 = body.imageBase64.strip()
    # Remove prefixo data URI se vier com ele (ex: "data:image/jpeg;base64,...")
    if "," in raw_b64 and raw_b64.startswith("data:"):
        raw_b64 = raw_b64.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(raw_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="imageBase64 inválido")

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="imagem maior que 10MB")
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="imagem vazia")

    try:
        _, b64_processed = prepare_receipt_image(
            image_bytes,
            max_side_px=settings.IMAGE_MAX_SIDE_PX,
            jpeg_quality=settings.IMAGE_JPEG_QUALITY,
        )
    except Exception as e:
        logger.exception("image preprocessing failed")
        raise HTTPException(status_code=400, detail=f"falha ao processar imagem: {e}")

    logger.info("ocr/invoice/sync tenant=%s image_size=%d model=%s",
                tenant_id, len(image_bytes), settings.OLLAMA_MODEL)

    try:
        extracted = await parse_receipt(b64_processed)
    except Exception as e:
        logger.exception("vision call failed")
        raise HTTPException(status_code=502, detail=f"falha no modelo de visão: {e}")

    return {"data": extracted}


# ── Endpoint legado — upload multipart (UI manual) ────────────────────────────

@router.post("/api/v1/financial/interpret-receipt", dependencies=[Depends(verify_ai_engine_key)])
async def interpret_receipt(
    image: UploadFile = File(...),
    tenant_id: str = Depends(require_tenant_id),
):
    """
    Recebe foto de nota fiscal → roda Ollama Vision → retorna JSON estruturado.

    Headers:
      X-AI-Engine-Key: <chave>
      X-Tenant-Id: <uuid>
    Body: multipart/form-data com campo `image`.
    """
    if image.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"content-type {image.content_type} não suportado. Use {ALLOWED_CONTENT_TYPES}",
        )

    raw = await image.read()
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="imagem maior que 10MB")
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="imagem vazia")

    try:
        _, b64 = prepare_receipt_image(
            raw,
            max_side_px=settings.IMAGE_MAX_SIDE_PX,
            jpeg_quality=settings.IMAGE_JPEG_QUALITY,
        )
    except Exception as e:
        logger.exception("image preprocessing failed")
        raise HTTPException(status_code=400, detail=f"falha ao processar imagem: {e}")

    logger.info("interpret-receipt tenant=%s image_size=%d", tenant_id, len(raw))

    try:
        extracted = await parse_receipt(b64)
    except Exception as e:
        logger.exception("vision call failed")
        raise HTTPException(status_code=502, detail=f"falha no modelo de visão: {e}")

    return {"data": extracted}
