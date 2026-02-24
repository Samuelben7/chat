"""
Webhook Forwarder para Devs.
Busca webhook_url do dev, assina payload com HMAC-SHA256 (webhook_secret),
POST com retry 3x.
"""
import httpx
import hmac
import hashlib
import json
import logging
from typing import Optional

logger = logging.getLogger("webhook_forwarder")

MAX_RETRIES = 3
TIMEOUT = 10.0


async def forward_webhook_to_dev(
    webhook_url: str,
    webhook_secret: str,
    payload: dict,
) -> bool:
    """
    Envia webhook para URL do dev com assinatura HMAC-SHA256.

    Args:
        webhook_url: URL configurada pelo dev
        webhook_secret: Secret para assinatura HMAC
        payload: Dados do webhook

    Returns:
        True se entregue com sucesso
    """
    if not webhook_url:
        logger.warning("Webhook URL nao configurada para dev")
        return False

    body = json.dumps(payload, default=str)
    signature = hmac.new(
        webhook_secret.encode('utf-8'),
        body.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()

    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Signature": f"sha256={signature}",
        "X-Webhook-Source": "whatsapp-sistema",
    }

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    webhook_url,
                    content=body,
                    headers=headers,
                    timeout=TIMEOUT,
                )

            if response.status_code < 400:
                logger.info(f"Webhook entregue para {webhook_url} (tentativa {attempt})")
                return True
            else:
                logger.warning(
                    f"Webhook rejeitado por {webhook_url}: {response.status_code} (tentativa {attempt})"
                )

        except Exception as e:
            logger.warning(f"Erro ao enviar webhook (tentativa {attempt}): {e}")

    logger.error(f"Falha ao entregar webhook para {webhook_url} apos {MAX_RETRIES} tentativas")
    return False
