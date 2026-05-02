"""
evolution.py — Cliente assíncrono da Evolution API v2
═══════════════════════════════════════════════════════
Suporta:
  • Criação e gerenciamento de instância WhatsApp (Baileys)
  • QR Code para scan
  • Status da conexão (open/close/connecting)
  • Envio de mensagens de texto
  • Configuração de webhook
  • Mensagens automáticas de atualização de pedido

Variáveis de ambiente necessárias:
  EVOLUTION_API_URL     — ex: http://evolution:8080   (local Docker)
                                ou https://api.evolution.zapfome.com.br
  EVOLUTION_API_KEY     — Global API Key do painel da Evolution
  EVOLUTION_INSTANCE    — Nome da instância, ex: "zapfome"
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

# ── Templates de mensagens por status ────────────────────────────────────────
_STATUS_TEMPLATE: Dict[str, str] = {
    "confirmado": (
        "✅ *Pedido #{oid} confirmado!*\n\n"
        "🍳 Estamos preparando tudo com cuidado.\n"
        "💰 Total: *R$ {total}*\n\n"
        "Acompanhe o status aqui mesmo pelo WhatsApp! 😊"
    ),
    "em_preparo": (
        "👨‍🍳 *Pedido #{oid} em preparo!*\n\n"
        "Seu pedido entrou na fila da cozinha. Já já fica pronto! 🔥"
    ),
    "pronto": (
        "🔔 *Pedido #{oid} pronto!*\n\n"
        "✅ Tudo pronto! Pode vir retirar ou aguarde o entregador. 🛵"
    ),
    "em_entrega": (
        "🛵 *Pedido #{oid} saiu para entrega!*\n\n"
        "Seu pedido está a caminho. Fique de olho! 📍"
    ),
    "entregue": (
        "🎉 *Pedido #{oid} entregue!*\n\n"
        "Obrigado pela preferência em *{restaurante}*!\n"
        "Sua opinião é muito importante para nós. 🙏\n\n"
        "_Volte sempre!_ 🍔"
    ),
    "cancelado": (
        "❌ *Pedido #{oid} cancelado.*\n\n"
        "Pedimos desculpas pelo inconveniente.\n"
        "Entre em contato para mais informações."
    ),
}


class EvolutionClient:
    """Wrapper assíncrono para a Evolution API v2."""

    def __init__(self, base_url: str, api_key: str, instance: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key  = api_key
        self.instance = instance
        self._h = {
            "Content-Type": "application/json",
            "apikey": api_key,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # INSTÂNCIA
    # ─────────────────────────────────────────────────────────────────────────

    async def get_status(self) -> Dict[str, Any]:
        """
        Retorna o estado da conexão da instância.
        Possíveis valores: 'open' | 'close' | 'connecting'
        """
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(
                    f"{self.base_url}/instance/connectionState/{self.instance}",
                    headers=self._h,
                )
                if r.status_code == 200:
                    return r.json()
                # Instância não existe ainda
                if r.status_code in (404, 400):
                    return {"instance": {"state": "close"}, "error": "instance_not_found"}
                return {"instance": {"state": "close"}, "error": r.text}
        except Exception as exc:
            logger.warning("evolution.get_status: %s", exc)
            return {"instance": {"state": "close"}, "error": str(exc)}

    async def get_qr(self) -> Dict[str, Any]:
        """
        Retorna o QR code (base64 PNG) para escanear com o WhatsApp.
        Retorna {"base64": "data:image/png;base64,..."} quando disponível.
        """
        try:
            async with httpx.AsyncClient(timeout=12) as c:
                r = await c.get(
                    f"{self.base_url}/instance/connect/{self.instance}",
                    headers=self._h,
                )
                if r.status_code == 200:
                    return r.json()
                return {"error": r.text, "status_code": r.status_code}
        except Exception as exc:
            logger.warning("evolution.get_qr: %s", exc)
            return {"error": str(exc)}

    async def create_instance(self, webhook_url: str) -> Dict[str, Any]:
        """
        Cria (ou recria) a instância e configura o webhook automaticamente.
        Chame apenas uma vez na primeira configuração.
        """
        payload = {
            "instanceName": self.instance,
            "integration":  "WHATSAPP-BAILEYS",
            "qrcode":       True,
            "webhook": {
                "url":      webhook_url,
                "byEvents": False,
                "base64":   False,
                "headers":  {},
                "events":   ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
            },
        }
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(
                    f"{self.base_url}/instance/create",
                    headers=self._h,
                    json=payload,
                )
                return r.json()
        except Exception as exc:
            logger.warning("evolution.create_instance: %s", exc)
            return {"error": str(exc)}

    async def set_webhook(self, webhook_url: str) -> Dict[str, Any]:
        """Atualiza ou cria o webhook de uma instância existente."""
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.post(
                    f"{self.base_url}/webhook/set/{self.instance}",
                    headers=self._h,
                    json={
                        "url":      webhook_url,
                        "byEvents": False,
                        "base64":   False,
                        "events":   ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
                    },
                )
                return r.json() if r.status_code < 400 else {"error": r.text}
        except Exception as exc:
            logger.warning("evolution.set_webhook: %s", exc)
            return {"error": str(exc)}

    async def delete_instance(self) -> Dict[str, Any]:
        """Remove a instância (desconecta o WhatsApp)."""
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.delete(
                    f"{self.base_url}/instance/delete/{self.instance}",
                    headers=self._h,
                )
                return r.json() if r.status_code < 400 else {"error": r.text}
        except Exception as exc:
            logger.warning("evolution.delete_instance: %s", exc)
            return {"error": str(exc)}

    async def logout(self) -> Dict[str, Any]:
        """Desconecta o WhatsApp sem remover a instância."""
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.delete(
                    f"{self.base_url}/instance/logout/{self.instance}",
                    headers=self._h,
                )
                return r.json() if r.status_code < 400 else {"error": r.text}
        except Exception as exc:
            logger.warning("evolution.logout: %s", exc)
            return {"error": str(exc)}

    # ─────────────────────────────────────────────────────────────────────────
    # MENSAGENS
    # ─────────────────────────────────────────────────────────────────────────

    async def send_text(self, phone: str, text: str) -> Dict[str, Any]:
        """
        Envia mensagem de texto simples.
        phone: número com código do país, ex: '5511999999999'
        """
        number = "".join(filter(str.isdigit, phone or ""))
        if len(number) < 10:
            logger.warning("evolution.send_text: número inválido '%s'", phone)
            return {"error": "Número de telefone inválido"}
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.post(
                    f"{self.base_url}/message/sendText/{self.instance}",
                    headers=self._h,
                    json={"number": number, "textMessage": {"text": text}},
                )
                if r.status_code < 400:
                    logger.info("evolution.send_text → %s OK", number)
                    return r.json()
                logger.warning("evolution.send_text → %s ERRO %s: %s", number, r.status_code, r.text[:200])
                return {"error": r.text}
        except Exception as exc:
            logger.warning("evolution.send_text exc: %s", exc)
            return {"error": str(exc)}

    async def send_order_update(
        self,
        phone: str,
        status: str,
        pedido_id: str,
        total: float = 0.0,
        restaurante_nome: str = "ZapFome",
    ) -> Dict[str, Any]:
        """
        Envia mensagem automática de atualização de status do pedido.
        Silencioso se o template não existir ou o telefone estiver vazio.
        """
        template = _STATUS_TEMPLATE.get(status)
        if not template:
            return {"skipped": True, "reason": "no_template"}
        if not phone or not "".join(filter(str.isdigit, phone)):
            return {"skipped": True, "reason": "no_phone"}

        oid   = pedido_id[-6:].upper()
        total_str = f"{total:.2f}".replace(".", ",")
        text  = template.format(oid=oid, total=total_str, restaurante=restaurante_nome)
        return await self.send_text(phone, text)


# ── Singleton lazy — inicializado pelo server.py no startup ──────────────────
_client: Optional[EvolutionClient] = None


def init_evolution(base_url: str, api_key: str, instance: str) -> None:
    """Chamado uma vez no startup do FastAPI."""
    global _client
    if base_url and api_key and instance:
        _client = EvolutionClient(base_url, api_key, instance)
        logger.info("Evolution API configurada | instance=%s | url=%s", instance, base_url)
    else:
        logger.info("Evolution API não configurada (variáveis ausentes no .env)")


def get_client() -> Optional[EvolutionClient]:
    """Retorna o cliente ou None se não configurado."""
    return _client
