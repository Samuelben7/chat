from celery import shared_task
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import httpx
from typing import Dict, Any
import json

from app.tasks.celery_app import celery_app
from app.database.database import SessionLocal
from app.models.models import MensagemLog, Atendimento, Atendente, Empresa
from app.core.config import settings
from app.core.redis_client import redis_cache
from app.core.circuit_breaker import whatsapp_circuit_breaker
import time

# Import métricas
try:
    from app.core.metrics import (
        whatsapp_sent_total,
        whatsapp_received_total,
        whatsapp_api_latency,
        webhook_processing_latency,
        task_processing_latency,
        update_circuit_breaker_metrics
    )
    METRICS_ENABLED = True
except ImportError:
    METRICS_ENABLED = False


@celery_app.task(
    name="app.tasks.tasks.enviar_mensagem_whatsapp",
    bind=True,  # Necessário para self.retry()
    autoretry_for=(httpx.HTTPError, httpx.TimeoutException),
    retry_kwargs={'max_retries': 3, 'countdown': 5},
    retry_backoff=True,        # Exponential backoff: 5s → 10s → 20s
    retry_backoff_max=60,      # Máximo 60s de espera
    retry_jitter=True          # Evita thundering herd
)
def enviar_mensagem_whatsapp(self, to: str, message: str, message_type: str = "text"):
    """
    Task assíncrona para enviar mensagem via WhatsApp API.

    Retry automático:
    - 3 tentativas com exponential backoff (5s, 10s, 20s)
    - Retry em httpx.HTTPError e httpx.TimeoutException
    - Jitter aleatório para evitar sobrecarga

    Args:
        to: Número do destinatário
        message: Conteúdo da mensagem
        message_type: Tipo da mensagem (text, button, list)

    Returns:
        dict: Resultado do envio
    """
    start_time = time.time()
    try:
        # Função interna para envio (protegida pelo circuit breaker)
        def send_whatsapp_request():
            api_start = time.time()
            url = f"https://graph.facebook.com/v18.0/{settings.PHONE_NUMBER_ID}/messages"
            headers = {
                "Authorization": f"Bearer {settings.WHATSAPP_TOKEN}",
                "Content-Type": "application/json"
            }

            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": to,
                "type": "text",
                "text": {"body": message}
            }

            response = httpx.post(url, headers=headers, json=payload, timeout=30.0)
            response.raise_for_status()

            # Métrica de latência da API
            if METRICS_ENABLED:
                whatsapp_api_latency.observe(time.time() - api_start)

            return response.json()

        # Executar com circuit breaker
        result = whatsapp_circuit_breaker.call(send_whatsapp_request)
        message_id = result["messages"][0]["id"]

        print(f"✅ Mensagem enviada para {to}: {message_id}")

        # Métricas de sucesso
        if METRICS_ENABLED:
            whatsapp_sent_total.labels(status="success").inc()
            task_processing_latency.labels(task_name="enviar_mensagem_whatsapp").observe(
                time.time() - start_time
            )
            # Atualizar estado do circuit breaker
            cb_state = whatsapp_circuit_breaker.get_state()
            update_circuit_breaker_metrics(
                "whatsapp_api",
                cb_state["state"],
                cb_state["failures"]
            )

        return {
            "success": True,
            "message_id": message_id,
            "to": to
        }

    except Exception as e:
        print(f"❌ Erro enviando mensagem: {e}")

        # Métricas de erro
        if METRICS_ENABLED:
            whatsapp_sent_total.labels(status="error").inc()
            # Atualizar estado do circuit breaker
            cb_state = whatsapp_circuit_breaker.get_state()
            update_circuit_breaker_metrics(
                "whatsapp_api",
                cb_state["state"],
                cb_state["failures"]
            )

        return {
            "success": False,
            "error": str(e),
            "to": to
        }


@celery_app.task(name="app.tasks.tasks.processar_webhook_completo")
def processar_webhook_completo(webhook_data: dict):
    """
    Task assíncrona para processar webhook do WhatsApp (Worker separado).

    CRÍTICO:
    - Processa mensagens do WhatsApp em background
    - Webhook HTTP retorna em < 100ms
    - Invalidação de cache automática
    - Bot handler executado aqui

    Args:
        webhook_data: Dados completos do webhook

    Returns:
        dict: Resultado do processamento
    """
    db: Session = SessionLocal()

    try:
        print(f"🔄 [Celery] Processando webhook em worker...")

        if webhook_data.get("object") != "whatsapp_business_account":
            return {"success": True, "message": "Não é mensagem WhatsApp"}

        entries = webhook_data.get("entry", [])

        for entry in entries:
            changes = entry.get("changes", [])

            for change in changes:
                value = change.get("value", {})

                # Identificar empresa
                phone_number_id = value.get("metadata", {}).get("phone_number_id")
                if not phone_number_id:
                    continue

                empresa = db.query(Empresa).filter(
                    Empresa.phone_number_id == phone_number_id,
                    Empresa.ativa == True
                ).first()

                if not empresa:
                    print(f"⚠️  Empresa não encontrada: {phone_number_id}")
                    continue

                print(f"🏢 Processando para: {empresa.nome}")

                # Processar mensagens recebidas
                if "messages" in value:
                    messages = value.get("messages", [])
                    for message in messages:
                        _process_incoming_message_sync(message, empresa, db)

                # Processar status
                if "statuses" in value:
                    statuses = value.get("statuses", [])
                    for status in statuses:
                        _process_message_status_sync(status, empresa, db)

        db.close()

        return {
            "success": True,
            "message": "Webhook processado com sucesso"
        }

    except Exception as e:
        print(f"❌ Erro processando webhook: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        db.close()

        return {
            "success": False,
            "error": str(e)
        }


def _process_incoming_message_sync(message: Dict[str, Any], empresa: Empresa, db: Session):
    """Processa mensagem recebida (versão síncrona para Celery)."""
    try:
        from app.services.bot_handler import BotMessageHandler

        from_number = message.get("from")
        message_id = message.get("id")
        message_type = message.get("type")

        # ========== DEDUPLICAÇÃO VIA REDIS ==========
        # Protege contra duplicatas do WhatsApp (webhook pode ser chamado 2x)
        dedup_key = f"msg:processed:{message_id}"

        if redis_cache.client.exists(dedup_key):
            print(f"⚠️ Mensagem duplicada detectada (ignorada): {message_id}")
            return  # Skip processamento

        # Marcar como processada (TTL 24h = 86400 segundos)
        redis_cache.client.setex(dedup_key, 86400, "1")
        print(f"✅ Mensagem {message_id} marcada como processada")

        # Extrair conteúdo
        content = ""
        if message_type == "text":
            content = message.get("text", {}).get("body", "")
        elif message_type == "button":
            content = message.get("button", {}).get("text", "")
        elif message_type == "interactive":
            interactive = message.get("interactive", {})
            interactive_type = interactive.get("type")

            if interactive_type == "button_reply":
                button_reply = interactive.get("button_reply", {})
                content = button_reply.get("id", "")
            elif interactive_type == "list_reply":
                list_reply = interactive.get("list_reply", {})
                content = list_reply.get("id", "")

        print(f"📥 Mensagem de {from_number}: {content}")

        # INVALIDAR CACHE
        redis_cache.invalidate_pattern(f"conversas:emp:{empresa.id}*")

        # Atualizar ou criar atendimento
        atendimento = db.query(Atendimento).filter(
            Atendimento.whatsapp_number == from_number
        ).join(
            MensagemLog,
            MensagemLog.whatsapp_number == Atendimento.whatsapp_number
        ).filter(
            MensagemLog.empresa_id == empresa.id,
            Atendimento.status.in_(['bot', 'aguardando', 'em_atendimento'])
        ).order_by(Atendimento.iniciado_em.desc()).first()

        processar_bot = True

        if atendimento and atendimento.status == 'em_atendimento':
            processar_bot = False
            print(f"ℹ️  Em atendimento humano")

        if not atendimento:
            msg_existente = db.query(MensagemLog).filter(
                MensagemLog.empresa_id == empresa.id,
                MensagemLog.whatsapp_number == from_number
            ).first()

            if msg_existente:
                atendimento = db.query(Atendimento).filter(
                    Atendimento.whatsapp_number == from_number
                ).order_by(Atendimento.iniciado_em.desc()).first()

            if not atendimento:
                atendimento = Atendimento(
                    whatsapp_number=from_number,
                    status='bot'
                )
                db.add(atendimento)
        else:
            atendimento.ultima_mensagem_em = datetime.now()

        db.commit()

        # Processar com bot
        if processar_bot:
            try:
                bot_handler = BotMessageHandler(
                    empresa=empresa,
                    from_number=from_number,
                    message_content=content,
                    message_id=message_id,
                    db=db
                )

                # Importar asyncio para rodar função async
                import asyncio
                asyncio.run(bot_handler.process_message())

                print(f"✅ Mensagem processada pelo bot")

            except Exception as e:
                print(f"❌ Erro no bot: {e}")

        # WebSocket broadcast via HTTP interno
        try:
            mensagem_log = db.query(MensagemLog).filter(
                MensagemLog.empresa_id == empresa.id,
                MensagemLog.whatsapp_number == from_number
            ).order_by(MensagemLog.timestamp.desc()).first()

            if mensagem_log:
                # Enviar broadcast via Redis Pub/Sub (elimina hop HTTP ~100ms)
                broadcast_data = {
                    "empresa_id": empresa.id,
                    "event": "nova_mensagem",
                    "data": {
                        "mensagem": {
                            "id": mensagem_log.id,
                            "whatsapp_number": mensagem_log.whatsapp_number,
                            "conteudo": mensagem_log.conteudo,
                            "direcao": mensagem_log.direcao,
                            "tipo_mensagem": mensagem_log.tipo_mensagem,
                            "timestamp": mensagem_log.timestamp.isoformat(),
                            "lida": mensagem_log.lida
                        },
                        "atendimento": {
                            "status": atendimento.status if atendimento else "bot"
                        }
                    }
                }

                # Publicar diretamente em Redis Pub/Sub (sem HTTP)
                channel = f"ws:broadcast:emp:{empresa.id}"
                message_data = json.dumps(broadcast_data, default=str)

                try:
                    redis_cache.client.publish(channel, message_data)
                    print(f"🔔 Broadcast publicado via Redis Pub/Sub para empresa {empresa.id}")
                except Exception as pub_error:
                    print(f"⚠️  Erro ao publicar no Redis Pub/Sub: {pub_error}")

        except Exception as e:
            print(f"⚠️  Erro no broadcast: {e}")

    except Exception as e:
        print(f"❌ Erro processando mensagem: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()


def _process_message_status_sync(status: Dict[str, Any], empresa: Empresa, db: Session):
    """Processa status de mensagem (versão síncrona para Celery)."""
    try:
        message_id = status.get("id")
        status_type = status.get("status")

        print(f"📊 Status {message_id}: {status_type}")

        mensagem = db.query(MensagemLog).filter(
            MensagemLog.empresa_id == empresa.id,
            MensagemLog.message_id == message_id
        ).first()

        if mensagem:
            if status_type == "read":
                mensagem.lida = True
            elif status_type == "failed":
                error = status.get("errors", [{}])[0]
                mensagem.erro = error.get("message", "Erro desconhecido")

            db.commit()
            print(f"✅ Status atualizado")

    except Exception as e:
        print(f"❌ Erro processando status: {e}")
        db.rollback()


@celery_app.task(name="app.tasks.tasks.limpar_logs_antigos")
def limpar_logs_antigos():
    """
    Task periódica para limpar logs de mensagens antigas (>90 dias).

    Returns:
        dict: Quantidade de registros removidos
    """
    try:
        db: Session = SessionLocal()

        data_limite = datetime.now() - timedelta(days=90)

        # Deletar mensagens antigas
        deleted = db.query(MensagemLog).filter(
            MensagemLog.timestamp < data_limite
        ).delete()

        db.commit()
        db.close()

        print(f"🧹 Limpeza concluída: {deleted} mensagens removidas")

        return {
            "success": True,
            "deleted_count": deleted,
            "date_limit": data_limite.isoformat()
        }

    except Exception as e:
        print(f"❌ Erro na limpeza: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@celery_app.task(name="app.tasks.tasks.gerar_estatisticas")
def gerar_estatisticas():
    """
    Task periódica para gerar estatísticas do sistema.

    Returns:
        dict: Estatísticas geradas
    """
    try:
        db: Session = SessionLocal()

        # Total de mensagens
        total_mensagens = db.query(MensagemLog).count()

        # Mensagens por direção
        enviadas = db.query(MensagemLog).filter(
            MensagemLog.direcao == 'enviada'
        ).count()

        recebidas = db.query(MensagemLog).filter(
            MensagemLog.direcao == 'recebida'
        ).count()

        # Atendimentos por status
        em_bot = db.query(Atendimento).filter(
            Atendimento.status == 'bot'
        ).count()

        aguardando = db.query(Atendimento).filter(
            Atendimento.status == 'aguardando'
        ).count()

        em_atendimento = db.query(Atendimento).filter(
            Atendimento.status == 'em_atendimento'
        ).count()

        finalizados = db.query(Atendimento).filter(
            Atendimento.status == 'finalizado'
        ).count()

        # Atendentes online
        atendentes_online = db.query(Atendente).filter(
            Atendente.status == 'online'
        ).count()

        db.close()

        stats = {
            "timestamp": datetime.now().isoformat(),
            "mensagens": {
                "total": total_mensagens,
                "enviadas": enviadas,
                "recebidas": recebidas
            },
            "atendimentos": {
                "bot": em_bot,
                "aguardando": aguardando,
                "em_atendimento": em_atendimento,
                "finalizados": finalizados
            },
            "atendentes_online": atendentes_online
        }

        print(f"📊 Estatísticas geradas: {stats}")

        return stats

    except Exception as e:
        print(f"❌ Erro gerando estatísticas: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@celery_app.task(name="app.tasks.tasks.notificar_atendente")
def notificar_atendente(atendente_id: int, mensagem: str):
    """
    Task para notificar atendente sobre novo atendimento.

    Args:
        atendente_id: ID do atendente
        mensagem: Mensagem de notificação

    Returns:
        dict: Resultado da notificação
    """
    try:
        # TODO: Implementar notificação (email, push, etc)
        print(f"🔔 Notificação para atendente {atendente_id}: {mensagem}")

        return {
            "success": True,
            "atendente_id": atendente_id
        }

    except Exception as e:
        print(f"❌ Erro notificando atendente: {e}")
        return {
            "success": False,
            "error": str(e)
        }


# ========== TASK: ENVIAR EMAIL DE CONFIRMAÇÃO ==========

@celery_app.task(name="app.tasks.tasks.enviar_email_confirmacao_task")
def enviar_email_confirmacao_task(destinatario: str, nome_empresa: str, token: str):
    """
    Task assíncrona para enviar email de confirmação de cadastro.

    Args:
        destinatario: Email da empresa
        nome_empresa: Nome da empresa
        token: Token de confirmação

    Returns:
        dict: Resultado do envio
    """
    try:
        from app.services.email_service import enviar_email_confirmacao
        import asyncio

        # Executa função async de forma síncrona no worker do Celery
        loop = asyncio.get_event_loop()
        sucesso = loop.run_until_complete(
            enviar_email_confirmacao(
                destinatario=destinatario,
                nome_empresa=nome_empresa,
                token=token
            )
        )

        if sucesso:
            print(f"✅ Email de confirmação enviado para {destinatario}")
            return {
                "success": True,
                "email": destinatario
            }
        else:
            print(f"⚠️  Falha ao enviar email para {destinatario}")
            return {
                "success": False,
                "email": destinatario,
                "error": "Falha no envio"
            }

    except Exception as e:
        print(f"❌ Erro enviando email de confirmação: {e}")
        return {
            "success": False,
            "email": destinatario,
            "error": str(e)
        }
