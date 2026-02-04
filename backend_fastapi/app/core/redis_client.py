"""
Cliente Redis centralizado com cache estratégico
Banco de dados = Fonte de verdade
Redis = Cache de leitura
"""
import redis
from app.core.config import settings
import json
from typing import Optional, Any, List
import pickle
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class RedisClient:
    """Cliente Redis singleton com métodos de cache otimizados"""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            try:
                cls._instance.client = redis.from_url(
                    settings.REDIS_URL,
                    decode_responses=False,
                    socket_connect_timeout=5,
                    socket_timeout=5,
                    retry_on_timeout=True,
                    health_check_interval=30,
                    max_connections=50
                )
                logger.info("✅ Redis conectado com sucesso")
            except Exception as e:
                logger.error(f"❌ Erro ao conectar Redis: {e}")
                cls._instance.client = None
        return cls._instance

    @property
    def is_available(self) -> bool:
        """Verifica se Redis está disponível"""
        if not self.client:
            return False
        try:
            self.client.ping()
            return True
        except:
            return False

    # ========== CACHE JSON ==========

    def get_json(self, key: str) -> Optional[dict]:
        """Pega valor JSON do cache"""
        if not self.is_available:
            return None

        try:
            data = self.client.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.error(f"Erro ao pegar JSON do cache {key}: {e}")

        return None

    def set_json(self, key: str, value: dict, ttl: int = 300):
        """Salva valor JSON no cache com TTL"""
        if not self.is_available:
            return False

        try:
            self.client.setex(key, ttl, json.dumps(value, default=str))
            return True
        except Exception as e:
            logger.error(f"Erro ao salvar JSON no cache {key}: {e}")
            return False

    # ========== CACHE PICKLE (Objetos Python) ==========

    def get_pickle(self, key: str) -> Optional[Any]:
        """Pega objeto Python do cache"""
        if not self.is_available:
            return None

        try:
            data = self.client.get(key)
            if data:
                return pickle.loads(data)
        except Exception as e:
            logger.error(f"Erro ao pegar pickle do cache {key}: {e}")

        return None

    def set_pickle(self, key: str, value: Any, ttl: int = 300):
        """Salva objeto Python no cache com TTL"""
        if not self.is_available:
            return False

        try:
            self.client.setex(key, ttl, pickle.dumps(value))
            return True
        except Exception as e:
            logger.error(f"Erro ao salvar pickle no cache {key}: {e}")
            return False

    # ========== INVALIDAÇÃO ==========

    def delete(self, key: str):
        """Deleta uma chave específica"""
        if not self.is_available:
            return False

        try:
            self.client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Erro ao deletar cache {key}: {e}")
            return False

    def invalidate_pattern(self, pattern: str):
        """Invalida múltiplas chaves por pattern"""
        if not self.is_available:
            return 0

        try:
            keys = list(self.client.scan_iter(match=pattern))
            if keys:
                return self.client.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Erro ao invalidar pattern {pattern}: {e}")
            return 0

    # ========== CACHE DE LISTAS ==========

    def get_list(self, key: str) -> Optional[List]:
        """Pega lista do cache"""
        return self.get_json(key)

    def set_list(self, key: str, items: List, ttl: int = 300):
        """Salva lista no cache"""
        return self.set_json(key, items, ttl)

    # ========== COUNTERS ==========

    def incr(self, key: str, amount: int = 1) -> int:
        """Incrementa contador"""
        if not self.is_available:
            return 0

        try:
            return self.client.incrby(key, amount)
        except Exception as e:
            logger.error(f"Erro ao incrementar {key}: {e}")
            return 0

    def decr(self, key: str, amount: int = 1) -> int:
        """Decrementa contador"""
        if not self.is_available:
            return 0

        try:
            return self.client.decrby(key, amount)
        except Exception as e:
            logger.error(f"Erro ao decrementar {key}: {e}")
            return 0

    def get_counter(self, key: str) -> int:
        """Pega valor do contador"""
        if not self.is_available:
            return 0

        try:
            val = self.client.get(key)
            return int(val) if val else 0
        except Exception as e:
            logger.error(f"Erro ao pegar contador {key}: {e}")
            return 0

    # ========== SESSIONS (Hash) ==========

    def hset(self, key: str, field: str, value: str):
        """Set hash field"""
        if not self.is_available:
            return False

        try:
            self.client.hset(key, field, value)
            return True
        except Exception as e:
            logger.error(f"Erro hset {key}.{field}: {e}")
            return False

    def hget(self, key: str, field: str) -> Optional[str]:
        """Get hash field"""
        if not self.is_available:
            return None

        try:
            val = self.client.hget(key, field)
            return val.decode() if val else None
        except Exception as e:
            logger.error(f"Erro hget {key}.{field}: {e}")
            return None

    def hgetall(self, key: str) -> dict:
        """Get all hash fields"""
        if not self.is_available:
            return {}

        try:
            data = self.client.hgetall(key)
            return {k.decode(): v.decode() for k, v in data.items()}
        except Exception as e:
            logger.error(f"Erro hgetall {key}: {e}")
            return {}

    def expire(self, key: str, ttl: int):
        """Set TTL em chave existente"""
        if not self.is_available:
            return False

        try:
            self.client.expire(key, ttl)
            return True
        except Exception as e:
            logger.error(f"Erro ao setar TTL {key}: {e}")
            return False

    # ========== CACHE HELPERS ESPECÍFICOS ==========

    def cache_empresa(self, empresa_id: int, data: dict, ttl: int = 3600):
        """Cache de dados de empresa (1 hora)"""
        key = f"empresa:id:{empresa_id}"
        return self.set_json(key, data, ttl)

    def get_empresa(self, empresa_id: int) -> Optional[dict]:
        """Pega empresa do cache"""
        key = f"empresa:id:{empresa_id}"
        return self.get_json(key)

    def invalidate_empresa(self, empresa_id: int):
        """Invalida cache de empresa"""
        self.delete(f"empresa:id:{empresa_id}")
        self.invalidate_pattern(f"empresa:phone:*")  # Também por phone_id

    def cache_conversas(self, empresa_id: int, status: str, data: List[dict], ttl: int = 30):
        """Cache de lista de conversas (30 segundos)"""
        key = f"conversas:emp:{empresa_id}:status:{status}"
        return self.set_json(key, data, ttl)

    def get_conversas(self, empresa_id: int, status: str) -> Optional[List[dict]]:
        """Pega conversas do cache"""
        key = f"conversas:emp:{empresa_id}:status:{status}"
        return self.get_json(key)

    def invalidate_conversas(self, empresa_id: int):
        """Invalida cache de conversas ao receber nova mensagem"""
        pattern = f"conversas:emp:{empresa_id}:*"
        return self.invalidate_pattern(pattern)

    def cache_atendentes(self, empresa_id: int, data: List[dict], ttl: int = 300):
        """Cache de lista de atendentes (5 minutos)"""
        key = f"atendentes:empresa:{empresa_id}"
        return self.set_json(key, data, ttl)

    def get_atendentes(self, empresa_id: int) -> Optional[List[dict]]:
        """Pega atendentes do cache"""
        key = f"atendentes:empresa:{empresa_id}"
        return self.get_json(key)

    def invalidate_atendentes(self, empresa_id: int):
        """Invalida cache de atendentes"""
        self.delete(f"atendentes:empresa:{empresa_id}")


# Singleton global
redis_cache = RedisClient()
