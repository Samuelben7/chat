"""
Endpoints para pagamentos (Mercado Pago webhook + consulta).
"""
from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.orm import Session
import logging

from app.database.database import get_db
from app.models.models import Empresa, Contratacao, ChatSessao, MensagemLog
from app.services.mercadopago import MercadoPagoService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pagamentos", tags=["pagamentos"])


@router.post("/webhook/mercadopago")
async def webhook_mercadopago(request: Request, db: Session = Depends(get_db)):
    """
    Webhook do Mercado Pago para notificacoes de pagamento.
    Recebe notificacoes de pagamento aprovado/rejeitado/pendente.
    Atualiza contratacao e notifica cliente via WhatsApp.
    """
    try:
        body = await request.json()
        logger.info(f"Webhook Mercado Pago recebido: {body}")

        tipo = body.get("type")
        if tipo != "payment":
            return {"status": "ok", "message": "Tipo ignorado"}

        payment_id = body.get("data", {}).get("id")
        if not payment_id:
            return {"status": "ok", "message": "Sem payment_id"}

        # Precisamos descobrir qual empresa esse pagamento pertence
        # Tentamos buscar por external_reference
        # O formato e: "contratacao_{id}" ou "bot_fluxo_{fluxo_id}_{number}_{timestamp}"

        # Tentar em todas as empresas com MP configurado
        empresas = db.query(Empresa).filter(
            Empresa.mercadopago_access_token.isnot(None),
            Empresa.ativa == True,
        ).all()

        for empresa in empresas:
            try:
                mp_service = MercadoPagoService(empresa)
                payment_info = await mp_service.verificar_pagamento(str(payment_id))

                if not payment_info:
                    continue

                external_ref = payment_info.get("external_reference", "")
                status = payment_info.get("status", "")

                # Pagamento de contratacao (fluxo hardcoded)
                if external_ref.startswith("contratacao_"):
                    contratacao_id = int(external_ref.replace("contratacao_", ""))
                    contratacao = db.query(Contratacao).filter(
                        Contratacao.id == contratacao_id,
                    ).first()

                    if contratacao:
                        if status == "approved":
                            contratacao.status_pagamento = "pago"
                        elif status in ("rejected", "cancelled"):
                            contratacao.status_pagamento = "cancelado"

                        db.commit()
                        logger.info(f"Contratacao {contratacao_id} atualizada: {status}")

                        # Notificar cliente via WhatsApp
                        if status == "approved" and contratacao.cliente:
                            try:
                                from app.services.whatsapp import WhatsAppService
                                wa = WhatsAppService(empresa)
                                await wa.send_text_message(
                                    contratacao.cliente.whatsapp_number,
                                    f"Pagamento confirmado!\n\n"
                                    f"Servico: {contratacao.tipo_servico.descricao}\n"
                                    f"Valor: R$ {float(contratacao.tipo_servico.preco):.2f}\n\n"
                                    f"Obrigado pela confianca!"
                                )
                            except Exception as e:
                                logger.error(f"Erro ao notificar cliente: {e}")

                        return {"status": "ok", "contratacao_id": contratacao_id}

                # Pagamento do bot builder (PIX node)
                if external_ref.startswith("bot_fluxo_"):
                    parts = external_ref.split("_")
                    # bot_fluxo_{fluxo_id}_{number}_{timestamp}
                    if len(parts) >= 4:
                        whatsapp_number = parts[3]

                        if status == "approved":
                            try:
                                from app.services.whatsapp import WhatsAppService
                                wa = WhatsAppService(empresa)
                                await wa.send_text_message(
                                    whatsapp_number,
                                    "Pagamento PIX confirmado! Obrigado.\n\n"
                                    "Seu pagamento foi processado com sucesso."
                                )

                                # Salvar no log
                                msg = MensagemLog(
                                    empresa_id=empresa.id,
                                    whatsapp_number=whatsapp_number,
                                    direcao="enviada",
                                    tipo_mensagem="text",
                                    conteudo="[Pagamento PIX confirmado automaticamente]",
                                    dados_extras={"payment_id": str(payment_id), "status": status},
                                    estado_sessao="pagamento_confirmado",
                                )
                                db.add(msg)
                                db.commit()

                            except Exception as e:
                                logger.error(f"Erro ao notificar pagamento bot: {e}")

                        return {"status": "ok", "external_ref": external_ref}

            except Exception as e:
                logger.error(f"Erro ao processar pagamento para empresa {empresa.id}: {e}")
                continue

        return {"status": "ok", "message": "Processado"}

    except Exception as e:
        logger.error(f"Erro no webhook Mercado Pago: {e}")
        # Sempre retornar 200 para MP nao reenviar
        return {"status": "error", "message": str(e)}
