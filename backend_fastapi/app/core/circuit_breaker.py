"""
Circuit Breaker para proteger chamadas à WhatsApp API
Previne cascading failures quando a API está indisponível
"""
import time
import logging
from typing import Callable, Any
from enum import Enum

logger = logging.getLogger(__name__)


class CircuitState(str, Enum):
    """Estados do Circuit Breaker"""
    CLOSED = "CLOSED"      # Tudo funcionando, chamadas passam
    OPEN = "OPEN"          # API down, bloqueia chamadas
    HALF_OPEN = "HALF_OPEN"  # Teste se API voltou


class CircuitBreaker:
    """
    Circuit Breaker simples para WhatsApp API

    Estados:
    - CLOSED: Funcionamento normal
    - OPEN: Após N falhas, bloqueia chamadas por timeout
    - HALF_OPEN: Após timeout, permite 1 chamada de teste

    Parâmetros:
    - failure_threshold: Número de falhas para abrir circuito
    - recovery_timeout: Tempo (segundos) até tentar novamente
    """

    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failures = 0
        self.state = CircuitState.CLOSED
        self.opened_at = None
        self.last_failure_time = None

    def call(self, func: Callable, *args, **kwargs) -> Any:
        """
        Executa função com proteção de circuit breaker

        Args:
            func: Função a ser executada
            *args, **kwargs: Argumentos da função

        Returns:
            Resultado da função

        Raises:
            Exception: Se circuit breaker está OPEN ou função falha
        """
        # Verificar estado atual
        if self.state == CircuitState.OPEN:
            # Verificar se passou tempo de recovery
            if time.time() - self.opened_at > self.recovery_timeout:
                logger.info("🔄 Circuit Breaker: OPEN → HALF_OPEN (testando recovery)")
                self.state = CircuitState.HALF_OPEN
            else:
                time_left = int(self.recovery_timeout - (time.time() - self.opened_at))
                error_msg = f"Circuit breaker OPEN - WhatsApp API indisponível (retry em {time_left}s)"
                logger.warning(f"🚫 {error_msg}")
                raise Exception(error_msg)

        try:
            # Executar função
            result = func(*args, **kwargs)
            self.on_success()
            return result

        except Exception as e:
            self.on_failure()
            raise e

    def on_success(self):
        """Callback de sucesso - reseta estado"""
        if self.state == CircuitState.HALF_OPEN:
            logger.info("✅ Circuit Breaker: HALF_OPEN → CLOSED (API recuperada)")

        self.failures = 0
        self.state = CircuitState.CLOSED
        self.last_failure_time = None

    def on_failure(self):
        """Callback de falha - incrementa contador"""
        self.failures += 1
        self.last_failure_time = time.time()

        logger.warning(f"⚠️ Circuit Breaker: Falha {self.failures}/{self.failure_threshold}")

        # Verificar se deve abrir circuito
        if self.failures >= self.failure_threshold:
            self.state = CircuitState.OPEN
            self.opened_at = time.time()
            logger.error(
                f"🔴 Circuit Breaker: CLOSED → OPEN "
                f"(threshold atingido: {self.failures} falhas)"
            )

        # Se estava em HALF_OPEN e falhou, volta para OPEN
        elif self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
            self.opened_at = time.time()
            logger.error("🔴 Circuit Breaker: HALF_OPEN → OPEN (recovery falhou)")

    def reset(self):
        """Reset manual do circuit breaker"""
        logger.info("🔄 Circuit Breaker: RESET manual")
        self.failures = 0
        self.state = CircuitState.CLOSED
        self.opened_at = None
        self.last_failure_time = None

    def get_state(self) -> dict:
        """Retorna estado atual do circuit breaker"""
        return {
            "state": self.state.value,
            "failures": self.failures,
            "threshold": self.failure_threshold,
            "opened_at": self.opened_at,
            "last_failure": self.last_failure_time
        }


# Singleton global para WhatsApp API
whatsapp_circuit_breaker = CircuitBreaker(
    failure_threshold=5,    # 5 falhas consecutivas
    recovery_timeout=60     # 60 segundos de espera
)
