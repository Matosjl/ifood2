import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .routers import financial
from .services.ollama_vision import health_check

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

app = FastAPI(
    title="ZapFome AI Engine",
    description="OCR de notas fiscais e processamento de IA via Ollama (VPS2)",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(financial.router)


@app.get("/health")
async def health():
    ollama_status = await health_check()
    return {
        "status": "ok" if ollama_status.get("ollama_up") else "degraded",
        "ollama": ollama_status,
        "concurrency_limit": settings.MAX_CONCURRENT_VISION,
    }


@app.get("/")
async def root():
    return {"service": "ZapFome AI Engine", "version": "0.1.0"}
