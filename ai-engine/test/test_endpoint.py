"""
Testa o endpoint /api/v1/financial/interpret-receipt do ai-engine local.
Requer:
  - uvicorn rodando em http://localhost:3001
  - Ollama rodando em http://localhost:11434 com o modelo de visão configurado

Uso:
    python test/test_endpoint.py             # usa sample-receipt.jpg
    python test/test_endpoint.py path/to/foto.jpg
"""
import sys
import json
import time
from pathlib import Path
import httpx

URL = "http://localhost:3001/api/v1/financial/interpret-receipt"
API_KEY = "sandbox-ai-engine-key"
TENANT_ID = "00000000-0000-0000-0000-000000000000"


def main():
    img_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "sample-receipt.jpg"
    if not img_path.exists():
        print(f"[erro] arquivo não existe: {img_path}")
        print("Gere o sample com: python test/generate_sample.py")
        sys.exit(1)

    print(f"[i] enviando {img_path} ({img_path.stat().st_size} bytes)...")

    started = time.time()
    with open(img_path, "rb") as f:
        files = {"image": (img_path.name, f, "image/jpeg")}
        headers = {"X-AI-Engine-Key": API_KEY, "X-Tenant-Id": TENANT_ID}
        with httpx.Client(timeout=180) as client:
            try:
                r = client.post(URL, headers=headers, files=files)
            except httpx.ConnectError as e:
                print(f"[erro] não conectou em {URL} — uvicorn está rodando? ({e})")
                sys.exit(2)

    elapsed = time.time() - started
    print(f"[i] status={r.status_code} latency={elapsed:.2f}s")
    print("--- resposta ---")
    try:
        print(json.dumps(r.json(), indent=2, ensure_ascii=False))
    except Exception:
        print(r.text)
    print("----------------")

    if r.status_code != 200:
        sys.exit(3)


if __name__ == "__main__":
    main()
