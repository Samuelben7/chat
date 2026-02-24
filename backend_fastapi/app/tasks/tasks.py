from celery import shared_task
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import httpx
from typing import Dict, Any, List, Optional
import json
import re
import os
import logging
from pathlib import Path

from app.tasks.celery_app import celery_app
from app.database.database import SessionLocal
from app.models.models import MensagemLog, Atendimento, Atendente, Empresa, MessageTemplate, Cliente
from app.core.config import settings
from app.core.redis_client import redis_cache
from app.core.circuit_breaker import whatsapp_circuit_breaker
import time

logger = logging.getLogger("celery_tasks")

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
def enviar_mensagem_whatsapp(self, to: str, message: str, message_type: str = "text", empresa_id: int = None):
    """
    Task assíncrona para enviar mensagem via WhatsApp API (MULTI-TENANT).

    Retry automático:
    - 3 tentativas com exponential backoff (5s, 10s, 20s)
    - Retry em httpx.HTTPError e httpx.TimeoutException
    - Jitter aleatório para evitar sobrecarga

    Args:
        to: Número do destinatário
        message: Conteúdo da mensagem
        message_type: Tipo da mensagem (text, button, list)
        empresa_id: ID da empresa (obrigatório para multi-tenant)

    Returns:
        dict: Resultado do envio
    """
    start_time = time.time()
    try:
        # MULTI-TENANT: Buscar credenciais da empresa
        from app.models.models import Empresa
        from app.database.database import SessionLocal

        db = SessionLocal()
        try:
            if empresa_id:
                empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
                if not empresa:
                    raise Exception(f"Empresa {empresa_id} não encontrada")
                phone_number_id = empresa.phone_number_id
                whatsapp_token = empresa.whatsapp_token
            else:
                # Fallback para single-tenant (compatibilidade reversa)
                phone_number_id = settings.PHONE_NUMBER_ID
                whatsapp_token = settings.WHATSAPP_TOKEN
        finally:
            db.close()

        # Função interna para envio (protegida pelo circuit breaker)
        def send_whatsapp_request():
            api_start = time.time()
            url = f"https://graph.facebook.com/v21.0/{phone_number_id}/messages"
            headers = {
                "Authorization": f"Bearer {whatsapp_token}",
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

                # Extrair nomes dos contatos do webhook
                contacts_info = {}
                for contact in value.get("contacts", []):
                    wa_id = contact.get("wa_id", "")
                    profile_name = contact.get("profile", {}).get("name", "")
                    if wa_id and profile_name:
                        contacts_info[wa_id] = profile_name

                # Processar mensagens recebidas
                if "messages" in value:
                    messages = value.get("messages", [])
                    for message in messages:
                        _process_incoming_message_sync(message, empresa, db, contacts_info)

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


def _process_incoming_message_sync(message: Dict[str, Any], empresa: Empresa, db: Session, contacts_info: Dict[str, str] = None):
    """Processa mensagem recebida (versão síncrona para Celery)."""
    try:
        from app.services.bot_handler import BotMessageHandler

        from_number = message.get("from")
        message_id = message.get("id")
        message_type = message.get("type")

        # ========== DEDUPLICAÇÃO VIA REDIS ==========
        dedup_key = f"msg:processed:{message_id}"

        if redis_cache.client.exists(dedup_key):
            print(f"⚠️ Mensagem duplicada detectada (ignorada): {message_id}")
            return

        redis_cache.client.setex(dedup_key, 86400, "1")
        print(f"✅ Mensagem {message_id} marcada como processada")

        # ========== AUTO-SALVAR CONTATO ==========
        # Cria Cliente automaticamente se nao existe para esta empresa
        try:
            existing_client = db.query(Cliente).filter(
                Cliente.empresa_id == empresa.id,
                Cliente.whatsapp_number == from_number,
            ).first()

            if not existing_client:
                # Buscar nome do perfil WhatsApp
                profile_name = (contacts_info or {}).get(from_number, "")
                if not profile_name:
                    profile_name = f"Contato {from_number[-4:]}"

                new_client = Cliente(
                    empresa_id=empresa.id,
                    nome_completo=profile_name,
                    whatsapp_number=from_number,
                )
                db.add(new_client)
                db.commit()
                print(f"📇 Novo contato salvo: {profile_name} ({from_number}) para empresa {empresa.nome}")
            else:
                # Atualizar nome se veio do WhatsApp e o atual e generico
                profile_name = (contacts_info or {}).get(from_number, "")
                if profile_name and existing_client.nome_completo.startswith("Contato "):
                    existing_client.nome_completo = profile_name
                    db.commit()
                    print(f"📇 Nome do contato atualizado: {profile_name} ({from_number})")
        except Exception as e:
            logger.warning(f"Erro ao auto-salvar contato {from_number}: {e}")
            db.rollback()

        # Extrair conteúdo
        content = ""
        dados_extras: Dict[str, Any] = {}
        if message_type == "text":
            content = message.get("text", {}).get("body", "")
        elif message_type == "button":
            content = message.get("button", {}).get("text", "")
            dados_extras["button_payload"] = message.get("button", {}).get("payload", "")
        elif message_type == "interactive":
            interactive = message.get("interactive", {})
            interactive_type = interactive.get("type")

            if interactive_type == "button_reply":
                button_reply = interactive.get("button_reply", {})
                content = button_reply.get("title", "") or button_reply.get("id", "")
                dados_extras["button_id"] = button_reply.get("id", "")
                dados_extras["button_title"] = button_reply.get("title", "")
            elif interactive_type == "list_reply":
                list_reply = interactive.get("list_reply", {})
                content = list_reply.get("title", "") or list_reply.get("id", "")
                dados_extras["list_id"] = list_reply.get("id", "")
                dados_extras["list_title"] = list_reply.get("title", "")
                dados_extras["list_description"] = list_reply.get("description", "")

        elif message_type == "image":
            img = message.get("image", {})
            content = img.get("caption", "") or "📷 Imagem"
            dados_extras["media_id"] = img.get("id")
            dados_extras["mime_type"] = img.get("mime_type", "image/jpeg")

        elif message_type == "audio":
            audio = message.get("audio", {})
            content = "🎵 Áudio"
            dados_extras["media_id"] = audio.get("id")
            dados_extras["mime_type"] = audio.get("mime_type", "audio/ogg")

        elif message_type == "document":
            doc = message.get("document", {})
            filename = doc.get("filename", "documento")
            content = f"📄 {filename}"
            dados_extras["media_id"] = doc.get("id")
            dados_extras["mime_type"] = doc.get("mime_type", "application/octet-stream")
            dados_extras["filename"] = filename

        elif message_type == "video":
            video = message.get("video", {})
            content = video.get("caption", "") or "🎥 Vídeo"
            dados_extras["media_id"] = video.get("id")
            dados_extras["mime_type"] = video.get("mime_type", "video/mp4")

        else:
            content = f"[{message_type}]"

        print(f"📥 Mensagem de {from_number}: {content}")

        # INVALIDAR CACHE
        redis_cache.invalidate_pattern(f"conversas:emp:{empresa.id}*")

        # ========== PESQUISA DE SATISFAÇÃO ==========
        # Verificar se o cliente está respondendo uma pesquisa de satisfação
        from app.models.models import ChatSessao
        sessao = db.query(ChatSessao).filter(
            ChatSessao.empresa_id == empresa.id,
            ChatSessao.whatsapp_number == from_number
        ).first()

        if sessao and sessao.estado_atual == "pesquisa_satisfacao":
            # Detectar nota: lista interativa (nota_X) OU texto simples (1-5)
            nota = None
            nota_map = {"nota_1": 1, "nota_2": 2, "nota_3": 3, "nota_4": 4, "nota_5": 5}
            list_id = dados_extras.get("list_id", "")
            if list_id in nota_map:
                nota = nota_map[list_id]
            elif content.strip() in ("1", "2", "3", "4", "5"):
                nota = int(content.strip())

            if nota:
                atendimento_id = (sessao.dados_temporarios or {}).get("atendimento_id")
                if atendimento_id:
                    atend = db.query(Atendimento).filter(Atendimento.id == atendimento_id).first()
                    if atend:
                        atend.nota_satisfacao = nota
                        db.commit()
                        print(f"⭐ Pesquisa de satisfação: nota {nota} para atendimento {atendimento_id}")

                # Resetar sessão
                sessao.estado_atual = "inicio"
                sessao.dados_temporarios = {}
                db.commit()

                # Salvar mensagem recebida
                msg_nota = MensagemLog(
                    empresa_id=empresa.id,
                    whatsapp_number=from_number,
                    message_id=message_id,
                    direcao="recebida",
                    tipo_mensagem=message_type,
                    conteudo=content,
                    dados_extras=dados_extras,
                    estado_sessao="pesquisa_satisfacao"
                )
                db.add(msg_nota)
                db.commit()

                # Enviar agradecimento
                respostas = {
                    1: "Lamentamos que sua experiência não tenha sido boa. Vamos melhorar!",
                    2: "Agradecemos seu feedback. Vamos trabalhar para melhorar!",
                    3: "Obrigado pela avaliação! Vamos buscar ser ainda melhores.",
                    4: "Que bom que gostou! Obrigado pelo feedback!",
                    5: "Excelente! Ficamos muito felizes com sua avaliação!"
                }
                msg_agradecimento = f"Obrigado pela sua avaliação! {respostas.get(nota, '')}"
                enviar_mensagem_whatsapp.delay(
                    to=from_number,
                    message=msg_agradecimento,
                    message_type="text",
                    empresa_id=empresa.id
                )

                # Salvar msg de agradecimento no log
                msg_agradecimento_log = MensagemLog(
                    empresa_id=empresa.id,
                    whatsapp_number=from_number,
                    direcao="enviada",
                    tipo_mensagem="text",
                    conteudo=msg_agradecimento,
                    estado_sessao="pesquisa_satisfacao"
                )
                db.add(msg_agradecimento_log)
                db.commit()

                return  # Não processar com bot
            # Se não é nota válida, cai no fluxo normal do bot

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

        # Bot não processa mídia — salva manualmente com dados_extras corretos
        if message_type in {'image', 'audio', 'document', 'video'}:
            processar_bot = False
            print(f"📎 Mídia recebida ({message_type}) — salvando sem bot")

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

        # Guardar último ID antes de processar (para saber quais msgs são novas)
        ultimo_id_antes = db.query(MensagemLog.id).filter(
            MensagemLog.empresa_id == empresa.id,
            MensagemLog.whatsapp_number == from_number
        ).order_by(MensagemLog.id.desc()).limit(1).scalar() or 0

        # SEMPRE salvar a mensagem recebida no log (mesmo se em atendimento humano)
        if not processar_bot:
            # Mensagem recebida durante atendimento humano - salvar manualmente
            mensagem_recebida = MensagemLog(
                empresa_id=empresa.id,
                whatsapp_number=from_number,
                message_id=message_id,
                direcao="recebida",
                tipo_mensagem=message_type,
                conteudo=content,
                dados_extras=dados_extras,
                estado_sessao="em_atendimento"
            )
            db.add(mensagem_recebida)
            db.commit()
            print(f"💾 Mensagem recebida salva (em atendimento humano)")

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

        # WebSocket broadcast - TODAS as mensagens novas (recebida + respostas bot)
        try:
            # Buscar TODAS as mensagens criadas após o último ID (sem limit fixo!)
            mensagens_recentes = db.query(MensagemLog).filter(
                MensagemLog.empresa_id == empresa.id,
                MensagemLog.whatsapp_number == from_number,
                MensagemLog.id > ultimo_id_antes
            ).order_by(MensagemLog.id.asc()).all()

            print(f"📡 Broadcasting {len(mensagens_recentes)} mensagens novas")

            # Broadcast em ordem cronológica
            for mensagem_log in mensagens_recentes:
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
                            "lida": mensagem_log.lida,
                            "dados_extras": mensagem_log.dados_extras or {}  # CRÍTICO para listas/botões
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
                    print(f"🔔 Broadcast {mensagem_log.direcao}: {mensagem_log.conteudo[:50]}")
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
                print(f"❌ FAILED details: {status.get('errors', 'no errors field')}")

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

@celery_app.task(name="app.tasks.tasks.notificar_admin_nova_empresa_task")
def notificar_admin_nova_empresa_task(
    empresa_id: int,
    nome: str,
    email: str,
    waba_id: str,
    phone_number_id: str
):
    """
    Task para notificar o admin (Samuel) quando uma empresa conecta o WhatsApp.
    """
    try:
        from app.services.email_service import enviar_email_admin_notificacao

        sucesso = enviar_email_admin_notificacao(
            empresa_id=empresa_id,
            nome_empresa=nome,
            email_empresa=email,
            waba_id=waba_id,
            phone_number_id=phone_number_id
        )

        if sucesso:
            print(f"[OK] Admin notificado sobre empresa {nome} (ID: {empresa_id})")
            return {"success": True, "empresa_id": empresa_id}
        else:
            print(f"[WARN] Falha ao notificar admin sobre empresa {nome}")
            return {"success": False, "empresa_id": empresa_id}

    except Exception as e:
        print(f"[ERROR] Erro ao notificar admin: {e}")
        return {"success": False, "error": str(e)}


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

        # Função síncrona - chamar diretamente
        sucesso = enviar_email_confirmacao(
            destinatario=destinatario,
            nome_empresa=nome_empresa,
            token=token
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


# ========== TASK: ENVIO EM MASSA DE TEMPLATE ==========

def _get_contact_name_sync(db: Session, empresa_id: int, number: str) -> Optional[str]:
    """Busca primeiro nome do contato (Cliente → MensagemLog → None)."""
    cliente = db.query(Cliente).filter(
        Cliente.empresa_id == empresa_id,
        Cliente.whatsapp_number == number,
    ).first()
    if cliente and cliente.nome_completo:
        return cliente.nome_completo.split()[0]

    msg = db.query(MensagemLog).filter(
        MensagemLog.empresa_id == empresa_id,
        MensagemLog.whatsapp_number == number,
        MensagemLog.direcao == "recebida",
    ).order_by(MensagemLog.timestamp.desc()).first()

    if msg and msg.dados_extras:
        extras = msg.dados_extras if isinstance(msg.dados_extras, dict) else {}
        profile_name = (
            extras.get("profile", {}).get("name")
            if isinstance(extras.get("profile"), dict)
            else extras.get("profile_name")
        )
        if profile_name:
            return profile_name.split()[0]

    return None


@celery_app.task(
    name="app.tasks.tasks.enviar_template_massa_task",
    bind=True,
    max_retries=0,
    time_limit=600,  # 10 min max
)
def enviar_template_massa_task(
    self,
    empresa_id: int,
    template_id: int,
    numbers: List[str],
    language_code: str = "pt_BR",
    parameter_values: Optional[Dict[str, str]] = None,
    media_url: Optional[str] = None,
    use_contact_name: bool = True,
    fallback_name: str = "Olá",
    coupon_code: Optional[str] = None,
):
    """
    Task Celery para envio em massa de template.
    Rate limit: ~80 msgs/segundo (limite Meta tier 1).
    """
    import asyncio
    from app.services.template_service import TemplateService

    db: Session = SessionLocal()
    enviados = 0
    erros = 0
    resultados = []

    try:
        empresa = db.query(Empresa).filter(
            Empresa.id == empresa_id,
            Empresa.ativa == True,
        ).first()
        if not empresa:
            return {"success": False, "error": "Empresa não encontrada"}

        template = db.query(MessageTemplate).filter(
            MessageTemplate.id == template_id,
            MessageTemplate.empresa_id == empresa_id,
        ).first()
        if not template:
            return {"success": False, "error": "Template não encontrado"}

        service = TemplateService(empresa)

        # Detectar parâmetros do body
        body_params = []
        for comp in (template.components or []):
            if comp.get("type", "").upper() == "BODY":
                body_params = re.findall(r'\{\{(\d+)\}\}', comp.get("text", ""))
                break
        has_body_params = len(body_params) > 0

        total = len(numbers)
        rate_limit_interval = 1.0 / 80.0  # ~12.5ms entre mensagens

        for idx, number in enumerate(numbers):
            try:
                # Construir parameter_values personalizado
                pv = dict(parameter_values or {})

                if use_contact_name and has_body_params and "1" not in pv:
                    contact_name = _get_contact_name_sync(db, empresa_id, number)
                    pv["1"] = contact_name or fallback_name

                if coupon_code and "coupon_code" not in pv:
                    pv["coupon_code"] = coupon_code

                # Build components
                send_components = None
                if pv and template.components:
                    send_components = TemplateService.build_send_components(
                        template_components=template.components,
                        parameter_values=pv,
                        media_url=media_url,
                    )

                # Enviar (async → sync para Celery)
                message_id = asyncio.run(service.send_template_message(
                    to=number,
                    template_name=template.name,
                    language_code=language_code,
                    components=send_components,
                ))
                service.log_template_send(db, number, template.name, message_id)
                enviados += 1
                resultados.append({"success": True, "number": number, "message_id": message_id})

            except Exception as e:
                erros += 1
                resultados.append({"success": False, "number": number, "error": str(e)})
                logger.warning(f"Erro enviando para {number}: {e}")

            # Rate limiting
            time.sleep(rate_limit_interval)

            # Atualizar progresso
            self.update_state(
                state="PROGRESS",
                meta={
                    "current": idx + 1,
                    "total": total,
                    "enviados": enviados,
                    "erros": erros,
                },
            )

        logger.info(f"Envio em massa concluído: {enviados}/{total} enviados, {erros} erros")

        return {
            "success": True,
            "total": total,
            "enviados": enviados,
            "erros": erros,
            "resultados": resultados,
        }

    except Exception as e:
        logger.error(f"Erro no envio em massa: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}
    finally:
        db.close()


# ========== TASK: LIMPAR IMAGENS ÓRFÃS DE TEMPLATES ==========

@celery_app.task(name="app.tasks.tasks.limpar_imagens_orfas_templates")
def limpar_imagens_orfas_templates():
    """
    Task periódica para limpar imagens de templates órfãs (sem template associado) >7 dias.
    """
    try:
        db: Session = SessionLocal()
        upload_dir = Path("uploads/templates")

        if not upload_dir.exists():
            return {"success": True, "deleted": 0, "message": "Diretório não existe"}

        # Coletar todos os paths referenciados
        referenced_paths = set()
        templates = db.query(MessageTemplate).filter(
            MessageTemplate.header_image_path.isnot(None)
        ).all()
        for t in templates:
            # Normalizar path
            path = t.header_image_path.lstrip("/")
            referenced_paths.add(path)

        deleted = 0
        cutoff = datetime.now() - timedelta(days=7)

        for file_path in upload_dir.iterdir():
            if not file_path.is_file():
                continue

            relative_path = str(file_path)
            normalized = f"uploads/templates/{file_path.name}"

            # Verificar se é órfã e tem mais de 7 dias
            if normalized not in referenced_paths:
                file_mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                if file_mtime < cutoff:
                    file_path.unlink()
                    deleted += 1
                    logger.info(f"Imagem órfã removida: {file_path}")

        db.close()
        logger.info(f"Limpeza de imagens órfãs: {deleted} removidas")

        return {"success": True, "deleted": deleted}

    except Exception as e:
        logger.error(f"Erro na limpeza de imagens órfãs: {e}")
        return {"success": False, "error": str(e)}
