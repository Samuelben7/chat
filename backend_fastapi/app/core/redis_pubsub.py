"""
Redis Pub/Sub Manager para broadcasts WebSocket
Suporta conexões assíncronas (FastAPI) e síncronas (Celery)
"""
import redis.asyncio as redis_async
import redis
from app.core.config import settings
import json
import logging
import asyncio
from typing import Callable, Optional
import time

logger = logging.getLogger(__name__)

# Import métricas
try:
    from app.core.metrics import (
        pubsub_published_total,
        pubsub_received_total,
        pubsub_latency,
        redis_pubsub_connected
    )
    METRICS_ENABLED = True
except ImportError:
    METRICS_ENABLED = False


class RedisPubSubManager:
    """Gerenciador Redis Pub/Sub para broadcasts WebSocket"""

    def __init__(self):
        self.pubsub: Optional[redis_async.client.PubSub] = None
        self.redis_async: Optional[redis_async.Redis] = None
        self.redis_sync: Optional[redis.Redis] = None
        self._running = False
        self._listener_task: Optional[asyncio.Task] = None

    async def connect(self):
        """Conecta subscriber async para FastAPI"""
        try:
            # Cliente async para subscriber
            self.redis_async = redis_async.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30,
            )

            # Cliente sync para publisher (usado pelo Celery)
            self.redis_sync = redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
            )

            # Criar PubSub e se inscrever em pattern
            self.pubsub = self.redis_async.pubsub()
            await self.pubsub.psubscribe("ws:broadcast:emp:*")

            # Métricas
            if METRICS_ENABLED:
                redis_pubsub_connected.set(1)

            logger.info("✅ Redis Pub/Sub conectado - padrão: ws:broadcast:emp:*")
            return True

        except Exception as e:
            logger.error(f"❌ Erro ao conectar Redis Pub/Sub: {e}")
            return False

    async def disconnect(self):
        """Desconecta e limpa recursos"""
        try:
            self._running = False

            if self._listener_task and not self._listener_task.done():
                self._listener_task.cancel()
                try:
                    await self._listener_task
                except asyncio.CancelledError:
                    pass

            if self.pubsub:
                await self.pubsub.punsubscribe("ws:broadcast:emp:*")
                await self.pubsub.close()

            if self.redis_async:
                await self.redis_async.close()

            if self.redis_sync:
                self.redis_sync.close()

            # Métricas
            if METRICS_ENABLED:
                redis_pubsub_connected.set(0)

            logger.info("✅ Redis Pub/Sub desconectado")

        except Exception as e:
            logger.error(f"❌ Erro ao desconectar Redis Pub/Sub: {e}")

    async def listen(self, callback: Callable):
        """
        Loop infinito ouvindo mensagens do Redis Pub/Sub

        Args:
            callback: Função async que recebe dict com a mensagem
        """
        if not self.pubsub:
            logger.error("❌ PubSub não conectado. Chame connect() primeiro.")
            return

        self._running = True
        logger.info("📡 Redis Pub/Sub listener iniciado")

        try:
            async for message in self.pubsub.listen():
                if not self._running:
                    break

                if message['type'] == 'pmessage':
                    start_time = time.time()
                    try:
                        # Pattern, channel, data
                        channel = message['channel']
                        data_str = message['data']

                        # Parse JSON
                        data = json.loads(data_str)

                        logger.debug(f"📨 Mensagem recebida em {channel}")

                        # Executar callback
                        await callback(data)

                        # Métricas
                        if METRICS_ENABLED:
                            latency = time.time() - start_time
                            pubsub_latency.observe(latency)
                            pubsub_received_total.labels(channel=channel).inc()

                    except json.JSONDecodeError as e:
                        logger.error(f"❌ Erro ao decodificar JSON: {e}")
                    except Exception as e:
                        logger.error(f"❌ Erro no callback: {e}")

        except asyncio.CancelledError:
            logger.info("📡 Redis Pub/Sub listener cancelado")
        except Exception as e:
            logger.error(f"❌ Erro no listener Redis Pub/Sub: {e}")
            # Auto-reconnect em caso de erro
            if self._running:
                logger.info("🔄 Tentando reconectar em 5 segundos...")
                await asyncio.sleep(5)
                await self.connect()
                await self.listen(callback)

    def publish(self, channel: str, data: dict) -> bool:
        """
        Publica mensagem (síncrono para Celery)

        Args:
            channel: Canal Redis (ex: ws:broadcast:emp:123)
            data: Dicionário com dados a enviar

        Returns:
            True se publicado com sucesso
        """
        if not self.redis_sync:
            logger.error("❌ Redis sync não conectado")
            return False

        start_time = time.time()
        try:
            # Serializar e publicar
            message_str = json.dumps(data, default=str)
            self.redis_sync.publish(channel, message_str)

            # Métricas
            if METRICS_ENABLED:
                latency = time.time() - start_time
                pubsub_latency.observe(latency)
                pubsub_published_total.labels(channel=channel).inc()

            logger.debug(f"📤 Mensagem publicada em {channel}")
            return True

        except Exception as e:
            logger.error(f"❌ Erro ao publicar mensagem: {e}")
            return False

    async def publish_async(self, channel: str, data: dict) -> bool:
        """
        Publica mensagem (assíncrono para FastAPI)

        Args:
            channel: Canal Redis (ex: ws:broadcast:emp:123)
            data: Dicionário com dados a enviar

        Returns:
            True se publicado com sucesso
        """
        if not self.redis_async:
            logger.error("❌ Redis async não conectado")
            return False

        try:
            # Serializar e publicar
            message_str = json.dumps(data, default=str)
            await self.redis_async.publish(channel, message_str)

            logger.debug(f"📤 Mensagem publicada em {channel}")
            return True

        except Exception as e:
            logger.error(f"❌ Erro ao publicar mensagem: {e}")
            return False


# Singleton global
pubsub_manager = RedisPubSubManager()
