"""
Endpoints de configuracao de webhook para devs.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
import secrets

from app.database.database import get_db
from app.models.models import DevUsuario, GatewayLog
from app.schemas.dev import WebhookConfigRequest, WebhookConfigResponse
from app.core.dependencies import CurrentDev
from app.services.webhook_forwarder import forward_webhook_to_dev

router = APIRouter(prefix="/dev/webhook", tags=["dev-webhook"])


@router.get("/config", response_model=WebhookConfigResponse)
async def get_webhook_config(
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db)
):
    """Retorna configuracao do webhook do dev."""
    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev nao encontrado")

    return WebhookConfigResponse(
        webhook_url=dev.webhook_url,
        webhook_secret=dev.webhook_secret or "",
        ativo=bool(dev.webhook_url),
    )


@router.post("/config", response_model=WebhookConfigResponse)
async def set_webhook_config(
    dados: WebhookConfigRequest,
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db)
):
    """Configura URL de webhook do dev."""
    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev nao encontrado")

    dev.webhook_url = dados.webhook_url

    # Gerar novo secret se nao existir
    if not dev.webhook_secret:
        dev.webhook_secret = secrets.token_hex(32)

    db.commit()

    return WebhookConfigResponse(
        webhook_url=dev.webhook_url,
        webhook_secret=dev.webhook_secret,
        ativo=True,
    )


@router.post("/test")
async def test_webhook(
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db)
):
    """Envia webhook de teste para a URL configurada."""
    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev nao encontrado")

    if not dev.webhook_url:
        raise HTTPException(status_code=400, detail="Webhook URL nao configurada")

    test_payload = {
        "event": "test",
        "timestamp": datetime.utcnow().isoformat(),
        "message": "Webhook de teste do WhatsApp Sistema",
        "data": {
            "from": "5511999999999",
            "type": "text",
            "text": {"body": "Mensagem de teste"},
        }
    }

    success = await forward_webhook_to_dev(
        webhook_url=dev.webhook_url,
        webhook_secret=dev.webhook_secret,
        payload=test_payload,
    )

    if success:
        return {"message": "Webhook de teste enviado com sucesso", "status": "delivered"}
    else:
        return {"message": "Falha ao entregar webhook de teste", "status": "failed"}


@router.get("/logs")
async def webhook_logs(
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db),
    limit: int = 20,
):
    """Retorna logs recentes de requisicoes do gateway (proxy para uso como historico)."""
    logs = db.query(GatewayLog).filter(
        GatewayLog.dev_id == dev_id,
    ).order_by(GatewayLog.timestamp.desc()).limit(min(limit, 100)).all()

    return {
        "logs": [
            {
                "id": log.id,
                "endpoint": log.endpoint,
                "status_code": log.status_code,
                "latency_ms": log.latency_ms,
                "timestamp": log.timestamp,
            }
            for log in logs
        ]
    }
