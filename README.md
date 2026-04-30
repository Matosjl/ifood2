# iFood2 - Delivery Platform (Full Stack Docker)

## 🚀 Quick Start (One Click)

Double-click **Iniciar_iFood2.bat** 

This runs the **full Docker stack**:
- Frontend: http://localhost:3000
- API: http://localhost:8000 
- Docs: http://localhost:8000/docs
- MongoDB: localhost:27017
- Redis: localhost:6379

**Owner Password:** `troque_esta_senha_agora`

## 🐳 Services

| Service | Port | Purpose |
|---------|------|---------|
| `ifood2_frontend` | 3000 | React App |
| `ifood2_api` | 8000 | FastAPI Backend |
| `ifood2_db` | 27017 | MongoDB |
| `ifood2_redis` | 6379 | Cache/Broker |
| `ifood2_worker` | - | Celery Tasks |

## 📋 Commands

```bash
# Start full stack
docker-compose up -d --build

# View logs
docker-compose logs -f

# Status
docker ps

# Stop
docker-compose down

# Clean volumes (fresh DB)
docker-compose down -v
```

## ✅ Features Fixed

- **No more MongoDB connection errors** (38 terminal problems solved)
- Full Docker isolation
- Auto-restart services
- Hot reload frontend/backend
- Persistent MongoDB data

## 🔧 Development

- Backend: `./backend/server.py` (uvicorn reload)
- Frontend: `./frontend/` (yarn dev)
- Config: `./backend/.env`

**Enjoy your professional delivery platform! 🎉**

