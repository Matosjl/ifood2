# ZapFome AI Engine (VPS2)

Serviço Python/FastAPI que roda na VPS2 e processa tarefas de IA — atualmente OCR de notas fiscais com Ollama Vision.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Status do serviço + Ollama + modelo |
| POST | `/api/v1/financial/interpret-receipt` | OCR de nota fiscal |

## Setup local (caixinha)

### 1. Instalar Ollama
- Linux/Mac: https://ollama.com/download
- Windows: idem (versão recente já suporta vision)

### 2. Baixar o modelo
```bash
ollama pull llama3.2-vision:11b-q4_K_M
```

⚠️ O modelo tem ~7GB. Na VPS de 8GB RAM, configure as variáveis de ambiente do Ollama (ver seção VPS lá embaixo) **antes** de servir requests.

### 3. Rodar o AI Engine

```bash
cd ai-engine
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Edite .env se quiser trocar a chave AI_ENGINE_KEY

uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
```

### 4. Testar

```bash
# Health check
curl http://localhost:3001/health

# OCR de uma foto de nota fiscal
curl -X POST http://localhost:3001/api/v1/financial/interpret-receipt \
  -H "X-AI-Engine-Key: sandbox-ai-engine-key" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000000" \
  -F "image=@./minha-nota.jpg"
```

Resposta esperada:
```json
{
  "data": {
    "fornecedor": "Atacadão Praia Real",
    "cnpj": "00.000.000/0001-00",
    "data_emissao": "2026-05-24",
    "total": 487.50,
    "itens": [
      {"descricao": "COCA COLA 2L PET", "quantidade": 12, "unidade": "un", "valor_unit": 8.50, "valor_total": 102.00}
    ],
    "confianca": 0.85,
    "categoria_sugerida": "food_supplier"
  }
}
```

## Variáveis de ambiente

Veja `.env.example`. Principais:

| Variável | Default | Notas |
|---|---|---|
| `PORT` | 3001 | Porta HTTP |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Endpoint do Ollama |
| `OLLAMA_MODEL` | `llama3.2-vision:11b-q4_K_M` | Modelo de visão |
| `OLLAMA_REQUEST_TIMEOUT` | 120 | Timeout por request (s) |
| `AI_ENGINE_KEY` | `sandbox-ai-engine-key` | Auth — bate com `AI_ENGINE_KEY` no saas-backend |
| `MAX_CONCURRENT_VISION` | 2 | Semáforo (proteção pra 8GB RAM) |
| `IMAGE_MAX_SIDE_PX` | 1024 | Redimensionar foto antes do modelo |
| `IMAGE_JPEG_QUALITY` | 85 | Qualidade JPEG após resize |

## Restrições da VPS2 (8GB RAM)

Configure o serviço Ollama no Linux (`/etc/systemd/system/ollama.service.d/override.conf`):

```ini
[Service]
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_NUM_PARALLEL=2"
Environment="OLLAMA_KEEP_ALIVE=10m"
Environment="OLLAMA_FLASH_ATTENTION=1"
```

Depois:
```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

Recomendado também: swapfile de 4GB como rede de segurança.

## Deploy na VPS2

```bash
# Na VPS2
git clone <seu-repo>
cd ai-engine
docker build -t zapfome-ai-engine .
docker run -d \
  --name zapfome-ai-engine \
  --restart unless-stopped \
  --network host \
  -e PORT=3001 \
  -e OLLAMA_BASE_URL=http://localhost:11434 \
  -e AI_ENGINE_KEY=<sua-chave-real> \
  zapfome-ai-engine
```

`--network host` permite que o container fale com o Ollama do host na 11434.
