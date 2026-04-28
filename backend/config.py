"""
Configurações centralizadas do ZapFome (iFood 2.0).
Todas as variáveis sensíveis vêm do ambiente para manter o container stateless.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
_env_path = ROOT_DIR / ".env"
if _env_path.exists():
    load_dotenv(_env_path)

# ── Banco de Dados ──────────────────────────────────────────────────────────
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "ifood2")

# ── Autenticação ────────────────────────────────────────────────────────────
OWNER_PASSWORD = os.environ.get("OWNER_PASSWORD", "troque_esta_senha_agora")
JWT_SECRET = os.environ.get("JWT_SECRET", "ajax-jwt-secret")
JWT_EXPIRE_HOURS = int(os.environ.get("JWT_EXPIRE_HOURS", "8"))

# ── Evolution API (WhatsApp) ───────────────────────────────────────────────
EVOLUTION_API_URL = os.environ.get("EVOLUTION_API_URL", "")
EVOLUTION_API_KEY = os.environ.get("EVOLUTION_API_KEY", "")
EVOLUTION_INSTANCE = os.environ.get("EVOLUTION_INSTANCE", "")

# ── Web Push (VAPID) ───────────────────────────────────────────────────────
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_CLAIMS_EMAIL = os.environ.get("VAPID_CLAIMS_EMAIL", "admin@ifood2.local")

# ── IA / LLM (Ollama ou LM Studio) ─────────────────────────────────────────
# Exemplos:
#   Ollama local (PC): http://192.168.1.10:11434/api/generate
#   LM Studio local (PC): http://192.168.1.10:1234/v1/chat/completions
OLLAMA_API_URL = os.environ.get("OLLAMA_API_URL", "")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")

# ── Celery / Redis ──────────────────────────────────────────────────────────
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", REDIS_URL)

# ── CORS ────────────────────────────────────────────────────────────────────
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

