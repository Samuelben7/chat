"""
Gerenciamento de numeros WhatsApp por desenvolvedor (multi-numero).
Cada numero tem assinatura recorrente R$35/mes via Mercado Pago.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel
import logging
import json
import secrets
import urllib.parse

from app.database.database import get_db
from app.models.models import DevUsuario, DevNumero
from app.core.dependencies import CurrentDev
from app.core.config import settings
from app.core.redis_client import redis_cache

logger = logging.getLogger("dev_numeros")

router = APIRouter(prefix="/dev/numeros", tags=["dev-numeros"])

PRECO_POR_NUMERO = 35.0  # R$ por mes


# ==================== SCHEMAS ====================

class ConectarNumeroRequest(BaseModel):
    code: str
    waba_id: str
    phone_number_id: str


class NumeroResponse(BaseModel):
    id: int
    phone_number_id: str
    waba_id: str
    display_phone_number: Optional[str] = None
    verified_name: Optional[str] = None
    status: str
    mp_subscription_status: Optional[str] = None
    mp_init_point: Optional[str] = None
    primeiro_uso_em: Optional[datetime] = None
    ativo: bool
    criado_em: datetime

    class Config:
        from_attributes = True


class NumeroListResponse(BaseModel):
    numeros: List[NumeroResponse]
    total: int
    valor_mensal_total: float


# ==================== ENDPOINTS ====================

@router.post("/connect", response_model=NumeroResponse, status_code=201)
async def conectar_numero(
    dados: ConectarNumeroRequest,
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db),
):
    """
    Registra novo numero WhatsApp para o dev via Embedded Signup (Facebook Login).
    Cria assinatura recorrente R$35/mes no Mercado Pago.
    """
    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev nao encontrado")

    # Verificar se numero ja esta registrado para outro dev
    existente = db.query(DevNumero).filter(
        DevNumero.phone_number_id == dados.phone_number_id
    ).first()
    if existente:
        if existente.dev_id == dev_id:
            raise HTTPException(status_code=409, detail="Numero ja registrado para sua conta")
        raise HTTPException(status_code=409, detail="Numero ja registrado por outro desenvolvedor")

    # Trocar code por token via Meta
    from app.services.meta_signup import (
        exchange_code_for_token,
        subscribe_app_to_waba,
        assign_system_user_to_waba,
        register_phone_number,
    )

    access_token = await exchange_code_for_token(dados.code)

    if settings.META_SYSTEM_USER_ID:
        try:
            await assign_system_user_to_waba(dados.waba_id, access_token, settings.META_SYSTEM_USER_ID)
        except Exception as e:
            logger.warning(f"Erro ao atribuir System User ao WABA: {e}")

    subscribe_token = settings.META_PLATFORM_TOKEN if settings.META_PLATFORM_TOKEN else access_token
    await subscribe_app_to_waba(dados.waba_id, subscribe_token)
    await register_phone_number(dados.phone_number_id, access_token)

    # Buscar display_phone_number da Meta
    display_phone = None
    verified_name = None
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"https://graph.facebook.com/v20.0/{dados.phone_number_id}",
                params={
                    "fields": "display_phone_number,verified_name",
                    "access_token": access_token,
                },
            )
            if r.status_code == 200:
                info = r.json()
                display_phone = info.get("display_phone_number")
                verified_name = info.get("verified_name")
    except Exception as e:
        logger.warning(f"Nao foi possivel buscar info do numero na Meta: {e}")

    # Criar DevNumero
    numero = DevNumero(
        dev_id=dev_id,
        phone_number_id=dados.phone_number_id,
        waba_id=dados.waba_id,
        whatsapp_token=access_token,
        display_phone_number=display_phone,
        verified_name=verified_name,
        status="active",  # ativo imediatamente; cobranca ocorre via Celery mensal
        ativo=True,
    )
    db.add(numero)

    # Atualizar tambem o campo legado do DevUsuario (compatibilidade)
    if not dev.phone_number_id:
        dev.phone_number_id = dados.phone_number_id
        dev.waba_id = dados.waba_id
        dev.whatsapp_token = access_token

    db.commit()
    db.refresh(numero)

    logger.info(f"Numero {dados.phone_number_id} registrado para dev {dev_id}")
    return numero


@router.get("", response_model=NumeroListResponse)
async def listar_numeros(
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db),
):
    """Lista todos os numeros registrados pelo dev."""
    numeros = db.query(DevNumero).filter(
        DevNumero.dev_id == dev_id,
        DevNumero.ativo == True,
    ).order_by(DevNumero.criado_em.desc()).all()

    total = len(numeros)
    valor_total = total * PRECO_POR_NUMERO

    return NumeroListResponse(
        numeros=numeros,
        total=total,
        valor_mensal_total=valor_total,
    )


@router.get("/{numero_id}", response_model=NumeroResponse)
async def obter_numero(
    numero_id: int,
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db),
):
    """Detalhes de um numero especifico."""
    numero = db.query(DevNumero).filter(
        DevNumero.id == numero_id,
        DevNumero.dev_id == dev_id,
    ).first()
    if not numero:
        raise HTTPException(status_code=404, detail="Numero nao encontrado")
    return numero


@router.delete("/{numero_id}")
async def cancelar_numero(
    numero_id: int,
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db),
):
    """
    Cancela um numero: cancela assinatura MP e desativa o numero.
    """
    numero = db.query(DevNumero).filter(
        DevNumero.id == numero_id,
        DevNumero.dev_id == dev_id,
    ).first()
    if not numero:
        raise HTTPException(status_code=404, detail="Numero nao encontrado")

    # Cancelar assinatura MP
    if numero.mp_preapproval_id:
        try:
            from app.services.mercadopago_platform import MercadoPagoPlatformService
            mp = MercadoPagoPlatformService()
            await mp.cancel_preapproval(numero.mp_preapproval_id)
            numero.mp_subscription_status = "cancelled"
        except Exception as e:
            logger.warning(f"Erro ao cancelar preapproval {numero.mp_preapproval_id}: {e}")

    numero.ativo = False
    numero.status = "cancelled"

    # Limpar chave Redis de primeiro uso
    try:
        from app.core.redis_client import redis_cache
        redis_cache.client.delete(f"dev:numero:first_use:{dev_id}:{numero.phone_number_id}")
    except Exception:
        pass

    db.commit()
    logger.info(f"Numero {numero.phone_number_id} cancelado para dev {dev_id}")
    return {"sucesso": True, "mensagem": "Numero cancelado com sucesso"}


class SignupLinkRequest(BaseModel):
    redirect_back_url: Optional[str] = None  # URL para redirecionar o cliente após autorizar


class SignupLinkResponse(BaseModel):
    signup_url: str
    expires_in: int  # segundos
    session_id: str


class SalvarCartaoRequest(BaseModel):
    card_token: str       # Token gerado pelo MercadoPago.js
    payment_method_id: str  # visa/master/elo/etc (retornado pelo MP.js)
    last4: str            # Ultimos 4 digitos (para exibicao)


@router.post("/signup-link", response_model=SignupLinkResponse)
async def gerar_signup_link(
    dados: SignupLinkRequest,
    dev_id: CurrentDev = None,
):
    """
    Gera um link de Embedded Signup (Meta OAuth) para o dev compartilhar com seu cliente.
    O cliente clica no link, faz login no Facebook, autoriza o WhatsApp Business,
    e a Meta redireciona para o nosso callback — que salva o número automaticamente.
    O dev não precisa coletar code/waba_id/phone_number_id: tudo é resolvido server-side.

    redirect_back_url (opcional): URL do sistema do dev para redirecionar o cliente após o processo.
    Retornará ?success=true&numeros=N ou ?success=false&error=... nessa URL.
    """
    session_id = secrets.token_urlsafe(32)
    session_data = json.dumps({
        "dev_id": dev_id,
        "redirect_back_url": dados.redirect_back_url or "",
    })
    redis_cache.client.setex(f"es:session:{session_id}", 3600, session_data)

    redirect_uri = f"{settings.PUBLIC_BASE_URL}{settings.API_V1_STR}/webhook/embedded-signup"
    signup_url = (
        "https://www.facebook.com/dialog/oauth"
        f"?client_id={settings.META_APP_ID}"
        f"&redirect_uri={urllib.parse.quote(redirect_uri, safe='')}"
        f"&config_id={settings.META_ES_CONFIG_ID}"
        f"&response_type=code"
        f"&state={session_id}"
        f"&scope=whatsapp_business_management,whatsapp_business_messaging"
    )

    logger.info(f"Signup link gerado para dev {dev_id}, sessão {session_id[:8]}...")
    return SignupLinkResponse(signup_url=signup_url, expires_in=3600, session_id=session_id)


@router.get("/{numero_id}/status", response_model=NumeroResponse)
async def status_numero(
    numero_id: int,
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db),
):
    """
    Retorna o status atual de um número registrado.
    Útil para o sistema do dev fazer polling após o cliente concluir o Embedded Signup.
    Rate-limit suave: 1 requisição a cada 10 segundos por número.
    """
    rate_key = f"es:status_poll:{dev_id}:{numero_id}"
    if redis_cache.client.get(rate_key):
        raise HTTPException(status_code=429, detail="Aguarde alguns segundos antes de verificar novamente.")
    redis_cache.client.setex(rate_key, 10, "1")

    numero = db.query(DevNumero).filter(
        DevNumero.id == numero_id,
        DevNumero.dev_id == dev_id,
    ).first()
    if not numero:
        raise HTTPException(status_code=404, detail="Numero nao encontrado")
    return numero


@router.post("/pagamento/salvar-cartao")
async def salvar_cartao_dev(
    dados: SalvarCartaoRequest,
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db),
):
    """
    Salva cartao de credito do dev para cobrança automatica mensal.
    Usa MercadoPago Customer + Card API (sem redirect, sem preapproval).
    O token e gerado pelo MercadoPago.js no frontend (PCI-compliant).
    """
    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev nao encontrado")

    try:
        from app.services.mercadopago_platform import MercadoPagoPlatformService
        mp = MercadoPagoPlatformService()

        # Criar ou recuperar Customer no MP
        customer_id = await mp.create_or_get_customer(dev.email)
        if not customer_id:
            raise HTTPException(status_code=500, detail="Erro ao criar customer no Mercado Pago")

        # Salvar cartao usando token do MercadoPago.js
        card_result = await mp.save_card(customer_id, dados.card_token)
        if not card_result:
            raise HTTPException(status_code=500, detail="Erro ao salvar cartao no Mercado Pago")

        # Persistir no DevUsuario
        dev.mp_customer_id = customer_id
        dev.mp_card_id = card_result["card_id"]
        dev.mp_card_last4 = dados.last4 or card_result.get("last4", "****")
        dev.mp_card_method = dados.payment_method_id or card_result.get("payment_method_id", "")
        db.commit()

        logger.info(f"Cartao salvo para dev {dev_id}: customer={customer_id} card={card_result['card_id']}")
        return {
            "sucesso": True,
            "last4": dev.mp_card_last4,
            "payment_method_id": dev.mp_card_method,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao salvar cartao dev {dev_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao salvar cartao")


@router.get("/pagamento/status-cartao")
async def status_cartao_dev(
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db),
):
    """Retorna status do cartao salvo e proxima data de cobrança."""
    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev nao encontrado")

    numeros_ativos = db.query(DevNumero).filter(
        DevNumero.dev_id == dev_id,
        DevNumero.ativo == True,
        DevNumero.status == "active",
    ).count()

    return {
        "cartao_configurado": bool(dev.mp_card_id),
        "last4": dev.mp_card_last4,
        "payment_method": dev.mp_card_method,
        "numeros_ativos": numeros_ativos,
        "valor_proximo_cobr": numeros_ativos * PRECO_POR_NUMERO,
        "proximo_cobr_em": dev.proximo_cobr_numeros,
    }
