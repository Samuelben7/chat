"""
Tracking: Meta Conversions API (CAPI) + Google Analytics 4 Measurement Protocol.
Disparado server-side quando novo contato chega via WhatsApp.
"""
import hashlib
import logging
import time
import httpx

logger = logging.getLogger("tracking")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _hash_phone(numero: str) -> str:
    """Normaliza e faz SHA-256 do número de telefone (padrão Meta CAPI)."""
    # Remove tudo que não é dígito, garante prefixo 55 (Brasil)
    digits = "".join(c for c in numero if c.isdigit())
    if not digits.startswith("55") and len(digits) <= 11:
        digits = "55" + digits
    return hashlib.sha256(digits.encode()).hexdigest()


# ─── Meta Conversions API ─────────────────────────────────────────────────────

META_CAPI_URL = "https://graph.facebook.com/v19.0/{pixel_id}/events"

def disparar_meta_capi(
    pixel_id: str,
    access_token: str,
    numero_whatsapp: str,
    evento: str = "Lead",
) -> bool:
    """
    Dispara evento para a Meta via Conversions API (server-side).
    Retorna True se sucesso.
    Evento padrão: 'Lead' (recomendado para contato via WhatsApp).
    """
    url = META_CAPI_URL.format(pixel_id=pixel_id)
    phone_hash = _hash_phone(numero_whatsapp)
    event_time = int(time.time())

    payload = {
        "data": [
            {
                "event_name": evento,
                "event_time": event_time,
                "action_source": "other",  # WhatsApp não é "website", usar "other"
                "user_data": {
                    "ph": [phone_hash],  # telefone hasheado
                },
            }
        ],
        "access_token": access_token,
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(url, json=payload)
            data = resp.json()

        if resp.status_code == 200 and data.get("events_received"):
            logger.info(f"Meta CAPI pixel={pixel_id} evento={evento} recebido={data['events_received']}")
            return True
        else:
            logger.warning(f"Meta CAPI pixel={pixel_id} status={resp.status_code} resp={data}")
            return False

    except Exception as e:
        logger.error(f"Meta CAPI pixel={pixel_id} erro={e}")
        return False


# ─── Google Analytics 4 Measurement Protocol ─────────────────────────────────

GA4_MP_URL = "https://www.google-analytics.com/mp/collect"

def disparar_google_ga4(
    gtag_id: str,
    api_secret: str,
    numero_whatsapp: str,
    evento: str = "generate_lead",
) -> bool:
    """
    Dispara evento GA4 via Measurement Protocol (server-side).
    Esse evento pode ser importado como conversão no Google Ads.
    gtag_id: ID de medição GA4 no formato G-XXXXXXXXXX
    """
    # client_id sintético baseado no número (consistente por contato)
    client_id = hashlib.sha256(numero_whatsapp.encode()).hexdigest()[:20]

    params = {"measurement_id": gtag_id, "api_secret": api_secret}
    payload = {
        "client_id": client_id,
        "events": [
            {
                "name": evento,
                "params": {
                    "method": "whatsapp",
                    "engagement_time_msec": "1",
                },
            }
        ],
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(GA4_MP_URL, params=params, json=payload)

        # GA4 MP retorna 204 em sucesso (sem body)
        if resp.status_code in (200, 204):
            logger.info(f"Google GA4 gtag={gtag_id} evento={evento}")
            return True
        else:
            logger.warning(f"Google GA4 gtag={gtag_id} status={resp.status_code}")
            return False

    except Exception as e:
        logger.error(f"Google GA4 gtag={gtag_id} erro={e}")
        return False
