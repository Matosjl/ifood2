# ═══════════════════════════════════════════════════════════════════════════════
# Dockerfile otimizado para VPS barata — ZapFome Backend (FastAPI)
# Base: python:3.11-slim (menor consumo de RAM/disco que images padrão)
# ═══════════════════════════════════════════════════════════════════════════════

# ── Estágio 1: Builder (instala dependências e compila se necessário) ──────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Instala dependências de sistema necessárias para compilar pacotes Python
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Cria virtualenv para isolar dependências
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Instala dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Estágio 2: Runtime (imagem final enxuta) ───────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Variáveis de ambiente para otimização Python em containers
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Copia apenas o virtualenv do builder (sem compiladores)
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copia código da aplicação
COPY . .
RUN chmod +x /app/entrypoint.sh

# Porta exposta pelo Uvicorn
EXPOSE 8000

# Healthcheck leve (evita keep-alives pesados)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# Comando de inicialização: 1 worker Uvicorn (economiza RAM em VPS pequena)
# Em produção com mais RAM, aumente --workers $(nproc)
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers"]

