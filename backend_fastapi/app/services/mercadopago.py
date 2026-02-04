"""
Integração completa com Mercado Pago para pagamentos (PIX e cartão).
"""
import httpx
from typing import Optional, Dict
from sqlalchemy.orm import Session
from app.models.models import Empresa, Contratacao
import logging

logger = logging.getLogger(__name__)


class MercadoPagoService:
    """Gerencia pagamentos via Mercado Pago (multi-tenant)."""

    def __init__(self, empresa: Empresa):
        """
        Inicializa o serviço com credenciais específicas da empresa.

        Args:
            empresa: Objeto Empresa contendo as credenciais Mercado Pago
        """
        if not empresa.mercadopago_access_token:
            raise ValueError(f"Empresa {empresa.nome} não possui credenciais do Mercado Pago configuradas")

        self.empresa = empresa
        self.access_token = empresa.mercadopago_access_token
        self.public_key = empresa.mercadopago_public_key
        self.base_url = "https://api.mercadopago.com"
        self.headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

    async def criar_preferencia_pagamento(
        self,
        contratacao: Contratacao,
        whatsapp_number: str,
        back_url_success: Optional[str] = None,
        back_url_failure: Optional[str] = None,
        back_url_pending: Optional[str] = None,
        notification_url: Optional[str] = None
    ) -> Optional[Dict]:
        """
        Cria uma preferência de pagamento no Mercado Pago (para cartão).

        Args:
            contratacao: Objeto Contratacao
            whatsapp_number: Número do WhatsApp do cliente
            back_url_success: URL de retorno em caso de sucesso
            back_url_failure: URL de retorno em caso de falha
            back_url_pending: URL de retorno para pendente
            notification_url: URL para webhook de notificações

        Returns:
            Dict com init_point (URL de pagamento) e preference_id ou None em caso de erro
        """
        try:
            servico = contratacao.tipo_servico
            cliente = contratacao.cliente

            # Monta dados da preferência
            preference_data = {
                "items": [
                    {
                        "title": f"{servico.descricao}",
                        "quantity": 1,
                        "unit_price": float(servico.preco),
                        "currency_id": "BRL",
                        "description": f"Serviço: {servico.descricao}. Endereço: {contratacao.endereco_servico}"
                    }
                ],
                "payer": {
                    "name": cliente.nome_completo,
                    "email": f"{whatsapp_number}@whatsapp.temp",
                    "phone": {
                        "area_code": whatsapp_number[2:4] if len(whatsapp_number) > 4 else "11",
                        "number": whatsapp_number[4:] if len(whatsapp_number) > 4 else whatsapp_number
                    },
                    "identification": {
                        "type": "CPF",
                        "number": cliente.cpf.replace('.', '').replace('-', '')
                    },
                    "address": {
                        "zip_code": cliente.cep.replace('-', ''),
                        "street_name": cliente.endereco_residencial,
                        "street_number": 1
                    }
                },
                "back_urls": {
                    "success": back_url_success or f"https://seusite.com/success",
                    "failure": back_url_failure or f"https://seusite.com/failure",
                    "pending": back_url_pending or f"https://seusite.com/pending",
                },
                "auto_return": "approved",
                "external_reference": f"contratacao_{contratacao.id}",
                "statement_descriptor": self.empresa.nome[:22],  # Máximo 22 caracteres
                "payment_methods": {
                    "excluded_payment_types": [],
                    "installments": 12  # Permite parcelamento em até 12x
                }
            }

            if notification_url:
                preference_data["notification_url"] = notification_url

            # Cria preferência
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/checkout/preferences",
                    headers=self.headers,
                    json=preference_data,
                    timeout=30.0
                )
                response.raise_for_status()
                preference = response.json()

            logger.info(f"Preferência criada para contratação {contratacao.id}: {preference['id']}")

            return {
                "init_point": preference["init_point"],  # URL de pagamento
                "preference_id": preference["id"],
                "sandbox_init_point": preference.get("sandbox_init_point")  # URL para testes
            }

        except Exception as e:
            logger.error(f"Erro ao criar preferência de pagamento: {e}")
            return None

    async def criar_pagamento_pix(self, contratacao: Contratacao) -> Optional[Dict]:
        """
        Cria um pagamento PIX direto.

        Args:
            contratacao: Objeto Contratacao

        Returns:
            Dict com qr_code, qr_code_base64 e payment_id ou None em caso de erro
        """
        try:
            servico = contratacao.tipo_servico
            cliente = contratacao.cliente

            payment_data = {
                "transaction_amount": float(servico.preco),
                "description": f"{servico.descricao}",
                "payment_method_id": "pix",
                "external_reference": f"contratacao_{contratacao.id}",
                "payer": {
                    "email": f"{cliente.whatsapp_number}@whatsapp.temp",
                    "first_name": cliente.nome_completo.split()[0],
                    "last_name": " ".join(cliente.nome_completo.split()[1:]) if len(cliente.nome_completo.split()) > 1 else "Cliente",
                    "identification": {
                        "type": "CPF",
                        "number": cliente.cpf.replace('.', '').replace('-', '')
                    }
                }
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/payments",
                    headers=self.headers,
                    json=payment_data,
                    timeout=30.0
                )
                response.raise_for_status()
                payment = response.json()

            logger.info(f"Pagamento PIX criado para contratação {contratacao.id}: {payment['id']}")

            return {
                "payment_id": payment["id"],
                "qr_code": payment["point_of_interaction"]["transaction_data"]["qr_code"],
                "qr_code_base64": payment["point_of_interaction"]["transaction_data"]["qr_code_base64"],
                "ticket_url": payment["point_of_interaction"]["transaction_data"].get("ticket_url")
            }

        except Exception as e:
            logger.error(f"Erro ao criar pagamento PIX: {e}")
            return None

    async def verificar_pagamento(self, payment_id: str) -> Optional[Dict]:
        """
        Verifica o status de um pagamento.

        Args:
            payment_id: ID do pagamento no Mercado Pago

        Returns:
            Dict com status, status_detail e outros dados ou None em caso de erro
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/v1/payments/{payment_id}",
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                payment = response.json()

            return {
                "id": payment["id"],
                "status": payment["status"],
                "status_detail": payment["status_detail"],
                "transaction_amount": payment["transaction_amount"],
                "date_approved": payment.get("date_approved"),
                "external_reference": payment.get("external_reference"),
                "payment_method_id": payment.get("payment_method_id")
            }

        except Exception as e:
            logger.error(f"Erro ao verificar pagamento {payment_id}: {e}")
            return None

    async def processar_webhook(self, data: Dict, db: Session) -> Optional[Dict]:
        """
        Processa notificação de webhook do Mercado Pago.

        Args:
            data: Dados do webhook
            db: Sessão do banco de dados

        Returns:
            Dict com informações do pagamento ou None em caso de erro
        """
        try:
            # Mercado Pago envia notificações de vários tipos
            tipo = data.get("type")

            if tipo == "payment":
                payment_id = data.get("data", {}).get("id")

                if not payment_id:
                    logger.warning("Webhook sem payment_id")
                    return None

                # Busca informações completas do pagamento
                payment_info = await self.verificar_pagamento(str(payment_id))

                if not payment_info:
                    return None

                # Extrai ID da contratação
                external_reference = payment_info.get("external_reference", "")

                if external_reference.startswith("contratacao_"):
                    contratacao_id = int(external_reference.replace("contratacao_", ""))

                    try:
                        contratacao = db.query(Contratacao).filter(
                            Contratacao.id == contratacao_id,
                            Contratacao.cliente.has(empresa_id=self.empresa.id)
                        ).first()

                        if not contratacao:
                            logger.error(f"Contratação {contratacao_id} não encontrada ou não pertence à empresa")
                            return None

                        # Atualiza status baseado no status do pagamento
                        if payment_info["status"] == "approved":
                            contratacao.status_pagamento = "pago"
                        elif payment_info["status"] in ["rejected", "cancelled"]:
                            contratacao.status_pagamento = "cancelado"
                        else:
                            contratacao.status_pagamento = "pendente"

                        db.commit()

                        logger.info(f"Contratação {contratacao_id} atualizada: {contratacao.status_pagamento}")

                        return {
                            "contratacao_id": contratacao_id,
                            "status": payment_info["status"],
                            "payment_id": payment_id
                        }

                    except Exception as e:
                        logger.error(f"Erro ao processar contratação: {e}")
                        db.rollback()
                        return None

            return None

        except Exception as e:
            logger.error(f"Erro ao processar webhook: {e}")
            return None


async def gerar_link_pagamento_cartao(
    empresa: Empresa,
    contratacao: Contratacao,
    whatsapp_number: str,
    notification_url: Optional[str] = None
) -> Optional[str]:
    """
    Função auxiliar para gerar link de pagamento com cartão.
    """
    try:
        service = MercadoPagoService(empresa)
        resultado = await service.criar_preferencia_pagamento(
            contratacao,
            whatsapp_number,
            notification_url=notification_url
        )

        if resultado:
            # Em produção, usar init_point. Em desenvolvimento, usar sandbox_init_point
            return resultado.get("sandbox_init_point") or resultado["init_point"]

        return None

    except Exception as e:
        logger.error(f"Erro ao gerar link de pagamento: {e}")
        return None


async def gerar_pix(empresa: Empresa, contratacao: Contratacao) -> Optional[Dict]:
    """
    Função auxiliar para gerar pagamento PIX.
    """
    try:
        service = MercadoPagoService(empresa)
        return await service.criar_pagamento_pix(contratacao)

    except Exception as e:
        logger.error(f"Erro ao gerar PIX: {e}")
        return None
