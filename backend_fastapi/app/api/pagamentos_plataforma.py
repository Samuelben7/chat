"""
Endpoints de pagamento da plataforma (PIX + Cartao via Mercado Pago).
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List
import logging

from app.database.database import get_db
from app.models.models import Assinatura, Pagamento, Plano, DevUsuario, Empresa, DevNumero
from app.schemas.planos import (
    PagamentoPixRequest, PagamentoPixResponse,
    PagamentoCartaoRequest, PagamentoCartaoResponse,
    PagamentoResponse,
)
from app.core.dependencies import CurrentUser
from app.services.mercadopago_platform import MercadoPagoPlatformService

logger = logging.getLogger("pagamentos_plataforma")

router = APIRouter(prefix="/pagamentos", tags=["pagamentos-plataforma"])


@router.post("/pix", response_model=PagamentoPixResponse)
async def gerar_pix(
    dados: PagamentoPixRequest,
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Gera QR code PIX para pagamento de assinatura."""
    assinatura = db.query(Assinatura).filter(Assinatura.id == dados.assinatura_id).first()
    if not assinatura:
        raise HTTPException(status_code=404, detail="Assinatura nao encontrada")

    plano = db.query(Plano).filter(Plano.id == assinatura.plano_id).first()
    if not plano:
        raise HTTPException(status_code=404, detail="Plano nao encontrado")

    try:
        mp = MercadoPagoPlatformService()
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = await mp.create_pix_payment(
        assinatura_id=assinatura.id,
        valor=float(plano.preco_mensal),
        email=dados.email,
        descricao=f"Assinatura {plano.nome} - WhatsApp Sistema",
    )

    if not result:
        raise HTTPException(status_code=500, detail="Erro ao gerar PIX")

    # Salvar pagamento no DB
    pagamento = Pagamento(
        assinatura_id=assinatura.id,
        tipo_usuario=assinatura.tipo_usuario,
        empresa_id=assinatura.empresa_id,
        dev_id=assinatura.dev_id,
        valor=plano.preco_mensal,
        metodo="pix",
        status="pending",
        mp_payment_id=result["payment_id"],
        mp_pix_qr_code=result["qr_code"],
        mp_pix_qr_code_base64=result["qr_code_base64"],
    )
    db.add(pagamento)
    db.commit()

    return PagamentoPixResponse(
        payment_id=result["payment_id"],
        qr_code=result["qr_code"],
        qr_code_base64=result["qr_code_base64"],
        valor=float(plano.preco_mensal),
    )


@router.post("/cartao", response_model=PagamentoCartaoResponse)
async def pagar_cartao(
    dados: PagamentoCartaoRequest,
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Processa pagamento com cartao (token do MercadoPago.js)."""
    assinatura = db.query(Assinatura).filter(Assinatura.id == dados.assinatura_id).first()
    if not assinatura:
        raise HTTPException(status_code=404, detail="Assinatura nao encontrada")

    plano = db.query(Plano).filter(Plano.id == assinatura.plano_id).first()
    if not plano:
        raise HTTPException(status_code=404, detail="Plano nao encontrado")

    try:
        mp = MercadoPagoPlatformService()
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = await mp.create_card_payment(
        assinatura_id=assinatura.id,
        valor=float(plano.preco_mensal),
        token_cartao=dados.token_cartao,
        email=dados.email,
        parcelas=dados.parcelas,
    )

    if not result:
        raise HTTPException(status_code=500, detail="Erro ao processar cartao")

    # Salvar pagamento
    pagamento = Pagamento(
        assinatura_id=assinatura.id,
        tipo_usuario=assinatura.tipo_usuario,
        empresa_id=assinatura.empresa_id,
        dev_id=assinatura.dev_id,
        valor=plano.preco_mensal,
        metodo="credit_card",
        status=result["status"],
        mp_payment_id=result["payment_id"],
    )
    db.add(pagamento)

    # Se aprovado, estender assinatura
    if result["status"] == "approved":
        assinatura.status = "active"
        assinatura.data_proximo_vencimento = datetime.utcnow() + timedelta(days=30)

        # Atualizar status do dev/empresa
        if assinatura.dev_id:
            dev = db.query(DevUsuario).filter(DevUsuario.id == assinatura.dev_id).first()
            if dev:
                dev.status = "active"

    db.commit()

    return PagamentoCartaoResponse(
        payment_id=result["payment_id"],
        status=result["status"],
        status_detail=result.get("status_detail", ""),
        valor=float(plano.preco_mensal),
    )


@router.get("/meus", response_model=List[PagamentoResponse])
async def meus_pagamentos(
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Historico de pagamentos do usuario."""
    query = db.query(Pagamento)

    if user.role == "dev":
        query = query.filter(Pagamento.dev_id == user.dev_id)
    else:
        query = query.filter(
            Pagamento.empresa_id == user.empresa_id
        )

    pagamentos = query.order_by(Pagamento.criado_em.desc()).limit(50).all()
    return pagamentos


@router.get("/status/{payment_id}")
async def verificar_status_pagamento(
    payment_id: str,
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Verifica status atualizado de um pagamento no Mercado Pago."""
    pagamento = db.query(Pagamento).filter(
        Pagamento.mp_payment_id == payment_id
    ).first()

    if not pagamento:
        raise HTTPException(status_code=404, detail="Pagamento nao encontrado")

    try:
        mp = MercadoPagoPlatformService()
        status_info = await mp.get_payment_status(payment_id)
    except Exception:
        return {"status": pagamento.status, "source": "db"}

    if status_info:
        # Atualizar status local
        old_status = pagamento.status
        pagamento.status = status_info["status"]
        db.commit()

        # Se mudou para approved, ativar assinatura
        if old_status != "approved" and status_info["status"] == "approved":
            assinatura = db.query(Assinatura).filter(
                Assinatura.id == pagamento.assinatura_id
            ).first()
            if assinatura:
                assinatura.status = "active"
                assinatura.data_proximo_vencimento = datetime.utcnow() + timedelta(days=30)
                if assinatura.dev_id:
                    dev = db.query(DevUsuario).filter(DevUsuario.id == assinatura.dev_id).first()
                    if dev:
                        dev.status = "active"
                db.commit()

        return status_info

    return {"status": pagamento.status, "source": "db"}


@router.post("/webhook/mp")
async def webhook_mercadopago(request: Request, db: Session = Depends(get_db)):
    """
    Webhook IPN do Mercado Pago para pagamentos da plataforma.
    Quando aprovado: estende assinatura 30 dias.
    """
    try:
        data = await request.json()
    except Exception:
        return {"status": "ok"}

    tipo = data.get("type")
    if tipo != "payment":
        return {"status": "ok"}

    payment_id = str(data.get("data", {}).get("id", ""))
    if not payment_id:
        return {"status": "ok"}

    # Buscar pagamento no DB
    pagamento = db.query(Pagamento).filter(
        Pagamento.mp_payment_id == payment_id
    ).first()

    if not pagamento:
        logger.warning(f"Webhook MP: pagamento {payment_id} nao encontrado no DB")
        return {"status": "ok"}

    # Verificar status no MP
    try:
        mp = MercadoPagoPlatformService()
        status_info = await mp.get_payment_status(payment_id)
    except Exception as e:
        logger.error(f"Erro verificando pagamento no webhook: {e}")
        return {"status": "ok"}

    if not status_info:
        return {"status": "ok"}

    old_status = pagamento.status
    pagamento.status = status_info["status"]

    # Se aprovado, estender assinatura 30 dias
    if status_info["status"] == "approved" and old_status != "approved":
        assinatura = db.query(Assinatura).filter(
            Assinatura.id == pagamento.assinatura_id
        ).first()

        if assinatura:
            assinatura.status = "active"
            assinatura.data_proximo_vencimento = datetime.utcnow() + timedelta(days=30)
            assinatura.data_bloqueio = None

            # Desbloquear dev/empresa
            if assinatura.dev_id:
                dev = db.query(DevUsuario).filter(DevUsuario.id == assinatura.dev_id).first()
                if dev:
                    dev.status = "active"
            elif assinatura.empresa_id:
                empresa = db.query(Empresa).filter(Empresa.id == assinatura.empresa_id).first()
                if empresa:
                    empresa.ativa = True

            logger.info(f"Assinatura {assinatura.id} ativada via webhook MP")

    db.commit()

    return {"status": "ok"}


@router.post("/webhook/mp/preapproval")
async def webhook_mercadopago_preapproval(request: Request, db: Session = Depends(get_db)):
    """
    Webhook de assinaturas recorrentes (preapproval) do Mercado Pago.
    Ativado quando dev autoriza ou cancela assinatura de numero WhatsApp.
    """
    try:
        data = await request.json()
    except Exception:
        return {"status": "ok"}

    tipo = data.get("type")
    preapproval_id = str(data.get("data", {}).get("id", ""))

    if tipo not in ("preapproval", "subscription_preapproval") or not preapproval_id:
        return {"status": "ok"}

    # Buscar numero pelo preapproval_id
    numero = db.query(DevNumero).filter(
        DevNumero.mp_preapproval_id == preapproval_id
    ).first()

    if not numero:
        logger.warning(f"Webhook preapproval {preapproval_id} sem DevNumero correspondente")
        return {"status": "ok"}

    # Verificar status atual na API MP
    try:
        mp = MercadoPagoPlatformService()
        info = await mp.get_preapproval_status(preapproval_id)
    except Exception as e:
        logger.error(f"Erro verificando preapproval no webhook: {e}")
        return {"status": "ok"}

    if not info:
        return {"status": "ok"}

    old_status = numero.mp_subscription_status
    numero.mp_subscription_status = info["status"]

    if info["status"] == "authorized" and old_status != "authorized":
        numero.status = "active"
        logger.info(f"Numero {numero.phone_number_id} ativado via preapproval autorizado (dev {numero.dev_id})")

    elif info["status"] == "cancelled":
        numero.status = "suspended"
        logger.info(f"Numero {numero.phone_number_id} suspenso: preapproval cancelado (dev {numero.dev_id})")

    db.commit()
    return {"status": "ok"}
