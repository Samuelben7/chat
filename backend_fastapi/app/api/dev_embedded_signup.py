"""
Callback público para Meta Embedded Signup (server-side OAuth).

Fluxo:
1. Dev chama POST /dev/numeros/signup-link → recebe URL com state={session_id}
2. Dev embed essa URL em seu sistema para o cliente clicar
3. Cliente faz login no Facebook e autoriza
4. Meta redireciona o browser do cliente para: GET /webhook/embedded-signup?code=XXX&state=session_id
5. Aqui trocamos code por token, buscamos os números na Meta e salvamos como DevNumero
6. Redirecionamos cliente para redirect_back_url do dev (ou exibimos página de resultado)
"""
import json
import logging

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.redis_client import redis_cache
from app.database.database import get_db
from app.models.models import DevNumero, DevUsuario

logger = logging.getLogger("embedded_signup")

router = APIRouter(prefix="/webhook", tags=["embedded-signup"])

GRAPH_API = "https://graph.facebook.com/v25.0"


@router.get("/embedded-signup")
async def embedded_signup_callback(
    code: str = None,
    state: str = None,
    error: str = None,
    error_description: str = None,
    db: Session = Depends(get_db),
):
    """
    Callback OAuth da Meta — chamado quando o cliente conclui o Embedded Signup.
    Não requer autenticação (é o browser do cliente que chega aqui).
    """
    if error:
        logger.warning(f"Embedded Signup erro Meta: {error} — {error_description}")
        return _html_resultado(False, error_description or "Autorização cancelada pelo usuário.")

    if not code or not state:
        return _html_resultado(False, "Link inválido ou expirado.")

    # Buscar sessão no Redis
    session_raw = redis_cache.client.get(f"es:session:{state}")
    if not session_raw:
        return _html_resultado(False, "Link expirado. Solicite um novo link ao desenvolvedor.")

    session = json.loads(session_raw)
    dev_id = session["dev_id"]
    redirect_back_url = session.get("redirect_back_url", "")

    # Invalidar sessão (uso único)
    redis_cache.client.delete(f"es:session:{state}")

    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id, DevUsuario.ativo == True).first()
    if not dev:
        return _html_resultado(False, "Conta de desenvolvedor não encontrada.")

    try:
        from app.services.meta_signup import (
            assign_system_user_to_waba,
            exchange_code_for_token,
            register_phone_number,
            subscribe_app_to_waba,
        )

        # redirect_uri deve ser o mesmo usado na URL de autorização (obrigatório pela Meta)
        redirect_uri = f"{settings.PUBLIC_BASE_URL}{settings.API_V1_STR}/webhook/embedded-signup"
        access_token = await exchange_code_for_token(code, redirect_uri=redirect_uri)
        numeros_salvos = []

        async with httpx.AsyncClient(timeout=20.0) as client:
            # Buscar WABAs vinculadas ao token
            r = await client.get(
                f"{GRAPH_API}/me/whatsapp_business_accounts",
                params={"access_token": access_token, "fields": "id,name"},
            )
            if r.status_code != 200:
                logger.error(f"Erro ao buscar WABAs: {r.text}")
                raise Exception("Falha ao buscar contas WhatsApp Business na Meta.")

            wabas = r.json().get("data", [])

            for waba in wabas:
                waba_id = waba["id"]

                # Atribuir System User permanente ao WABA (acesso contínuo)
                if settings.META_SYSTEM_USER_ID:
                    try:
                        await assign_system_user_to_waba(waba_id, access_token, settings.META_SYSTEM_USER_ID)
                    except Exception as e:
                        logger.warning(f"Erro assign system user WABA {waba_id}: {e}")

                # Inscrever app nos webhooks do WABA
                subscribe_token = settings.META_PLATFORM_TOKEN or access_token
                await subscribe_app_to_waba(waba_id, subscribe_token)

                # Buscar números de telefone da WABA
                r2 = await client.get(
                    f"{GRAPH_API}/{waba_id}/phone_numbers",
                    params={
                        "access_token": access_token,
                        "fields": "id,display_phone_number,verified_name",
                    },
                )
                if r2.status_code != 200:
                    logger.warning(f"Erro ao buscar números da WABA {waba_id}: {r2.text}")
                    continue

                phones = r2.json().get("data", [])

                for phone in phones:
                    phone_number_id = phone["id"]

                    # Verificar duplicata
                    existente = db.query(DevNumero).filter(
                        DevNumero.phone_number_id == phone_number_id
                    ).first()
                    if existente:
                        if existente.dev_id != dev_id:
                            logger.warning(f"Número {phone_number_id} já pertence ao dev {existente.dev_id}")
                        continue

                    # Registrar no Cloud API da Meta
                    await register_phone_number(phone_number_id, access_token)

                    numero = DevNumero(
                        dev_id=dev_id,
                        phone_number_id=phone_number_id,
                        waba_id=waba_id,
                        whatsapp_token=access_token,
                        display_phone_number=phone.get("display_phone_number"),
                        verified_name=phone.get("verified_name"),
                        status="active",
                        ativo=True,
                    )
                    db.add(numero)
                    numeros_salvos.append({
                        "phone_number_id": phone_number_id,
                        "display": phone.get("display_phone_number") or phone_number_id,
                    })

                # Preencher campo legado do dev se for o primeiro número
                if phones and not dev.phone_number_id:
                    dev.phone_number_id = phones[0]["id"]
                    dev.waba_id = waba_id
                    dev.whatsapp_token = access_token

        db.commit()

        # Notificar webhook do dev sobre novos números
        if numeros_salvos and dev.webhook_url:
            try:
                from app.services.webhook_forwarder import forward_webhook_to_dev
                import asyncio
                for n in numeros_salvos:
                    asyncio.create_task(forward_webhook_to_dev(
                        dev_id=dev_id,
                        webhook_url=dev.webhook_url,
                        webhook_secret=dev.webhook_secret or "",
                        payload={
                            "event": "number_connected",
                            "phone_number_id": n["phone_number_id"],
                            "display_phone_number": n["display"],
                            "status": "active",
                        },
                    ))
            except Exception as e:
                logger.warning(f"Erro ao notificar webhook do dev {dev_id}: {e}")

        total = len(numeros_salvos)
        logger.info(f"Embedded Signup concluído: dev={dev_id}, números salvos={total}")

        if redirect_back_url:
            sep = "&" if "?" in redirect_back_url else "?"
            return RedirectResponse(url=f"{redirect_back_url}{sep}success=true&numeros={total}")

        msg = (
            f"{total} número(s) conectado(s) com sucesso!"
            if total else
            "Nenhum número novo encontrado. Pode já estar registrado."
        )
        return _html_resultado(True, msg)

    except Exception as e:
        logger.error(f"Erro no Embedded Signup callback (dev={dev_id}): {e}")
        if redirect_back_url:
            sep = "&" if "?" in redirect_back_url else "?"
            return RedirectResponse(url=f"{redirect_back_url}{sep}success=false&error=processing_error")
        return _html_resultado(False, "Erro ao processar autorização. Tente novamente ou contate o suporte.")


def _html_resultado(sucesso: bool, mensagem: str) -> HTMLResponse:
    cor = "#22c55e" if sucesso else "#ef4444"
    icon = "✅" if sucesso else "❌"
    titulo = "Conectado com sucesso!" if sucesso else "Erro na conexão"
    return HTMLResponse(content=f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{titulo}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #f8fafc; }}
    .card {{ background: #fff; border-radius: 16px; padding: 48px 40px; text-align: center;
             box-shadow: 0 4px 24px rgba(0,0,0,.08); max-width: 400px; width: 90%; }}
    .icon {{ font-size: 56px; margin-bottom: 16px; }}
    h1 {{ color: {cor}; font-size: 22px; margin: 0 0 12px; }}
    p {{ color: #64748b; font-size: 15px; margin: 0 0 8px; line-height: 1.6; }}
    .close {{ color: #94a3b8; font-size: 13px; margin-top: 20px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">{icon}</div>
    <h1>{titulo}</h1>
    <p>{mensagem}</p>
    <p class="close">Pode fechar esta janela e retornar ao sistema.</p>
  </div>
</body>
</html>""")
