import json
import os
from typing import Any, Dict, List, Tuple

import requests

API_BASE_URL: str = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")
BASE: str = f"{API_BASE_URL.rstrip('/')}/api/print/direct"
TOKEN: str = os.environ.get("OWNER_API_TOKEN", "ifood2-token-super-seguro-2026")

CaseType = Tuple[str, Dict[str, str], Dict[str, Any]]
cases: List[CaseType] = [
    ("no_token", {}, {"content": "teste"}),
    ("invalid_token", {"X-Owner-Token": "x"}, {"content": "teste"}),
    ("empty_content", {"X-Owner-Token": TOKEN}, {"content": "   "}),
    ("oversized", {"X-Owner-Token": TOKEN}, {"content": "a" * 20000}),
    ("valid", {"X-Owner-Token": TOKEN}, {"content": "CUPOM TESTE"}),
]

print("=== TESTE API PRINT DIRECT ===")
for name, headers, body in cases:
    merged_headers: Dict[str, str] = {"Content-Type": "application/json", **headers}
    response = requests.post(
        BASE,
        headers=merged_headers,
        data=json.dumps(body),
        timeout=12,
    )
    text = response.text.replace("\n", " ")[:200]
    print(f"{name}: {response.status_code} | {text}")
