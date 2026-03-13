"""
Tasks Celery para tracking de conversões.
Executadas apenas quando o primeiro contato chega via WhatsApp.
Separadas por plataforma: Meta CAPI e Google GA4.
"""
import logging

from app.tasks.celery_app import celery_app
from app.database.database import SessionLocal
from app.models.models import Empresa
from app.services.tracking import disparar_meta_capi, disparar_google_ga4

logger = logging.getLogger("tracking_tasks")


# ─── Meta Conversions API ─────────────────────────────────────────────────────

@celery_app.task(
    name="app.tasks.tracking_tasks.task_meta_conversao",
    max_retries=2,
    default_retry_delay=30,
)
def task_meta_conversao(empresa_id: int, numero_whatsapp: str, evento: str = "Lead"):
    """
    Dispara evento Lead para a Meta Conversions API.
    Só executada se a empresa tem meta_pixel_id + meta_capi_token configurados.
    """
    db = SessionLocal()
    try:
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            logger.warning(f"Meta CAPI: empresa {empresa_id} não encontrada")
            return

        pixel_id = getattr(empresa, "meta_pixel_id", None)
        token = getattr(empresa, "meta_capi_token", None)
        if not pixel_id or not token:
            logger.debug(f"Meta CAPI: empresa {empresa_id} sem configuração — pulando")
            return

        ok = disparar_meta_capi(pixel_id, token, numero_whatsapp, evento)
        return {"ok": ok, "empresa_id": empresa_id, "numero": numero_whatsapp}

    except Exception as e:
        logger.error(f"Meta CAPI task erro empresa={empresa_id}: {e}")
    finally:
        db.close()


# ─── Google Analytics 4 ───────────────────────────────────────────────────────

@celery_app.task(
    name="app.tasks.tracking_tasks.task_google_conversao",
    max_retries=2,
    default_retry_delay=30,
)
def task_google_conversao(empresa_id: int, numero_whatsapp: str, evento: str = "generate_lead"):
    """
    Dispara evento generate_lead para o Google Analytics 4 via Measurement Protocol.
    Pode ser importado como conversão no Google Ads.
    Só executada se a empresa tem google_gtag_id + google_api_secret configurados.
    """
    db = SessionLocal()
    try:
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            logger.warning(f"Google GA4: empresa {empresa_id} não encontrada")
            return

        gtag_id = getattr(empresa, "google_gtag_id", None)
        api_secret = getattr(empresa, "google_api_secret", None)
        if not gtag_id or not api_secret:
            logger.debug(f"Google GA4: empresa {empresa_id} sem configuração — pulando")
            return

        ok = disparar_google_ga4(gtag_id, api_secret, numero_whatsapp, evento)
        return {"ok": ok, "empresa_id": empresa_id, "numero": numero_whatsapp}

    except Exception as e:
        logger.error(f"Google GA4 task erro empresa={empresa_id}: {e}")
    finally:
        db.close()
