import logging
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from ..auth import verify_ai_engine_key, require_tenant_id
from ..config import settings
from ..utils.image_processing import prepare_receipt_image
from ..services.receipt_parser import parse_receipt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/financial", tags=["financial"])

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


@router.post("/interpret-receipt", dependencies=[Depends(verify_ai_engine_key)])
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
