"""
Servico Mercado Pago da PLATAFORMA (diferente do MP por empresa).
Usado para cobrar assinaturas de empresas e devs.
"""
import httpx
import logging
from typing import Optional, Dict
from app.core.config import settings

logger = logging.getLogger("mp_platform")


class MercadoPagoPlatformService:
    """Gerencia pagamentos da plataforma via Mercado Pago."""

    def __init__(self):
        if not settings.MP_ACCESS_TOKEN:
            raise ValueError("MP_ACCESS_TOKEN nao configurado")
        self.access_token = settings.MP_ACCESS_TOKEN
        self.base_url = "https://api.mercadopago.com"
        self.headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    async def create_pix_payment(
        self,
        assinatura_id: int,
        valor: float,
        email: str,
        descricao: str,
    ) -> Optional[Dict]:
        """Cria pagamento PIX e retorna QR code."""
        try:
            payment_data = {
                "transaction_amount": valor,
                "description": descricao,
                "payment_method_id": "pix",
                "external_reference": f"assinatura_{assinatura_id}",
                "payer": {
                    "email": email,
                },
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/payments",
                    headers=self.headers,
                    json=payment_data,
                    timeout=30.0,
                )
                response.raise_for_status()
                payment = response.json()

            logger.info(f"PIX criado para assinatura {assinatura_id}: {payment['id']}")

            return {
                "payment_id": str(payment["id"]),
                "qr_code": payment["point_of_interaction"]["transaction_data"]["qr_code"],
                "qr_code_base64": payment["point_of_interaction"]["transaction_data"]["qr_code_base64"],
                "ticket_url": payment["point_of_interaction"]["transaction_data"].get("ticket_url"),
                "status": payment["status"],
            }

        except Exception as e:
            logger.error(f"Erro ao criar PIX: {e}")
            return None

    async def create_card_payment(
        self,
        assinatura_id: int,
        valor: float,
        token_cartao: str,
        email: str,
        parcelas: int = 1,
    ) -> Optional[Dict]:
        """Processa pagamento com cartao (token do MercadoPago.js)."""
        try:
            payment_data = {
                "transaction_amount": valor,
                "token": token_cartao,
                "description": f"Assinatura Plataforma WhatsApp",
                "installments": parcelas,
                "payment_method_id": "master",  # sera detectado pelo token
                "external_reference": f"assinatura_{assinatura_id}",
                "payer": {
                    "email": email,
                },
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/payments",
                    headers=self.headers,
                    json=payment_data,
                    timeout=30.0,
                )
                response.raise_for_status()
                payment = response.json()

            logger.info(f"Cartao processado para assinatura {assinatura_id}: {payment['id']} - {payment['status']}")

            return {
                "payment_id": str(payment["id"]),
                "status": payment["status"],
                "status_detail": payment.get("status_detail", ""),
            }

        except Exception as e:
            logger.error(f"Erro ao processar cartao: {e}")
            return None

    async def get_payment_status(self, mp_payment_id: str) -> Optional[Dict]:
        """Verifica status de pagamento no Mercado Pago."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/v1/payments/{mp_payment_id}",
                    headers=self.headers,
                    timeout=30.0,
                )
                response.raise_for_status()
                payment = response.json()

            return {
                "id": str(payment["id"]),
                "status": payment["status"],
                "status_detail": payment.get("status_detail", ""),
                "transaction_amount": payment["transaction_amount"],
                "date_approved": payment.get("date_approved"),
                "external_reference": payment.get("external_reference"),
                "payment_method_id": payment.get("payment_method_id"),
            }

        except Exception as e:
            logger.error(f"Erro ao verificar pagamento {mp_payment_id}: {e}")
            return None

    async def refund_payment(self, mp_payment_id: str) -> Optional[Dict]:
        """Reembolsa pagamento completo."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/payments/{mp_payment_id}/refunds",
                    headers=self.headers,
                    json={},
                    timeout=30.0,
                )
                response.raise_for_status()
                refund = response.json()

            logger.info(f"Reembolso processado para pagamento {mp_payment_id}: {refund.get('id')}")

            return {
                "refund_id": str(refund.get("id", "")),
                "status": refund.get("status", ""),
                "amount": refund.get("amount", 0),
            }

        except Exception as e:
            logger.error(f"Erro ao reembolsar pagamento {mp_payment_id}: {e}")
            return None
