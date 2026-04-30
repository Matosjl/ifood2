"""
Tarefas assíncronas Celery para o ZapFome.
Processamento pesado de IA (Ollama/LM Studio) executado fora do loop do FastAPI.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from celery_app import celery_app
from config import MONGO_URL, DB_NAME, OLLAMA_API_URL, OLLAMA_MODEL
from datetime import timedelta, timezone

logger = logging.getLogger(__name__)

# Cliente síncrono MongoDB para uso dentro de tasks Celery (contexto síncrono)
_sync_mongo_client = None


def _get_sync_db():
    """Retorna database MongoDB em contexto síncrono (Celery worker)."""
    global _sync_mongo_client
    if _sync_mongo_client is None:
        # Fallback para pymongo síncrono quando motor não é adequado
        from pymongo import MongoClient
        _sync_mongo_client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    return _sync_mongo_client[DB_NAME]


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def verificar_timeout_pedidos(self):
    \"\"\"Task background: cancela pedidos pendentes >10min, confirmados >30min sem progresso\"\"\"
    
    db = _get_sync_db()
    
    agora = datetime.now(timezone.utc)
    
    # Pedidos pendentes >10min → cancelar
    pendentes_antigos = agora - timedelta(minutes=10)
    result_pendentes = db.pedidos.update_many(
        {\"status\": \"pendente\", \"criadoEm\": {\"$lt\": pendentes_antigos.isoformat()}},
        {\"$set\": {
            \"status\": \"cancelado\",
            \"atualizadoEm\": agora.isoformat(),
            \"motivoCancelamento\": \"Timeout automático\"
        }}
    )
    
    # Pedidos confirmados >30min → em_preparo
    confirmados_antigos = agora - timedelta(minutes=30)
    result_confirmados = db.pedidos.update_many(
        {\"status\": \"confirmado\", \"criadoEm\": {\"$lt\": confirmados_antigos.isoformat()}},
        {\"$set\": {\"status\": \"em_preparo\", \"atualizadoEm\": agora.isoformat()}}
    )
    
    logger.info(f\"Timeout task: {result_pendentes.modified_count} pendentes cancelados, {result_confirmados.modified_count} confirmados → preparo\")
    
    return {
        \"pendentes_cancelados\": result_pendentes.modified_count,
        \"confirmados_preparo\": result_confirmados.modified_count
    }

@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def processar_pedido_ia(self, pedido_id: str, texto_pedido: str) -> dict:
    """
    Processa o texto de um pedido via IA local (Ollama/LM Studio).

    Args:
        pedido_id: ID do pedido no MongoDB.
        texto_pedido: Texto livre do pedido (ex: "2x X-Salada sem cebola").

    Returns:
        dict com {'pedido_id', 'status', 'resposta_ia', 'salvo_em'}.
    """
    if not OLLAMA_API_URL:
        logger.warning("OLLAMA_API_URL não configurada. Pulando processamento IA.")
        return {
            "pedido_id": pedido_id,
            "status": "skipped",
            "resposta_ia": None,
            "erro": "OLLAMA_API_URL não configurada",
        }

    # ── Prompt de sistema para extração inteligente ─────────────────────────
    system_prompt = (
        "Você é um assistente de restaurante. Analise o pedido abaixo e extraia:\n"
        "1. Lista de itens com quantidade e nome.\n"
        "2. Observações importantes (alergias, ajustes).\n"
        "3. Intenção do cliente (delivery, retirada, agendamento).\n"
        "Responda em JSON compacto."
    )

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": f"{system_prompt}\n\nPedido: {texto_pedido}",
        "stream": False,
        "options": {"temperature": 0.3, "num_predict": 256},
    }

    # Suporte a LM Studio (OpenAI-compatible) — detecta pelo endpoint
    headers = {"Content-Type": "application/json"}
    if "/v1/chat/completions" in OLLAMA_API_URL:
        payload = {
            "model": OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Pedido: {texto_pedido}"},
            ],
            "temperature": 0.3,
            "max_tokens": 256,
            "stream": False,
        }

    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(OLLAMA_API_URL, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

            # Extrai resposta considerando formato Ollama ou OpenAI
            if "response" in data:
                resposta_ia = data["response"]
            elif "choices" in data and len(data["choices"]) > 0:
                resposta_ia = data["choices"][0]["message"]["content"]
            else:
                resposta_ia = str(data)

    except httpx.HTTPStatusError as exc:
        logger.error(f"Erro HTTP na IA: {exc.response.status_code} - {exc.response.text}")
        raise self.retry(exc=exc)
    except httpx.RequestError as exc:
        logger.error(f"Erro de conexão com IA: {exc}")
        raise self.retry(exc=exc)
    except Exception as exc:
        logger.exception("Erro inesperado ao chamar IA")
        raise self.retry(exc=exc)

    # ── Persiste resultado no MongoDB ───────────────────────────────────────
    try:
        db = _get_sync_db()
        db.pedidos.update_one(
            {"id": pedido_id},
            {
                "$set": {
                    "ia_analise": {
                        "texto_pedido": texto_pedido,
                        "resposta": resposta_ia,
                        "modelo": OLLAMA_MODEL,
                        "processado_em": datetime.now(timezone.utc).isoformat(),
                    },
                    "atualizadoEm": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        logger.info(f"IA processada e salva para pedido {pedido_id}")
    except Exception as exc:
        logger.exception(f"Falha ao salvar análise IA no MongoDB para pedido {pedido_id}")
        raise self.retry(exc=exc)

    return {
        "pedido_id": pedido_id,
        "status": "sucesso",
        "resposta_ia": resposta_ia,
        "modelo": OLLAMA_MODEL,
        "salvo_em": datetime.now(timezone.utc).isoformat(),
    }

