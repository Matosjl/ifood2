# =============================================================
# SaaS Restaurant — Makefile
# Requires Docker Compose v2 (docker compose)
# =============================================================

COMPOSE         = docker compose
COMPOSE_FILE    = -f docker-compose.yml
COMPOSE_DEV     = -f docker-compose.yml -f docker-compose.dev.yml

.DEFAULT_GOAL   := help

# ── Production ────────────────────────────────────────────────

.PHONY: up
up:  ## Start all services in detached mode
	$(COMPOSE) $(COMPOSE_FILE) up -d

.PHONY: down
down:  ## Stop and remove containers (keeps volumes)
	$(COMPOSE) $(COMPOSE_FILE) down

.PHONY: restart
restart:  ## Restart all services
	$(COMPOSE) $(COMPOSE_FILE) restart

.PHONY: build
build:  ## Build all images
	$(COMPOSE) $(COMPOSE_FILE) build

.PHONY: build-nc
build-nc:  ## Build all images without cache
	$(COMPOSE) $(COMPOSE_FILE) build --no-cache

.PHONY: deploy
deploy:  ## Full deploy: pull + build + migrate + up
	@bash scripts/deploy.sh

.PHONY: deploy-nc
deploy-nc:  ## Full deploy with no-cache build
	@bash scripts/deploy.sh --no-cache

# ── SSL ───────────────────────────────────────────────────────

.PHONY: ssl-init
ssl-init:  ## Obtain SSL cert: make ssl-init DOMAIN=app.x.com EMAIL=a@x.com
	@bash scripts/init-ssl.sh "$(DOMAIN)" "$(EMAIL)"

# ── Database ──────────────────────────────────────────────────

.PHONY: migrate
migrate:  ## Run database migrations
	$(COMPOSE) $(COMPOSE_FILE) run --rm backend node src/database/migrate.js

.PHONY: backup
backup:  ## Dump PostgreSQL to ./backups/
	@bash scripts/backup-db.sh

.PHONY: psql
psql:  ## Open psql console
	$(COMPOSE) $(COMPOSE_FILE) exec postgres \
	  psql -U "$${DB_USER:-saas_user}" "$${DB_NAME:-saas_restaurant}"

# ── Development ───────────────────────────────────────────────

.PHONY: dev
dev:  ## Start in development mode (Vite dev server + nodemon)
	$(COMPOSE) $(COMPOSE_DEV) up

.PHONY: dev-build
dev-build:  ## Build dev images
	$(COMPOSE) $(COMPOSE_DEV) build

# ── Logs ──────────────────────────────────────────────────────

.PHONY: logs
logs:  ## Tail logs from all services
	$(COMPOSE) $(COMPOSE_FILE) logs -f --tail=100

.PHONY: logs-backend
logs-backend:  ## Tail backend logs
	$(COMPOSE) $(COMPOSE_FILE) logs -f --tail=100 backend

.PHONY: logs-worker
logs-worker:  ## Tail worker logs
	$(COMPOSE) $(COMPOSE_FILE) logs -f --tail=100 worker

.PHONY: logs-nginx
logs-nginx:  ## Tail nginx logs
	$(COMPOSE) $(COMPOSE_FILE) logs -f --tail=100 nginx

# ── Inspection ────────────────────────────────────────────────

.PHONY: ps
ps:  ## Show running containers
	$(COMPOSE) $(COMPOSE_FILE) ps

.PHONY: stats
stats:  ## Live resource usage
	docker stats $$($(COMPOSE) $(COMPOSE_FILE) ps -q)

.PHONY: shell-backend
shell-backend:  ## Open shell in backend container
	$(COMPOSE) $(COMPOSE_FILE) exec backend sh

.PHONY: shell-redis
shell-redis:  ## Open redis-cli
	$(COMPOSE) $(COMPOSE_FILE) exec redis \
	  redis-cli -a "$${REDIS_PASSWORD}"

# ── Maintenance ───────────────────────────────────────────────

.PHONY: prune
prune:  ## Remove stopped containers and dangling images
	docker system prune -f

.PHONY: secrets
secrets:  ## Generate random secrets for .env
	@bash scripts/generate-secrets.sh

# ── Help ──────────────────────────────────────────────────────

.PHONY: help
help:
	@echo ""
	@echo "SaaS Restaurant — Available commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
