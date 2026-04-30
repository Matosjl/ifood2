@echo off
chcp 65001 >nul
title iFood2 - Docker Full Stack Startup
cls

echo ╔═══════════════════════════════════════════════════════════════╗
echo ║         🚀  iFOOD2 - FULL DOCKER STACK                        ║
echo ║    Frontend + API + MongoDB + Redis + Celery                  ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo 📁 Diretório do projeto: %PROJECT_DIR%
echo.

echo 🐳 Parando containers antigos (se existirem)...
docker-compose down

echo 🐳 Iniciando full stack com Docker Compose...
docker-compose up -d --build

echo ⏳ Aguardando serviços iniciarem (30s)...
timeout /t 30 /nobreak >nul

echo 🌐 Abrindo Frontend: http://localhost:3000
start http://localhost:3000

echo 🔌 API: http://localhost:8000
echo 📚 Docs: http://localhost:8000/docs
echo 💓 Health: http://localhost:8000/api/health
echo 🗄️  Mongo: localhost:27017
echo 🟥 Redis: localhost:6379
echo.

echo ╔═══════════════════════════════════════════════════════════════╗
echo ║         ✅  iFOOD2 FULL STACK RODANDO!                         ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.
echo Para parar tudo: docker-compose down
echo Para ver logs: docker-compose logs -f
echo Para status: docker ps
echo.
echo Senha Owner padrão: troque_esta_senha_agora
echo.
pause

