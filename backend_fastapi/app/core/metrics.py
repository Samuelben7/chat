"""
Métricas Prometheus para monitoramento do sistema
Rastreia latências, throughput, erros e estado do sistema
"""
from prometheus_client import Counter, Histogram, Gauge, generate_latest
import time
from functools import wraps
from typing import Callable
import logging

logger = logging.getLogger(__name__)


# ========== CONTADORES ==========

# WebSocket
ws_connections_total = Counter(
    'websocket_connections_total',
    'Total de conexões WebSocket estabelecidas',
    ['empresa_id']
)

ws_disconnections_total = Counter(
    'websocket_disconnections_total',
    'Total de desconexões WebSocket',
    ['empresa_id', 'reason']
)

ws_broadcasts_total = Counter(
    'websocket_broadcasts_total',
    'Total de broadcasts enviados',
    ['event', 'status']
)

ws_messages_received = Counter(
    'websocket_messages_received_total',
    'Total de mensagens recebidas via WebSocket',
    ['event']
)

# WhatsApp
whatsapp_sent_total = Counter(
    'whatsapp_sent_total',
    'Total de mensagens enviadas WhatsApp',
    ['status']  # success, error
)

whatsapp_received_total = Counter(
    'whatsapp_received_total',
    'Total de mensagens recebidas WhatsApp',
    ['empresa_id']
)

whatsapp_webhook_received = Counter(
    'whatsapp_webhook_received_total',
    'Total de webhooks recebidos do WhatsApp',
    ['type']  # message, status
)

# Redis Pub/Sub
pubsub_published_total = Counter(
    'pubsub_published_total',
    'Total de mensagens publicadas no Redis Pub/Sub',
    ['channel']
)

pubsub_received_total = Counter(
    'pubsub_received_total',
    'Total de mensagens recebidas do Redis Pub/Sub',
    ['channel']
)

# Cache
cache_hits = Counter(
    'redis_cache_hits_total',
    'Total de cache hits',
    ['cache_type']
)

cache_misses = Counter(
    'redis_cache_misses_total',
    'Total de cache misses',
    ['cache_type']
)

cache_invalidations = Counter(
    'redis_cache_invalidations_total',
    'Total de invalidações de cache',
    ['method']  # pattern, tag
)

# Erros
errors_total = Counter(
    'errors_total',
    'Total de erros',
    ['component', 'error_type']
)


# ========== HISTOGRAMAS (Latências) ==========

pubsub_latency = Histogram(
    'pubsub_latency_seconds',
    'Latência de publicação/recebimento Redis Pub/Sub',
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 1.0)
)

broadcast_latency = Histogram(
    'broadcast_latency_seconds',
    'Latência de broadcast WebSocket',
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 1.0)
)

whatsapp_api_latency = Histogram(
    'whatsapp_api_latency_seconds',
    'Latência de chamadas à WhatsApp API',
    buckets=(0.1, 0.25, 0.5, 0.75, 1.0, 2.0, 5.0, 10.0, 30.0)
)

webhook_processing_latency = Histogram(
    'webhook_processing_latency_seconds',
    'Latência de processamento de webhooks',
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0)
)

cache_operation_latency = Histogram(
    'cache_operation_latency_seconds',
    'Latência de operações de cache',
    ['operation'],  # get, set, delete, invalidate
    buckets=(0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1)
)

task_processing_latency = Histogram(
    'celery_task_latency_seconds',
    'Latência de execução de tasks Celery',
    ['task_name'],
    buckets=(0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0)
)


# ========== GAUGES (Estados) ==========

websocket_active_connections = Gauge(
    'websocket_active_connections',
    'Número de conexões WebSocket ativas',
    ['empresa_id']
)

websocket_total_active = Gauge(
    'websocket_total_active_connections',
    'Total geral de conexões WebSocket ativas'
)

cache_hit_rate = Gauge(
    'redis_cache_hit_rate',
    'Taxa de hit do cache (0-1)',
    ['cache_type']
)

circuit_breaker_state = Gauge(
    'circuit_breaker_state',
    'Estado do circuit breaker (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
    ['component']
)

circuit_breaker_failures = Gauge(
    'circuit_breaker_failures',
    'Número de falhas consecutivas do circuit breaker',
    ['component']
)

redis_pubsub_connected = Gauge(
    'redis_pubsub_connected',
    'Redis Pub/Sub conectado (0=desconectado, 1=conectado)'
)


# ========== DECORATORS PARA INSTRUMENTAÇÃO ==========

def track_latency(histogram: Histogram):
    """
    Decorator para rastrear latência de funções

    Usage:
        @track_latency(whatsapp_api_latency)
        def send_message():
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                return result
            finally:
                latency = time.time() - start_time
                histogram.observe(latency)
        return wrapper
    return decorator


def track_async_latency(histogram: Histogram):
    """
    Decorator para rastrear latência de funções async

    Usage:
        @track_async_latency(broadcast_latency)
        async def broadcast():
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                return result
            finally:
                latency = time.time() - start_time
                histogram.observe(latency)
        return wrapper
    return decorator


def count_calls(counter: Counter, labels: dict = None):
    """
    Decorator para contar chamadas de função

    Usage:
        @count_calls(whatsapp_sent_total, {'status': 'success'})
        def send_message():
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                result = func(*args, **kwargs)
                if labels:
                    counter.labels(**labels).inc()
                else:
                    counter.inc()
                return result
            except Exception as e:
                if labels:
                    error_labels = labels.copy()
                    error_labels['status'] = 'error'
                    counter.labels(**error_labels).inc()
                raise e
        return wrapper
    return decorator


# ========== HELPER FUNCTIONS ==========

def update_cache_hit_rate(cache_type: str, hits: int, total: int):
    """Atualiza taxa de hit do cache"""
    if total > 0:
        rate = hits / total
        cache_hit_rate.labels(cache_type=cache_type).set(rate)


def update_circuit_breaker_metrics(component: str, state: str, failures: int):
    """
    Atualiza métricas do circuit breaker

    Args:
        component: Nome do componente (ex: 'whatsapp_api')
        state: Estado atual ('CLOSED', 'HALF_OPEN', 'OPEN')
        failures: Número de falhas consecutivas
    """
    state_map = {'CLOSED': 0, 'HALF_OPEN': 1, 'OPEN': 2}
    state_value = state_map.get(state, 0)

    circuit_breaker_state.labels(component=component).set(state_value)
    circuit_breaker_failures.labels(component=component).set(failures)


def increment_error(component: str, error_type: str):
    """Incrementa contador de erros"""
    errors_total.labels(component=component, error_type=error_type).inc()


# ========== EXPORT FUNCTION ==========

def get_metrics():
    """Retorna métricas em formato Prometheus"""
    return generate_latest()
