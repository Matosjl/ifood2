@echo off
chcp 65001 >nul
title iFood2 - Iniciando Sistema Completo
cls

echo ╔═══════════════════════════════════════════════════════════════╗
echo ║         🚀  iFOOD2 - SISTEMA COMPLETO                        ║
echo ║    Backend + Frontend + MongoDB + WebSocket                  ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo 📁 Diretório do projeto: %PROJECT_DIR%
echo.

:: Verifica se o MongoDB está rodando
echo 🔍 Verificando MongoDB...
tasklist | findstr /I "mongod.exe" >nul
if %errorlevel% == 0 (
    echo ✅ MongoDB já está rodando!
) else (
    echo ⚠️  MongoDB NÃO está rodando. Inicie o MongoDB manualmente ou instale-o.
    echo    Download: https://www.mongodb.com/try/download/community
)
echo.

:: ============================================
:: INICIA O BACKEND (Python/FastAPI)
:: ============================================
echo 🐍 Iniciando BACKEND em http://localhost:8000 ...
start "iFood2 - BACKEND" cmd /k "cd /d "%PROJECT_DIR%backend" && .\venv\Scripts\activate.bat && uvicorn server:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 /nobreak >nul

:: ============================================
:: INICIA O FRONTEND (React/Node)
:: ============================================
echo ⚛️  Iniciando FRONTEND em http://localhost:3000 ...
start "iFood2 - FRONTEND" cmd /k "cd /d "%PROJECT_DIR%frontend" && yarn start"

timeout /t 3 /nobreak >nul

:: ============================================
:: ABRE O NAVEGADOR
:: ============================================
echo 🌐 Abrindo navegador...
start http://localhost:3000

cls
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║         ✅  iFOOD2 RODANDO!                                   ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.
echo  🌐 Frontend:  http://localhost:3000
echo  🔌 Backend:   http://localhost:8000
echo  📚 API Docs:   http://localhost:8000/docs
echo  💓 Health:     http://localhost:8000/api/health
echo.
echo  Senha padrão do Owner: troque_esta_senha_agora
echo.
echo  Janelas abertas:
echo    • iFood2 - BACKEND  (Python/FastAPI)
echo    • iFood2 - FRONTEND (React/Node.js)
echo.
echo  Pressione qualquer tecla para fechar ESTA janela.
echo  (As outras janelas continuarão rodando!)
echo.
pause >nul

