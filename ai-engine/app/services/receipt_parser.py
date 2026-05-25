import json
import logging
from typing import Any
from .ollama_vision import call_vision

logger = logging.getLogger(__name__)


RECEIPT_PROMPT = """Você é um especialista em notas fiscais e cupons brasileiros (DANFE, NFC-e, cupom térmico).
Analise a IMAGEM e extraia os dados ESTRITAMENTE no formato JSON abaixo.

REGRAS:
- Se a imagem NÃO for uma nota fiscal/cupom, retorne {"erro": "nao_eh_nota_fiscal"}.
- NUNCA invente itens. Se não conseguir ler claramente, marque "confianca" baixa.
- "quantidade": número (sem aspas). Se não houver, use 1.
- "unidade": minúscula, uma de: "un", "kg", "g", "l", "ml", "cx", "pct", "pc".
- Valores em reais com PONTO decimal (ex: 12.50). Sem "R$" nem milhares com vírgula.
- "data_emissao" no formato YYYY-MM-DD. Se ilegível, omita o campo.
- "cnpj" só dígitos com pontuação (ex: "00.000.000/0001-00") ou null.
- "categoria_sugerida" deve ser UMA destas: "rent", "utilities", "food_supplier", "staff", "marketing", "tax", "maintenance", "other".
  Pra notas de mercado/atacado/açougue/hortifruti → "food_supplier".
- "confianca": float entre 0.0 e 1.0 indicando o quão certo você está da extração.

FORMATO DE SAÍDA (JSON puro, sem markdown, sem comentários):
{
  "fornecedor": "Nome do estabelecimento",
  "cnpj": "00.000.000/0001-00",
  "data_emissao": "2026-05-24",
  "total": 487.50,
  "itens": [
    {"descricao": "COCA COLA 2L PET", "quantidade": 12, "unidade": "un", "valor_unit": 8.50, "valor_total": 102.00}
  ],
  "confianca": 0.85,
  "categoria_sugerida": "food_supplier"
}"""


def _safe_parse_json(raw: str) -> dict[str, Any]:
    """Ollama com format=json deve devolver JSON puro, mas defendemos contra prefixo/sufixo."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].lstrip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(raw[start : end + 1])
        raise


def _normalize(data: dict[str, Any]) -> dict[str, Any]:
    """Garante shape consistente — preenche defaults e força tipos básicos."""
    if "erro" in data:
        return {"erro": data["erro"], "confianca": 0.0}

    out: dict[str, Any] = {
        "fornecedor": (data.get("fornecedor") or "").strip() or None,
        "cnpj": (data.get("cnpj") or None),
        "data_emissao": data.get("data_emissao"),
        "total": _to_float(data.get("total")),
        "itens": [],
        "confianca": _to_float(data.get("confianca"), default=0.5),
        "categoria_sugerida": data.get("categoria_sugerida") or "other",
    }

    raw_itens = data.get("itens") or []
    if not isinstance(raw_itens, list):
        raw_itens = []

    for item in raw_itens:
        if not isinstance(item, dict):
            continue
        out["itens"].append({
            "descricao": (item.get("descricao") or "").strip(),
            "quantidade": _to_float(item.get("quantidade"), default=1.0),
            "unidade": (item.get("unidade") or "un").lower().strip(),
            "valor_unit": _to_float(item.get("valor_unit")),
            "valor_total": _to_float(item.get("valor_total")),
        })

    return out


def _to_float(v: Any, default: float = 0.0) -> float:
    if v is None or v == "":
        return default
    try:
        if isinstance(v, str):
            v = v.replace("R$", "").replace(" ", "").replace(",", ".").strip()
        return float(v)
    except (TypeError, ValueError):
        return default


async def parse_receipt(image_b64: str) -> dict[str, Any]:
    """Pipeline completo: vision → JSON → normalização."""
    raw_response = await call_vision(RECEIPT_PROMPT, image_b64, format_json=True)
    logger.info("ollama raw response length=%d", len(raw_response))
    try:
        parsed = _safe_parse_json(raw_response)
    except json.JSONDecodeError as e:
        logger.error("failed to parse JSON from Ollama: %s | raw=%s", e, raw_response[:500])
        return {
            "erro": "json_invalido",
            "raw_response": raw_response[:1000],
            "confianca": 0.0,
        }
    return _normalize(parsed)
