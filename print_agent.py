#!/usr/bin/env python3
"""
ZapFome — Agente de Impressão Windows
Roda FORA do Docker, direto no Windows.
Instalar dependências: pip install requests
Executar: python print_agent.py
"""

import os
import sys
import time
import tempfile
import subprocess
import requests

API_URL      = os.getenv("ZAPFOME_API", "http://localhost:8000/api")
PRINTER_NAME = os.getenv("RECEIPT_PRINTER_NAME", "HPRT MPT-II")
POLL_SECS    = 2   # verifica a fila a cada 2 segundos

def imprimir_windows(conteudo: str, printer: str) -> bool:
    """Envia texto para a impressora via PowerShell (sem abrir janela)."""
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", encoding="utf-8", delete=False
        ) as tf:
            tf.write(conteudo + "\n\n\n")   # 3 linhas de corte
            path = tf.name

        cmd = (
            f"Start-Process -FilePath '{path}' "
            f"-Verb PrintTo -ArgumentList '\"{printer}\"' "
            f"-WindowStyle Hidden -Wait; "
            f"Start-Sleep -Milliseconds 800"
        )
        result = subprocess.run(
            ["powershell.exe", "-NonInteractive", "-Command", cmd],
            timeout=15,
            capture_output=True,
        )
        return result.returncode == 0
    except Exception as e:
        print(f"[ERRO] Falha ao imprimir: {e}")
        return False
    finally:
        try:
            os.remove(path)
        except Exception:
            pass


def processar_fila():
    try:
        r = requests.get(f"{API_URL}/print/queue", timeout=5)
        jobs = r.json() if r.ok else []
    except Exception:
        return   # API indisponível, tenta novamente no próximo ciclo

    for job in jobs:
        job_id   = job.get("id")
        conteudo = job.get("content", "")
        printer  = job.get("printer_name") or PRINTER_NAME

        print(f"[PRINT] Job {job_id[:8]}… → {printer}")
        ok = imprimir_windows(conteudo, printer)
        status = "concluido" if ok else "falhou"

        try:
            requests.patch(
                f"{API_URL}/print/queue/{job_id}",
                params={"status": status},
                timeout=5,
            )
        except Exception:
            pass

        print(f"[{'OK' if ok else 'FAIL'}] {job_id[:8]} → {status}")


if __name__ == "__main__":
    print(f"ZapFome Print Agent iniciado")
    print(f"  API      : {API_URL}")
    print(f"  Impressora: {PRINTER_NAME}")
    print(f"  Polling  : {POLL_SECS}s\n")
    while True:
        processar_fila()
        time.sleep(POLL_SECS)
