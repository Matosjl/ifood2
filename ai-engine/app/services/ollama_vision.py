import asyncio
import logging
import httpx
from ..config import settings

logger = logging.getLogger(__name__)

_semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_VISION)


async def call_vision(prompt: str, image_b64: str, format_json: bool | None = None) -> str:
    """
    Chama Ollama /api/generate com modelo de visão.
    Limita concorrência via semáforo (proteção pra VPS de 8GB RAM).

    format_json:
      None (default) → usa settings.OLLAMA_FORMAT_JSON
      True/False     → override explícito

    Fallback automático: se o modelo retornar 500 com format=json (ex: moondream
    não suporta), tenta novamente sem format=json.
    """
    use_json = settings.OLLAMA_FORMAT_JSON if format_json is None else format_json

    def build_payload(with_format: bool) -> dict:
        p = {
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "images": [image_b64],
            "stream": False,
            "options": {"temperature": 0.1, "num_ctx": 4096},
        }
        if with_format:
            p["format"] = "json"
        return p

    async with _semaphore:
        async with httpx.AsyncClient(timeout=settings.OLLAMA_REQUEST_TIMEOUT) as client:
            logger.info("calling Ollama model=%s prompt_len=%d format_json=%s",
                        settings.OLLAMA_MODEL, len(prompt), use_json)
            r = await client.post(f"{settings.OLLAMA_BASE_URL}/api/generate",
                                  json=build_payload(use_json))

            # Fallback: se com format=json deu 500, tenta sem
            if r.status_code == 500 and use_json:
                logger.warning("ollama 500 com format=json — retentando sem format")
                r = await client.post(f"{settings.OLLAMA_BASE_URL}/api/generate",
                                      json=build_payload(False))

            if r.status_code >= 400:
                logger.error("ollama HTTP %d body=%s", r.status_code, r.text[:500])
            r.raise_for_status()
            data = r.json()
            return data.get("response", "").strip()


async def health_check() -> dict:
    """Verifica se Ollama tá rodando e se o modelo está disponível."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            r.raise_for_status()
            tags = r.json().get("models", [])
            model_names = [m.get("name", "") for m in tags]
            model_present = any(settings.OLLAMA_MODEL in n for n in model_names)
            return {
                "ollama_up": True,
                "model_loaded": model_present,
                "model_target": settings.OLLAMA_MODEL,
                "models_available": model_names,
            }
    except Exception as e:
        return {"ollama_up": False, "error": str(e), "model_target": settings.OLLAMA_MODEL}
