"""
Rate limiter com sliding window via Redis.
Duas janelas: requests/min + mensagens/mes.
"""
import time
from datetime import datetime
from app.core.redis_client import redis_cache
from app.core.config import settings
import logging

logger = logging.getLogger("rate_limiter")


class RateLimiter:
    """Sliding window rate limiter usando Redis ZADD/ZRANGEBYSCORE."""

    def __init__(self):
        self.redis = redis_cache.client

    def check_rate_limit(self, dev_id: int, limit_per_min: int = None) -> dict:
        """
        Verifica rate limit por minuto (sliding window).
        Retorna {allowed: bool, current: int, limit: int, retry_after: int}
        """
        limit = limit_per_min or settings.GATEWAY_RATE_LIMIT_PER_MIN
        now = time.time()
        key = f"gateway:rate:{dev_id}"

        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(key, 0, now - 60)
        pipe.zadd(key, {f"{now}:{id(key)}": now})
        pipe.zcard(key)
        pipe.expire(key, 120)
        results = pipe.execute()

        count = results[2]

        return {
            "allowed": count <= limit,
            "current": count,
            "limit": limit,
            "retry_after": 60 if count > limit else 0,
        }

    def check_monthly_limit(self, dev_id: int, limit: int = None) -> dict:
        """
        Verifica limite mensal de mensagens.
        """
        msg_limit = limit or settings.GATEWAY_MESSAGES_PER_MONTH
        month_key = f"gateway:msgs:{dev_id}:{datetime.utcnow().strftime('%Y-%m')}"

        count = int(self.redis.get(month_key) or 0)

        return {
            "allowed": count < msg_limit,
            "current": count,
            "limit": msg_limit,
        }

    def increment_monthly(self, dev_id: int):
        """Incrementa contador mensal de mensagens."""
        month_key = f"gateway:msgs:{dev_id}:{datetime.utcnow().strftime('%Y-%m')}"
        pipe = self.redis.pipeline()
        pipe.incr(month_key)
        pipe.expire(month_key, 86400 * 35)
        pipe.execute()


rate_limiter = RateLimiter()
