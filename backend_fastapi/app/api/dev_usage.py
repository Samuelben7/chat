"""
Endpoints de uso e metricas para desenvolvedores.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.database.database import get_db
from app.core.dependencies import CurrentDev
from app.core.redis_client import redis_cache
from app.services.usage_tracker import usage_tracker
from app.models.models import Assinatura

router = APIRouter(prefix="/dev/usage", tags=["dev-usage"])


@router.get("")
async def get_usage(
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db)
):
    """Dashboard de uso do dev."""
    summary = usage_tracker.get_usage_summary(dev_id, db)

    # Buscar limites do plano
    assinatura = db.query(Assinatura).filter(
        Assinatura.dev_id == dev_id,
        Assinatura.status == "active"
    ).first()

    limits = {
        "requests_min": 60,
        "conversas_mes": 1000,  # limite: 1000 conversas únicas/mês (números diferentes)
    }
    if assinatura and assinatura.plano and assinatura.plano.limites:
        limits.update(assinatura.plano.limites)

    # Conversas únicas = números distintos contactados no mês via /messages
    mes_atual = datetime.now(timezone.utc).strftime("%Y-%m")
    conversas_unicas = redis_cache.client.scard(f"gateway:conversas:{dev_id}:{mes_atual}") or 0

    summary["conversas_this_month"] = int(conversas_unicas)
    summary["limits"] = limits
    summary["percentage"] = {
        "conversas": round(
            (int(conversas_unicas) / limits["conversas_mes"]) * 100, 1
        ) if limits["conversas_mes"] > 0 else 0,
        "messages": round(
            (summary.get("messages_this_month", 0) / limits["conversas_mes"]) * 100, 1
        ) if limits["conversas_mes"] > 0 else 0,
    }

    return summary


@router.get("/history")
async def get_usage_history(
    days: int = 30,
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db)
):
    """Historico de uso dos ultimos N dias."""
    history = usage_tracker.get_usage_history(dev_id, db, days=min(days, 90))
    return {"history": history}
