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

    async def create_or_get_customer(self, email: str) -> Optional[str]:
        """Cria ou recupera um Customer no MP pelo email. Retorna customer_id."""
        try:
            async with httpx.AsyncClient() as client:
                # Buscar customer existente
                search = await client.get(
                    f"{self.base_url}/v1/customers/search",
                    headers=self.headers,
                    params={"email": email},
                    timeout=15.0,
                )
                if search.status_code == 200:
                    data = search.json()
                    if data.get("paging", {}).get("total", 0) > 0:
                        customer_id = data["results"][0]["id"]
                        logger.info(f"Customer MP existente para {email}: {customer_id}")
                        return customer_id

                # Criar novo customer
                create = await client.post(
                    f"{self.base_url}/v1/customers",
                    headers=self.headers,
                    json={"email": email},
                    timeout=15.0,
                )
                create.raise_for_status()
                customer_id = create.json()["id"]
                logger.info(f"Customer MP criado para {email}: {customer_id}")
                return customer_id

        except Exception as e:
            logger.error(f"Erro ao criar/buscar customer MP para {email}: {e}")
            return None

    async def pre_autorizar_e_registrar_cartao(
        self,
        card_token: str,
        customer_id: str,
        payment_method_id: str,
        email: str,
        dev_id: int,
    ) -> Dict:
        """
        Verifica e registra cartão para cobranças futuras sem CVV via pré-autorização de R$1.

        Fluxo:
        1. Faz pré-auth R$1 com capture=false → MP reserva mas NÃO debita, e salva o cartão
           linkado ao customer automaticamente (pager.type=customer).
        2. Cancela a pré-auth imediatamente.
        3. Retorna card_id permanente para cobranças recorrentes.

        Raises:
            Exception: Se o cartão for recusado ou erro na API.
        """
        import uuid
        idempotency_key = f"verify-card-{dev_id}-{uuid.uuid4().hex[:8]}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Passo 1: pré-autorização (não debita)
            preauth_resp = await client.post(
                f"{self.base_url}/v1/payments",
                headers={**self.headers, "X-Idempotency-Key": idempotency_key},
                json={
                    "transaction_amount": 1.00,
                    "token": card_token,
                    "description": "Verificacao de cartao - plataforma",
                    "payment_method_id": payment_method_id,
                    "installments": 1,
                    "capture": False,
                    "external_reference": f"verify_card_dev_{dev_id}",
                    "payer": {
                        "type": "customer",
                        "id": customer_id,
                        "email": email,
                    },
                },
            )

            if preauth_resp.status_code not in (200, 201):
                err = preauth_resp.json()
                msg = err.get("message", "Cartão recusado")
                logger.error(f"Pré-auth recusada para dev {dev_id}: {preauth_resp.text}")
                raise Exception(msg)

            preauth = preauth_resp.json()
            payment_id = preauth["id"]
            card_info = preauth.get("card", {})
            card_id = card_info.get("id")
            last4 = card_info.get("last_four_digits", "****")
            pm_detected = preauth.get("payment_method_id", payment_method_id)

            logger.info(f"Pré-auth criada: payment={payment_id} status={preauth.get('status')} card={card_id}")

            # Passo 2: cancelar a pré-auth imediatamente
            cancel_resp = await client.put(
                f"{self.base_url}/v1/payments/{payment_id}",
                headers={**self.headers, "X-Idempotency-Key": f"{idempotency_key}-cancel"},
                json={"status": "cancelled"},
            )
            if cancel_resp.status_code in (200, 201):
                logger.info(f"Pré-auth {payment_id} cancelada com sucesso")
            else:
                logger.warning(f"Pré-auth {payment_id} não cancelada automaticamente: {cancel_resp.text}")

        return {
            "card_id": card_id,
            "last4": last4,
            "payment_method_id": pm_detected,
            "preauth_payment_id": str(payment_id),
        }

    async def save_card(self, customer_id: str, card_token: str) -> Optional[Dict]:
        """
        Salva cartao de credito em um Customer MP usando token do MercadoPago.js.
        Retorna card_id permanente para cobranças futuras sem precisar de novo token.
        NOTA: Prefira pre_autorizar_e_registrar_cartao() para garantir cobranças sem CVV.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/customers/{customer_id}/cards",
                    headers=self.headers,
                    json={"token": card_token},
                    timeout=15.0,
                )
                response.raise_for_status()
                card = response.json()

            logger.info(f"Cartao salvo para customer {customer_id}: {card.get('id')}")
            return {
                "card_id": card["id"],
                "last4": card.get("last_four_digits", "****"),
                "payment_method_id": card.get("payment_method_id", ""),
                "expiration_month": card.get("expiration_month"),
                "expiration_year": card.get("expiration_year"),
            }

        except Exception as e:
            logger.error(f"Erro ao salvar cartao para customer {customer_id}: {e}")
            return None

    async def charge_saved_card(
        self,
        customer_id: str,
        card_id: str,
        payment_method_id: str,
        amount: float,
        description: str,
        external_reference: str = "",
    ) -> Optional[Dict]:
        """
        Cobra cartao salvo de um Customer MP sem redirect e sem novo token.
        Usado para cobrança mensal automatica de numeros dos devs.
        """
        try:
            payload = {
                "transaction_amount": round(amount, 2),
                "description": description,
                "payment_method_id": payment_method_id,
                "installments": 1,
                "external_reference": external_reference,
                "payer": {
                    "type": "customer",
                    "id": customer_id,
                },
                "token": card_id,  # ID do cartao salvo funciona como token para customers
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/payments",
                    headers=self.headers,
                    json=payload,
                    timeout=30.0,
                )
                response.raise_for_status()
                payment = response.json()

            logger.info(f"Cobrança customer {customer_id}: payment {payment['id']} - {payment['status']}")
            return {
                "payment_id": str(payment["id"]),
                "status": payment["status"],
                "status_detail": payment.get("status_detail", ""),
            }

        except Exception as e:
            logger.error(f"Erro ao cobrar customer {customer_id} card {card_id}: {e}")
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
