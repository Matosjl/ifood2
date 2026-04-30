# TODO - Infraestrutura ZapFome (iFood 2.0) — COMPLETO

- [x] Criar `backend/config.py` — centralizar configurações
- [x] Criar `backend/celery_app.py` — app Celery com Redis
- [x] Criar `backend/tasks.py` — tarefa `processar_pedido_ia`
- [x] Criar `backend/Dockerfile` — otimizado com python:3.11-slim
- [x] Criar `docker-compose.yml` — 4 containers (api, db, redis, worker)
- [x] Criar `.dockerignore`
- [x] Editar `backend/requirements.txt` — adicionar Celery e Redis
- [x] Editar `backend/server.py` — usar config.py + endpoint de disparo IA
- [x] Documentar Wrapper WebView React/Expo
- [x] Validar estrutura dos arquivos
