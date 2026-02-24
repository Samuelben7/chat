"""
Rastreamento de uso do API Gateway.
Contadores Redis + GatewayLog no DB.
"""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.redis_client import redis_cache
from app.models.models import GatewayLog
import logging

logger = logging.getLogger("usage_tracker")


class UsageTracker:
    """Rastreia uso do gateway por dev."""

    def __init__(self):
        self.redis = redis_cache.client

    def track_request(self, db: Session, dev_id: int, api_key_id: int = None,
                      endpoint: str = None, status_code: int = 200, latency_ms: int = 0):
        """Registra uma requisicao no gateway."""
        try:
            log = GatewayLog(
                dev_id=dev_id,
                api_key_id=api_key_id,
                endpoint=endpoint,
                status_code=status_code,
                latency_ms=latency_ms,
            )
            db.add(log)
            db.commit()
        except Exception as e:
            logger.warning(f"Erro ao registrar log: {e}")
            db.rollback()

    def get_usage_summary(self, dev_id: int, db: Session) -> dict:
        """Retorna resumo de uso do dev."""
        now = datetime.utcnow()

        # Requests hoje (do DB)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        requests_today = db.query(func.count(GatewayLog.id)).filter(
            GatewayLog.dev_id == dev_id,
            GatewayLog.timestamp >= today_start,
        ).scalar() or 0

        # Requests neste minuto (Redis)
        rate_key = f"gateway:rate:{dev_id}"
        requests_this_minute = self.redis.zcard(rate_key) or 0

        # Mensagens este mes (Redis)
        month_key = f"gateway:msgs:{dev_id}:{now.strftime('%Y-%m')}"
        messages_this_month = int(self.redis.get(month_key) or 0)

        return {
            "requests_today": requests_today,
            "requests_this_minute": requests_this_minute,
            "messages_this_month": messages_this_month,
        }

    def get_usage_history(self, dev_id: int, db: Session, days: int = 30) -> list:
        """Retorna historico de uso dos ultimos N dias."""
        cutoff = datetime.utcnow() - timedelta(days=days)

        daily = db.query(
            func.date(GatewayLog.timestamp).label('date'),
            func.count(GatewayLog.id).label('requests'),
            func.avg(GatewayLog.latency_ms).label('avg_latency'),
        ).filter(
            GatewayLog.dev_id == dev_id,
            GatewayLog.timestamp >= cutoff,
        ).group_by(
            func.date(GatewayLog.timestamp)
        ).order_by(
            func.date(GatewayLog.timestamp)
        ).all()

        return [
            {
                "date": str(row.date),
                "requests": row.requests,
                "avg_latency_ms": round(float(row.avg_latency or 0), 1),
            }
            for row in daily
        ]


usage_tracker = UsageTracker()
