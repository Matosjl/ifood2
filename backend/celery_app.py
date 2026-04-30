"""
App Celery para processamento assíncrono de tarefas pesadas (IA, etc.).
"""

from celery import Celery
from config import CELERY_BROKER_URL, CELERY_RESULT_BACKEND

celery_app = Celery("ifood2")
celery_app.conf.broker_url = CELERY_BROKER_URL
celery_app.conf.result_backend = CELERY_RESULT_BACKEND

# Configurações otimizadas para VPS barata (evita acúmulo de resultados)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    result_expires=3600,           # Resultados expiram em 1h (economiza RAM)
    task_track_started=True,
    worker_prefetch_multiplier=1,  # Evita que um worker monopolize muitas tarefas
    worker_max_tasks_per_child=50, # Recicla worker após 50 tarefas (evita vazamento de memória)
)

if __name__ == "__main__":
    celery_app.start()

