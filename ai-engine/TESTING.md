# Testando o ai-engine localmente

Guia rápido pra subir o serviço, validar OCR sem WhatsApp e medir performance antes de subir pra VPS2.

## Pré-requisitos verificados

| Item | Comando de check |
|---|---|
| Python 3.11+ | `python --version` |
| Ollama instalado e rodando | `curl http://localhost:11434/api/tags` |
| Modelo de visão baixado | `ollama list \| findstr vision\|moondream\|llava` |

## Setup (uma vez)

```powershell
cd ai-engine
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
```

## Modelo de visão — opções

| Modelo | Tamanho | Qualidade nota fiscal | Quando usar |
|---|---|---|---|
| `llama3.2-vision:11b-q4_K_M` | ~7GB | ⭐⭐⭐⭐ Recomendado | Produção VPS2 (8GB RAM) |
| `moondream` | 1.7GB | ⭐⭐ Básico | Teste rápido local |
| `llava-phi3` | ~2.9GB | ⭐⭐⭐ Médio | Meio termo |

Baixar:
```powershell
ollama pull moondream            # 1.7GB
ollama pull llama3.2-vision:11b  # ~7GB
```

Mudar o modelo usado: edite `OLLAMA_MODEL=` em `.env`.

## Rodar

Terminal 1 — uvicorn:
```powershell
cd ai-engine
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 3001 --reload
```

Terminal 2 — health check:
```powershell
curl http://localhost:3001/health
```

Esperado:
```json
{
  "status": "ok",
  "ollama": { "ollama_up": true, "model_loaded": true, ... },
  "concurrency_limit": 2
}
```

## Testar OCR com cupom sintético

```powershell
# Gera uma JPG de cupom fiscal fake (texto bem legível)
.\venv\Scripts\python.exe test\generate_sample.py

# Roda OCR
.\venv\Scripts\python.exe test\test_endpoint.py
```

Ou via curl:
```powershell
curl -X POST http://localhost:3001/api/v1/financial/interpret-receipt `
  -H "X-AI-Engine-Key: sandbox-ai-engine-key" `
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000000" `
  -F "image=@test\sample-receipt.jpg"
```

## Testar OCR com foto real

Tire foto de qualquer cupom fiscal/nota com o celular, transfira pro PC, e:
```powershell
.\venv\Scripts\python.exe test\test_endpoint.py C:\caminho\pra\foto.jpg
```

## Métricas esperadas

| Modelo | Hardware | Latência (cupom simples) |
|---|---|---|
| `moondream` | CPU laptop comum | 5-15s |
| `llama3.2-vision:11b-q4_K_M` | VPS 8GB RAM | 30-90s (1ª request) / 15-30s (cache quente) |
| `llama3.2-vision:11b` | RTX 3060+ | 3-8s |

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| `ollama_up: false` no /health | Ollama não tá rodando | Inicie o Ollama Desktop ou `ollama serve` |
| `model_loaded: false` | OLLAMA_MODEL não baixado | `ollama pull <modelo>` |
| Timeout 60s no curl | Modelo demorando | Aumente `OLLAMA_REQUEST_TIMEOUT` no .env |
| Resposta com texto solto e não JSON | Modelo ignorando `format: "json"` | Use modelo melhor (llava ou llama-vision) |
| Erro "tenant_id obrigatório" | Header faltando | Inclua `-H "X-Tenant-Id: ..."` no curl |
