"""
Tasks de cobrança mensal de numeros de devs.
Cobra R$35/numero/mes usando cartao salvo (Customer+Card MP).
"""
from datetime import datetime, timedelta, timezone
import logging

from app.tasks.celery_app import celery_app
from app.database.database import SessionLocal
from app.models.models import DevUsuario, DevNumero, Pagamento

logger = logging.getLogger("billing_tasks")

PRECO_POR_NUMERO = 35.0


@celery_app.task(name="app.tasks.billing_tasks.cobrar_numeros_devs_task")
def cobrar_numeros_devs_task():
    """
    Task mensal: cobra R$35 x quantidade de numeros ativos de cada dev.
    Só cobra devs que:
    - Tem cartao salvo (mp_customer_id + mp_card_id)
    - Tem pelo menos 1 numero ativo
    - Trial encerrado (trial_fim < now)
    - Nao foi cobrado este mes ainda (proximo_cobr_numeros <= now ou null)
    """
    import asyncio
    from app.services.mercadopago_platform import MercadoPagoPlatformService

    db = SessionLocal()
    cobrados = 0
    erros = 0

    try:
        now = datetime.now(timezone.utc)

        devs = db.query(DevUsuario).filter(
            DevUsuario.ativo == True,
            DevUsuario.mp_customer_id.isnot(None),
            DevUsuario.mp_card_id.isnot(None),
        ).all()

        for dev in devs:
            try:
                # Verificar trial ainda ativo
                if dev.trial_fim and dev.trial_fim.replace(tzinfo=timezone.utc) > now:
                    continue

                # Verificar se ja cobrou este mes
                if dev.proximo_cobr_numeros:
                    proxima = dev.proximo_cobr_numeros
                    if proxima.tzinfo is None:
                        proxima = proxima.replace(tzinfo=timezone.utc)
                    if proxima > now:
                        continue

                # Contar numeros ativos
                numeros_count = db.query(DevNumero).filter(
                    DevNumero.dev_id == dev.id,
                    DevNumero.ativo == True,
                    DevNumero.status == "active",
                ).count()

                if numeros_count == 0:
                    continue

                valor_total = numeros_count * PRECO_POR_NUMERO

                # Cobrar via MP Customer+Card
                mp = MercadoPagoPlatformService()
                result = asyncio.get_event_loop().run_until_complete(
                    mp.charge_saved_card(
                        customer_id=dev.mp_customer_id,
                        card_id=dev.mp_card_id,
                        payment_method_id=dev.mp_card_method or "visa",
                        amount=valor_total,
                        description=f"API Gateway WhatsApp - {numeros_count} numero(s) - {now.strftime('%m/%Y')}",
                        external_reference=f"dev_{dev.id}_numeros_{now.strftime('%Y%m')}",
                    )
                )

                if result and result["status"] == "approved":
                    # Registrar pagamento
                    pagamento = Pagamento(
                        tipo_usuario="dev",
                        dev_id=dev.id,
                        valor=valor_total,
                        metodo="credit_card",
                        status="approved",
                        mp_payment_id=result["payment_id"],
                    )
                    db.add(pagamento)

                    # Atualizar proxima cobrança (30 dias)
                    dev.proximo_cobr_numeros = now + timedelta(days=30)
                    dev.status = "active"
                    db.commit()
                    cobrados += 1
                    logger.info(f"Dev {dev.email}: R${valor_total:.2f} cobrado ({numeros_count} numeros) - payment {result['payment_id']}")

                elif result and result["status"] in ("rejected", "cancelled"):
                    # Pagamento rejeitado
                    dev.status = "overdue"
                    db.commit()
                    erros += 1
                    logger.warning(f"Dev {dev.email}: cobrança rejeitada - {result.get('status_detail')}")

                else:
                    # in_process ou erro
                    logger.info(f"Dev {dev.email}: cobrança em processamento - {result}")

            except Exception as e:
                logger.error(f"Erro ao cobrar dev {dev.id} ({dev.email}): {e}")
                erros += 1
                db.rollback()

    except Exception as e:
        logger.error(f"Erro geral em cobrar_numeros_devs_task: {e}")
    finally:
        db.close()

    logger.info(f"Cobrança mensal concluida: {cobrados} cobrados, {erros} erros")
    return {"cobrados": cobrados, "erros": erros}
