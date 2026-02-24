from celery import Celery
from app.core.config import settings

# Criar instância do Celery
celery_app = Celery(
    "whatsapp_sistema",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=['app.tasks.tasks']
)

# Configurações do Celery
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='America/Sao_Paulo',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,  # 10 minutos (para envio em massa)
    worker_prefetch_multiplier=4,
    worker_max_tasks_per_child=1000,
)

# Configurar tarefas periódicas (Celery Beat)
celery_app.conf.beat_schedule = {
    'limpar-logs-antigos': {
        'task': 'app.tasks.tasks.limpar_logs_antigos',
        'schedule': 86400.0,  # A cada 24 horas
    },
    'gerar-estatisticas-diarias': {
        'task': 'app.tasks.tasks.gerar_estatisticas',
        'schedule': 3600.0,  # A cada 1 hora
    },
    'limpar-imagens-orfas-templates': {
        'task': 'app.tasks.tasks.limpar_imagens_orfas_templates',
        'schedule': 86400.0,  # A cada 24 horas
    },
    'verificar-vencimentos': {
        'task': 'app.tasks.tasks.verificar_vencimentos_task',
        'schedule': 86400.0,  # Diario
    },
    'verificar-trials-dev': {
        'task': 'app.tasks.tasks.verificar_trials_dev_task',
        'schedule': 86400.0,  # Diario
    },
    'sincronizar-limites-waba': {
        'task': 'app.tasks.tasks.sincronizar_limites_waba_task',
        'schedule': 604800.0,  # Semanal (7 dias)
    },
}

print("✅ Celery configurado com sucesso!")
