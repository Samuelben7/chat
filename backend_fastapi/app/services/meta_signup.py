"""
Serviço para Meta Embedded Signup (Tech Provider)
Funções para trocar code por token, inscrever app na WABA e registrar número.
"""

import httpx
import logging

from app.core.config import settings

logger = logging.getLogger("meta_signup")

GRAPH_API_BASE = "https://graph.facebook.com/v25.0"


async def exchange_code_for_token(code: str, redirect_uri: str | None = None) -> str:
    """
    Troca o authorization code do FB.login por um access_token de longa duração.

    Args:
        code: Authorization code retornado pelo FB.login callback
        redirect_uri: O mesmo redirect_uri usado na requisição inicial de autorização.
                      OBRIGATÓRIO quando o OAuth flow inclui redirect_uri (ex: Embedded Signup server-side).
                      Opcional apenas para flows sem redirect_uri (ex: FB.login JS SDK).

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
    if redirect_uri:
        params["redirect_uri"] = redirect_uri

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


async def assign_system_user_to_waba(waba_id: str, user_token: str, system_user_id: str) -> bool:
    """
    Atribui o System User permanente ao WABA com permissão MANAGE (Full Control).
    Deve ser chamado após o Embedded Signup para garantir acesso permanente.

    Args:
        waba_id: ID da WhatsApp Business Account
        user_token: Token do usuário que completou o Embedded Signup
        system_user_id: ID do System User da plataforma (tech provider)

    Returns:
        True se atribuído com sucesso
    """
    url = f"{GRAPH_API_BASE}/{waba_id}/assigned_users"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            headers={"Authorization": f"Bearer {user_token}"},
            params={
                "user": system_user_id,
                "tasks": "MANAGE",
            },
        )

        if response.status_code != 200:
            logger.warning(f"Erro ao atribuir System User ao WABA {waba_id}: {response.text}")
            return False

        logger.info(f"System User {system_user_id} atribuído ao WABA {waba_id} com MANAGE")
        return True


async def generate_system_user_token(
    system_user_id: str,
    business_id: str,
    app_id: str,
    user_token: str,
) -> str | None:
    """
    Gera um token de longa duração para o System User via Graph API.
    Requer que o user_token tenha permissão business_management.

    Args:
        system_user_id: ID do System User da plataforma
        business_id: ID do Business Manager
        app_id: ID do app Meta
        user_token: Token do usuário com business_management

    Returns:
        Token do System User ou None se falhar
    """
    url = f"{GRAPH_API_BASE}/{business_id}/system_users/{system_user_id}/access_tokens"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            headers={"Authorization": f"Bearer {user_token}"},
            params={
                "appsecret_proof": "",  # opcional, ignorado sem app_secret
                "app_id": app_id,
                "scope": "whatsapp_business_management,whatsapp_business_messaging",
            },
        )

        if response.status_code != 200:
            logger.warning(f"Erro ao gerar token do System User: {response.text}")
            return None

        data = response.json()
        token = data.get("access_token")
        logger.info(f"Token do System User gerado com sucesso para WABA")
        return token


async def get_phone_number_info(phone_number_id: str, access_token: str) -> dict:
    """
    Busca status e informações do número de telefone via Meta API.
    Retorna: display_phone_number, verified_name, status, quality_rating, name_status
    """
    url = f"{GRAPH_API_BASE}/{phone_number_id}"
    params = {
        "fields": "display_phone_number,verified_name,status,quality_rating,name_status",
        "access_token": access_token,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, params=params)
        if response.status_code != 200:
            logger.warning(f"Erro ao buscar info do número {phone_number_id}: {response.text}")
            raise Exception(f"Meta API error: {response.text}")
        return response.json()


async def get_business_profile(phone_number_id: str, access_token: str) -> dict:
    """
    Busca perfil do WhatsApp Business (about, foto, etc).
    """
    url = f"{GRAPH_API_BASE}/{phone_number_id}/whatsapp_business_profile"
    params = {
        "fields": "about,address,description,email,profile_picture_url,websites,vertical",
        "access_token": access_token,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, params=params)
        if response.status_code != 200:
            logger.warning(f"Erro ao buscar perfil do número {phone_number_id}: {response.text}")
            return {}
        return response.json()


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
