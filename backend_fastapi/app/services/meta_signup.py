"""
Serviço para Meta Embedded Signup (Tech Provider)
Funções para trocar code por token, inscrever app na WABA e registrar número.
"""

import httpx
import logging

from app.core.config import settings

logger = logging.getLogger("meta_signup")

GRAPH_API_BASE = "https://graph.facebook.com/v25.0"


async def exchange_code_for_token(code: str) -> str:
    """
    Troca o authorization code do FB.login por um access_token de longa duração.

    Args:
        code: Authorization code retornado pelo FB.login callback

    Returns:
        Access token para a WABA

    Raises:
        Exception: Se a troca falhar
    """
    url = f"{GRAPH_API_BASE}/oauth/access_token"
    params = {
        "client_id": settings.META_APP_ID,
        "client_secret": settings.META_APP_SECRET,
        "code": code,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, params=params)

        if response.status_code != 200:
            logger.error(f"Erro ao trocar code por token: {response.text}")
            raise Exception(f"Falha ao obter access_token da Meta: {response.text}")

        data = response.json()
        access_token = data.get("access_token")

        if not access_token:
            raise Exception("access_token não retornado pela Meta")

        logger.info("Access token obtido com sucesso via Embedded Signup")
        return access_token


async def subscribe_app_to_waba(waba_id: str, access_token: str) -> bool:
    """
    Inscreve o app na WABA para receber webhooks.

    Args:
        waba_id: ID da WhatsApp Business Account
        access_token: Token de acesso da WABA

    Returns:
        True se inscrito com sucesso
    """
    url = f"{GRAPH_API_BASE}/{waba_id}/subscribed_apps"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
        )

        if response.status_code != 200:
            logger.warning(f"Erro ao inscrever app na WABA {waba_id}: {response.text}")
            return False

        logger.info(f"App inscrito na WABA {waba_id} com sucesso")
        return True


async def register_phone_number(phone_number_id: str, access_token: str) -> bool:
    """
    Registra o número de telefone no Cloud API.

    Args:
        phone_number_id: ID do número de telefone
        access_token: Token de acesso da WABA

    Returns:
        True se registrado com sucesso
    """
    url = f"{GRAPH_API_BASE}/{phone_number_id}/register"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "messaging_product": "whatsapp",
                "pin": "123456",
            },
        )

        if response.status_code != 200:
            logger.warning(f"Erro ao registrar número {phone_number_id}: {response.text}")
            return False

        logger.info(f"Número {phone_number_id} registrado no Cloud API")
        return True
