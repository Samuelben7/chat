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
from app.models.models import MensagemLog, Atendimento, Atendente, Empresa, MessageTemplate, Cliente, DevUsuario, Assinatura, ChatSessao
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
    - Processa account_update (PARTNER_APP_INSTALLED, aprovação de WABA)

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

        # Verificar se é account_update (evento de gestão de WABA)
        for entry in entries:
            for change in entry.get("changes", []):
                if change.get("field") == "account_update":
                    _handle_account_update(change.get("value", {}), db)
            # Se todos os changes são account_update, retornar sem processar mensagens
            if all(c.get("field") == "account_update" for c in entry.get("changes", [])):
                db.close()
                return {"success": True, "message": "account_update processado"}

        for entry in entries:
            changes = entry.get("changes", [])

            for change in changes:
                value = change.get("value", {})

                # Identificar empresa
                phone_number_id = value.get("metadata", {}).get("phone_number_id")
                if not phone_number_id:
                    continue

                # Verificar se pertence a um DEV primeiro
                dev_usuario = db.query(DevUsuario).filter(
                    DevUsuario.phone_number_id == phone_number_id,
                    DevUsuario.ativo == True,
                ).first()

                if dev_usuario:
                    # Forward para webhook do dev (nao processar como empresa)
                    print(f"🔧 Webhook para dev: {dev_usuario.nome}")
                    if dev_usuario.webhook_url:
                        forward_webhook_dev_task.delay(
                            dev_id=dev_usuario.id,
                            payload=change.get("value", {}),
                        )
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

        elif message_type == "sticker":
            sticker = message.get("sticker", {})
            animated = sticker.get("animated", False)
            content = "🏷️ Sticker animado" if animated else "🏷️ Sticker"
            dados_extras["media_id"] = sticker.get("id")
            dados_extras["mime_type"] = sticker.get("mime_type", "image/webp")
            dados_extras["animated"] = animated

        elif message_type == "reaction":
            reaction = message.get("reaction", {})
            emoji = reaction.get("emoji", "👍")
            content = f"Reagiu com {emoji}"

        elif message_type == "location":
            location = message.get("location", {})
            name = location.get("name", "")
            content = f"📍 Localização compartilhada{': ' + name if name else ''}"

        elif message_type == "contacts":
            content = "👤 Contato compartilhado"

        elif message_type == "unsupported":
            content = "📎 Mensagem não suportada neste dispositivo"

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
            # Só bloqueia se for atendimento humano (não IA)
            if not getattr(atendimento, 'atendido_por_ia', False):
                processar_bot = False
                print(f"ℹ️  Em atendimento humano — IA/bot pausado")

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

            # Se o atendimento encontrado está finalizado, reabrir com nova entrada na fila
            if atendimento and atendimento.status == 'finalizado':
                print(f"♻️  Conversa finalizada reaberta — {from_number} voltou para fila")
                atendimento = Atendimento(
                    whatsapp_number=from_number,
                    status='bot',
                    empresa_id=empresa.id,
                )
                db.add(atendimento)
            elif not atendimento:
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

        # Processar com IA ou bot (mutuamente exclusivos)
        if processar_bot:
            import asyncio

            # ── Agente de IA (prioridade sobre bot) ──
            ia_ativa = getattr(empresa, 'ia_ativa', False)
            if ia_ativa and content and message_type in ('text', 'button', 'interactive'):
                try:
                    from app.services.ai_chat_service import gerar_resposta_ia
                    from app.services.whatsapp import WhatsAppService

                    # SALVAR mensagem do cliente ANTES de processar com IA
                    # (BotMessageHandler faz isso internamente; no path IA precisamos fazer manual)
                    msg_recebida = MensagemLog(
                        empresa_id=empresa.id,
                        whatsapp_number=from_number,
                        message_id=message_id,
                        direcao="recebida",
                        tipo_mensagem=message_type,
                        conteudo=content,
                        dados_extras=dados_extras,
                        estado_sessao="ia",
                    )
                    db.add(msg_recebida)
                    db.commit()

                    # Histórico da conversa (sem a mensagem atual, últimas 25)
                    historico = (
                        db.query(MensagemLog)
                        .filter(
                            MensagemLog.empresa_id == empresa.id,
                            MensagemLog.whatsapp_number == from_number,
                        )
                        .order_by(MensagemLog.timestamp.desc())
                        .limit(25)
                        .all()
                    )
                    historico = list(reversed(historico))

                    # Montar contexto CRM para enriquecer o prompt da IA
                    crm_context = None
                    try:
                        cliente_crm = db.query(Cliente).filter(
                            Cliente.empresa_id == empresa.id,
                            Cliente.whatsapp_number == from_number,
                        ).first()
                        if cliente_crm:
                            partes = []
                            if cliente_crm.nome_completo:
                                partes.append(f"Nome: {cliente_crm.nome_completo}")
                            if cliente_crm.funil_etapa:
                                partes.append(f"Etapa no funil: {cliente_crm.funil_etapa}")
                            if cliente_crm.resumo_conversa:
                                partes.append(f"Resumo anterior: {cliente_crm.resumo_conversa}")
                            if cliente_crm.preferencias:
                                partes.append(f"Preferências conhecidas: {cliente_crm.preferencias}")
                            if cliente_crm.valor_estimado:
                                partes.append(f"Valor estimado: R$ {cliente_crm.valor_estimado}")
                            if partes:
                                crm_context = "\n".join(partes)
                    except Exception as _crm_err:
                        print(f"⚠️ Erro ao buscar CRM context: {_crm_err}")

                    resposta_ia = asyncio.run(gerar_resposta_ia(
                        mensagens=historico,
                        nova_mensagem=content,
                        nome_assistente=getattr(empresa, 'ia_nome_assistente', 'Assistente') or 'Assistente',
                        contexto_negocio=getattr(empresa, 'ia_contexto', None),
                        delay_min=getattr(empresa, 'ia_delay_min', 7) or 7,
                        delay_max=getattr(empresa, 'ia_delay_max', 10) or 10,
                        crm_context=crm_context,
                    ))

                    # Detectar marcador de encerramento
                    encerrar_agora = '[CONVERSA_ENCERRADA]' in resposta_ia
                    resposta_limpa = resposta_ia.replace('[CONVERSA_ENCERRADA]', '').strip()

                    # IA "assume" a conversa se ainda não está em atendimento ou não foi marcada
                    if atendimento.status != 'em_atendimento' or not getattr(atendimento, 'atendido_por_ia', False):
                        atendimento.status = 'em_atendimento'
                        atendimento.atendido_por_ia = True
                        if not atendimento.atribuido_em:
                            atendimento.atribuido_em = datetime.now()
                        db.commit()

                    # Enviar resposta limpa via WhatsApp
                    wa_service = WhatsAppService(empresa)
                    asyncio.run(wa_service.send_text_message(from_number, resposta_limpa))

                    # Salvar resposta da IA no banco
                    msg_ia = MensagemLog(
                        empresa_id=empresa.id,
                        whatsapp_number=from_number,
                        message_id=f"ia_{message_id}",
                        direcao="enviada",
                        tipo_mensagem="text",
                        conteudo=resposta_limpa,
                        timestamp=datetime.now(),
                    )
                    db.add(msg_ia)
                    db.commit()
                    print(f"🤖 IA respondeu para {from_number}: {resposta_limpa[:60]}...")

                    if encerrar_agora:
                        print(f"🏁 IA encerrou conversa com {from_number}")
                        # Finalizar atendimento
                        atendimento.status = 'finalizado'
                        atendimento.finalizado_em = datetime.now()
                        atendimento.motivo_encerramento = 'ia_concluiu'

                        # Resetar sessão do bot
                        sessao_ia = db.query(ChatSessao).filter(
                            ChatSessao.empresa_id == empresa.id,
                            ChatSessao.whatsapp_number == from_number
                        ).first()
                        if sessao_ia:
                            sessao_ia.estado_atual = 'inicio'
                        db.commit()

                        # Enviar mensagem de encerramento + pesquisa (se ativa)
                        try:
                            msg_enc = getattr(empresa, 'mensagem_encerramento', None) or "Seu atendimento foi encerrado. Muito obrigado por entrar em contato!"
                            asyncio.run(wa_service.send_text_message(from_number, msg_enc))
                            pesquisa_ativa = getattr(empresa, 'pesquisa_satisfacao_ativa', False)
                            if pesquisa_ativa:
                                numero_fmt = from_number if from_number.startswith('+') else f'+{from_number}'
                                asyncio.run(wa_service.send_list_message(
                                    to=numero_fmt,
                                    body_text="Gostaríamos de saber sua opinião sobre o atendimento que você recebeu.",
                                    button_text="Avaliar Atendimento",
                                    header="Pesquisa de Satisfação",
                                    footer="Sua opinião é muito importante para nós!",
                                    sections=[{
                                        "title": "Selecione sua avaliação",
                                        "rows": [
                                            {"id": "nota_5", "title": "⭐ Excelente", "description": "Atendimento excepcional"},
                                            {"id": "nota_4", "title": "😊 Bom", "description": "Atendimento satisfatório"},
                                            {"id": "nota_3", "title": "😐 Regular", "description": "Poderia ser melhor"},
                                            {"id": "nota_2", "title": "😕 Ruim", "description": "Atendimento insatisfatório"},
                                            {"id": "nota_1", "title": "😞 Muito Ruim", "description": "Experiência muito negativa"},
                                        ]
                                    }]
                                ))
                                if sessao_ia:
                                    sessao_ia.estado_atual = 'pesquisa_satisfacao'
                                    sessao_ia.dados_temporarios = {'atendimento_id': atendimento.id}
                                    db.commit()
                        except Exception as _enc_e:
                            print(f"⚠️ Erro ao enviar pesquisa pós-IA: {_enc_e}")

                        # CRM update imediato (conversa encerrada, force=True)
                        try:
                            celery_app.send_task(
                                'app.tasks.tasks.atualizar_crm_ia',
                                args=[empresa.id, from_number, True],
                                countdown=0,
                            )
                        except Exception as _e:
                            print(f"⚠️ Falha ao agendar CRM update: {_e}")
                    else:
                        # Conversa ainda ativa — CRM update em 10 min
                        try:
                            celery_app.send_task(
                                'app.tasks.tasks.atualizar_crm_ia',
                                args=[empresa.id, from_number],
                                countdown=600,  # 10 minutos
                            )
                        except Exception as _e:
                            print(f"⚠️ Falha ao agendar CRM update: {_e}")

                except Exception as e:
                    print(f"❌ Erro na IA: {e}")
                    import traceback
                    traceback.print_exc()

            else:
                # ── Bot tradicional ──
                try:
                    bot_handler = BotMessageHandler(
                        empresa=empresa,
                        from_number=from_number,
                        message_content=content,
                        message_id=message_id,
                        db=db,
                        message_type=message_type,
                        dados_extras=dados_extras,
                    )

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
                            "status": atendimento.status if atendimento else "bot",
                            "atendente_id": atendimento.atendente_id if atendimento else None,
                            "atendido_por_ia": getattr(atendimento, 'atendido_por_ia', False) if atendimento else False,
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


# ========== TASK: VERIFICAR VENCIMENTOS DE ASSINATURAS ==========

@celery_app.task(name="app.tasks.tasks.verificar_vencimentos_task")
def verificar_vencimentos_task():
    """
    Task diaria (09:00): verifica vencimentos de assinaturas.
    - 7 dias antes: email lembrete
    - Vencimento: email
    - 7 dias depois: email ultimo aviso
    - 15 dias depois: bloqueia
    """
    from app.services.email_service import enviar_email_lembrete_pagamento, enviar_email_bloqueio

    db = SessionLocal()
    try:
        now = datetime.now()
        assinaturas = db.query(Assinatura).filter(
            Assinatura.status.in_(["active", "overdue"])
        ).all()

        lembretes = 0
        bloqueios = 0

        for ass in assinaturas:
            if not ass.data_proximo_vencimento:
                continue

            dias = (ass.data_proximo_vencimento - now).days

            # Identificar usuario
            email = None
            nome = None
            plano_nome = ass.plano.nome if ass.plano else "Plano"

            if ass.dev_id:
                dev = db.query(DevUsuario).filter(DevUsuario.id == ass.dev_id).first()
                if dev:
                    email = dev.email
                    nome = dev.nome
            elif ass.empresa_id:
                emp = db.query(Empresa).filter(Empresa.id == ass.empresa_id).first()
                if emp:
                    email = emp.admin_email or emp.email
                    nome = emp.nome

            if not email:
                continue

            if dias == 7:
                # 7 dias antes: lembrete
                enviar_email_lembrete_pagamento(email, nome, "lembrete", 7, plano_nome)
                lembretes += 1

            elif dias == 0:
                # Dia do vencimento
                ass.status = "overdue"
                db.commit()
                enviar_email_lembrete_pagamento(email, nome, "vencimento", 0, plano_nome)
                lembretes += 1

            elif dias == -7:
                # 7 dias depois
                enviar_email_lembrete_pagamento(email, nome, "ultimo_aviso", 8, plano_nome)
                lembretes += 1

            elif dias <= -15:
                # 15 dias depois: bloqueia
                ass.status = "blocked"
                ass.data_bloqueio = now

                if ass.dev_id:
                    dev = db.query(DevUsuario).filter(DevUsuario.id == ass.dev_id).first()
                    if dev:
                        dev.status = "blocked"
                elif ass.empresa_id:
                    emp = db.query(Empresa).filter(Empresa.id == ass.empresa_id).first()
                    if emp:
                        emp.ativa = False

                db.commit()
                enviar_email_bloqueio(email, nome, plano_nome)
                bloqueios += 1

        db.close()
        logger.info(f"Vencimentos verificados: {lembretes} lembretes, {bloqueios} bloqueios")
        return {"success": True, "lembretes": lembretes, "bloqueios": bloqueios}

    except Exception as e:
        logger.error(f"Erro ao verificar vencimentos: {e}")
        db.close()
        return {"success": False, "error": str(e)}


# ========== TASK: VERIFICAR TRIALS DE DEVS ==========

@celery_app.task(name="app.tasks.tasks.verificar_trials_dev_task")
def verificar_trials_dev_task():
    """
    Task diaria: verifica trials expirados.
    trial_fim < now() sem assinatura ativa -> status=blocked
    """
    db = SessionLocal()
    try:
        now = datetime.now()
        devs = db.query(DevUsuario).filter(
            DevUsuario.status == "trial",
            DevUsuario.trial_fim < now,
        ).all()

        bloqueados = 0
        for dev in devs:
            # Verificar se tem assinatura ativa
            assinatura = db.query(Assinatura).filter(
                Assinatura.dev_id == dev.id,
                Assinatura.status == "active",
            ).first()

            if not assinatura:
                dev.status = "blocked"
                bloqueados += 1
                logger.info(f"Dev {dev.nome} ({dev.email}) bloqueado por trial expirado")

        db.commit()
        db.close()
        logger.info(f"Trials verificados: {bloqueados} devs bloqueados")
        return {"success": True, "bloqueados": bloqueados}

    except Exception as e:
        logger.error(f"Erro ao verificar trials: {e}")
        db.close()
        return {"success": False, "error": str(e)}


# ========== TASK: FORWARD WEBHOOK PARA DEV ==========

@celery_app.task(name="app.tasks.tasks.forward_webhook_dev_task")
def forward_webhook_dev_task(dev_id: int, payload: dict):
    """
    Task para encaminhar webhook para o endpoint do dev.
    """
    import asyncio
    from app.services.webhook_forwarder import forward_webhook_to_dev

    db = SessionLocal()
    try:
        dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
        if not dev or not dev.webhook_url:
            return {"success": False, "error": "Dev sem webhook_url"}

        success = asyncio.run(forward_webhook_to_dev(
            webhook_url=dev.webhook_url,
            webhook_secret=dev.webhook_secret or "",
            payload=payload,
        ))

        db.close()
        return {"success": success, "dev_id": dev_id}

    except Exception as e:
        logger.error(f"Erro ao encaminhar webhook para dev {dev_id}: {e}")
        db.close()
        return {"success": False, "error": str(e)}


# ========== HELPER: PROCESSAR account_update WEBHOOK ==========

def _handle_account_update(value: dict, db: Session):
    """
    Processa eventos account_update da Meta:
    - PARTNER_APP_INSTALLED: cliente conectou via Embedded Signup → subscribe + register
    - PARTNER_CLIENT_CERTIFICATION_STATUS_UPDATE: verificação de negócio aprovada
    """
    import asyncio
    from app.services.meta_signup import subscribe_app_to_waba, register_phone_number

    event = value.get("event", "")
    waba_info = value.get("waba_info", {})
    waba_id = waba_info.get("waba_id", "")

    logger.info(f"account_update evento: {event} | WABA: {waba_id}")

    if event == "PARTNER_APP_INSTALLED" and waba_id:
        # Novo cliente conectou via Embedded Signup
        # Buscar empresa pela WABA
        empresa = db.query(Empresa).filter(Empresa.waba_id == waba_id).first()
        if empresa and empresa.whatsapp_token:
            logger.info(f"PARTNER_APP_INSTALLED: tentando subscribe+register para {empresa.nome}")
            try:
                asyncio.run(subscribe_app_to_waba(waba_id, empresa.whatsapp_token))
                logger.info(f"Subscribe OK para WABA {waba_id}")
            except Exception as e:
                logger.warning(f"Subscribe falhou para WABA {waba_id}: {e}")
            try:
                asyncio.run(register_phone_number(empresa.phone_number_id, empresa.whatsapp_token))
                logger.info(f"Register OK para phone {empresa.phone_number_id}")
            except Exception as e:
                logger.warning(f"Register falhou para phone {empresa.phone_number_id}: {e}")

    elif event == "PARTNER_CLIENT_CERTIFICATION_STATUS_UPDATE":
        # Verificação de negócio atualizada
        cert_info = value.get("partner_client_certification_info", {})
        status = cert_info.get("status", "")
        logger.info(f"Certificação WABA {waba_id}: {status}")


# ========== TASK: REGISTRAR NÚMEROS PENDENTES ==========

@celery_app.task(name="app.tasks.tasks.registrar_numeros_pendentes_task")
def registrar_numeros_pendentes_task():
    """
    Task periódica (a cada 4h): verifica empresas com número ainda PENDING
    na Meta e tenta registrar quando account_review_status == APPROVED.
    """
    import asyncio
    from app.services.meta_signup import register_phone_number, subscribe_app_to_waba

    db = SessionLocal()
    registrados = 0
    pendentes = 0

    try:
        # Buscar empresas com phone_number_id real (não placeholder)
        empresas = db.query(Empresa).filter(
            Empresa.phone_number_id.isnot(None),
            Empresa.ativa == True,
            ~Empresa.phone_number_id.like("PENDENTE%"),
            ~Empresa.phone_number_id.like("PHONE_ID%"),
            Empresa.whatsapp_token.isnot(None),
            ~Empresa.whatsapp_token.like("TOKEN%"),
        ).all()

        for empresa in empresas:
            try:
                # Checar status do número (campo "status" fica no phone number)
                phone_data = httpx.get(
                    f"https://graph.facebook.com/v25.0/{empresa.phone_number_id}",
                    params={"fields": "status", "access_token": empresa.whatsapp_token},
                    timeout=10.0,
                ).json()

                phone_status = phone_data.get("status", "")

                if phone_status != "PENDING":
                    continue  # Já registrado ou outro status

                # Número pendente — checar se WABA foi aprovada
                account_review = "UNKNOWN"
                if empresa.waba_id:
                    waba_data = httpx.get(
                        f"https://graph.facebook.com/v25.0/{empresa.waba_id}",
                        params={"fields": "account_review_status", "access_token": empresa.whatsapp_token},
                        timeout=10.0,
                    ).json()
                    account_review = waba_data.get("account_review_status", "UNKNOWN")

                if phone_status == "PENDING" and account_review == "APPROVED":
                    # WABA aprovada mas número ainda não registrado → tentar agora
                    logger.info(f"Tentando registrar número pendente: {empresa.nome} ({empresa.phone_number_id})")
                    try:
                        asyncio.run(subscribe_app_to_waba(empresa.waba_id, empresa.whatsapp_token))
                    except Exception:
                        pass
                    ok = asyncio.run(register_phone_number(empresa.phone_number_id, empresa.whatsapp_token))
                    if ok:
                        registrados += 1
                        logger.info(f"Número registrado com sucesso: {empresa.nome}")
                    else:
                        pendentes += 1

                elif phone_status == "PENDING":
                    pendentes += 1
                    logger.info(f"Número ainda pendente (WABA em revisão): {empresa.nome} | review={account_review}")

            except Exception as e:
                logger.warning(f"Erro ao checar empresa {empresa.nome}: {e}")

        # ---- Devs com número pendente ----
        devs = db.query(DevUsuario).filter(
            DevUsuario.phone_number_id.isnot(None),
            DevUsuario.ativo == True,
            ~DevUsuario.phone_number_id.like("PENDENTE%"),
            ~DevUsuario.phone_number_id.like("PHONE_ID%"),
            DevUsuario.whatsapp_token.isnot(None),
            ~DevUsuario.whatsapp_token.like("TOKEN%"),
        ).all()

        for dev in devs:
            try:
                phone_data = httpx.get(
                    f"https://graph.facebook.com/v25.0/{dev.phone_number_id}",
                    params={"fields": "status", "access_token": dev.whatsapp_token},
                    timeout=10.0,
                ).json()

                phone_status = phone_data.get("status", "")

                if phone_status != "PENDING":
                    continue

                account_review = "UNKNOWN"
                if dev.waba_id:
                    waba_data = httpx.get(
                        f"https://graph.facebook.com/v25.0/{dev.waba_id}",
                        params={"fields": "account_review_status", "access_token": dev.whatsapp_token},
                        timeout=10.0,
                    ).json()
                    account_review = waba_data.get("account_review_status", "UNKNOWN")

                if phone_status == "PENDING" and account_review == "APPROVED":
                    logger.info(f"Tentando registrar número pendente (dev): {dev.nome} ({dev.phone_number_id})")
                    try:
                        asyncio.run(subscribe_app_to_waba(dev.waba_id, dev.whatsapp_token))
                    except Exception:
                        pass
                    ok = asyncio.run(register_phone_number(dev.phone_number_id, dev.whatsapp_token))
                    if ok:
                        registrados += 1
                        logger.info(f"Número dev registrado com sucesso: {dev.nome}")
                    else:
                        pendentes += 1

                elif phone_status == "PENDING":
                    pendentes += 1
                    logger.info(f"Número dev ainda pendente (WABA em revisão): {dev.nome} | review={account_review}")

            except Exception as e:
                logger.warning(f"Erro ao checar dev {dev.nome}: {e}")

        db.close()
        logger.info(f"Números pendentes: {pendentes} aguardando, {registrados} registrados agora")
        return {"success": True, "registrados": registrados, "pendentes": pendentes}

    except Exception as e:
        logger.error(f"Erro na task de registrar números: {e}")
        db.close()
        return {"success": False, "error": str(e)}


# ========== TASK: SINCRONIZAR LIMITES WABA DA META ==========

@celery_app.task(name="app.tasks.tasks.sincronizar_limites_waba_task")
def sincronizar_limites_waba_task():
    """
    Task semanal: consulta a API da Meta para cada dev/empresa com WABA conectado
    e atualiza o limite real de mensagens no Redis.

    A Meta retorna o messaging_limit do WABA (TIER_1K, TIER_10K, TIER_100K, UNLIMITED).
    Guardamos no Redis para o gateway usar como limite dinamico.
    """
    db = SessionLocal()
    atualizados = 0
    erros = 0

    tier_map = {
        "TIER_250": 250,
        "TIER_1K": 1000,
        "TIER_10K": 10000,
        "TIER_100K": 100000,
        "TIER_UNLIMITED": 999999999,
    }

    try:
        # Devs com WABA conectado
        devs = db.query(DevUsuario).filter(
            DevUsuario.waba_id.isnot(None),
            DevUsuario.whatsapp_token.isnot(None),
            DevUsuario.ativo == True,
        ).all()

        for dev in devs:
            try:
                limit_info = _fetch_waba_messaging_limit(
                    waba_id=dev.waba_id,
                    token=dev.whatsapp_token,
                )
                if limit_info:
                    tier = limit_info.get("messaging_limit", "")
                    quality = limit_info.get("quality_rating", "UNKNOWN")
                    limit_num = tier_map.get(tier, 1000)

                    # Salvar no Redis (chave dinamica, TTL 8 dias)
                    cache_key = f"waba:limit:dev:{dev.id}"
                    redis_cache.client.setex(
                        cache_key,
                        86400 * 8,  # 8 dias (re-sync semanal)
                        json.dumps({
                            "tier": tier,
                            "limit": limit_num,
                            "quality": quality,
                            "updated_at": datetime.utcnow().isoformat(),
                        }),
                    )
                    atualizados += 1
                    logger.info(f"WABA limit dev {dev.nome}: {tier} ({limit_num} msgs) quality={quality}")

            except Exception as e:
                erros += 1
                logger.warning(f"Erro ao consultar WABA de dev {dev.id}: {e}")

        # Empresas com WABA conectado
        empresas = db.query(Empresa).filter(
            Empresa.waba_id.isnot(None),
            Empresa.whatsapp_token.isnot(None),
            Empresa.ativa == True,
        ).all()

        for emp in empresas:
            try:
                limit_info = _fetch_waba_messaging_limit(
                    waba_id=emp.waba_id,
                    token=emp.whatsapp_token,
                )
                if limit_info:
                    tier = limit_info.get("messaging_limit", "")
                    quality = limit_info.get("quality_rating", "UNKNOWN")
                    limit_num = tier_map.get(tier, 1000)

                    cache_key = f"waba:limit:emp:{emp.id}"
                    redis_cache.client.setex(
                        cache_key,
                        86400 * 8,
                        json.dumps({
                            "tier": tier,
                            "limit": limit_num,
                            "quality": quality,
                            "updated_at": datetime.utcnow().isoformat(),
                        }),
                    )
                    atualizados += 1
                    logger.info(f"WABA limit empresa {emp.nome}: {tier} ({limit_num} msgs) quality={quality}")

            except Exception as e:
                erros += 1
                logger.warning(f"Erro ao consultar WABA de empresa {emp.id}: {e}")

        db.close()
        logger.info(f"Sincronizacao WABA concluida: {atualizados} atualizados, {erros} erros")
        return {"success": True, "atualizados": atualizados, "erros": erros}

    except Exception as e:
        logger.error(f"Erro na sincronizacao WABA: {e}")
        db.close()
        return {"success": False, "error": str(e)}


def _fetch_waba_messaging_limit(waba_id: str, token: str) -> Optional[dict]:
    """
    Consulta API da Meta para obter messaging_limit e quality_rating do WABA.
    GET https://graph.facebook.com/v25.0/{waba_id}?fields=messaging_limit_tier,quality_score
    """
    url = f"https://graph.facebook.com/v25.0/{waba_id}/phone_numbers?fields=messaging_limit_tier,quality_rating"
    headers = {"Authorization": f"Bearer {token}"}

    try:
        response = httpx.get(url, headers=headers, timeout=15.0)
        response.raise_for_status()
        data = response.json()

        # Pegar dados do primeiro phone number
        phone_numbers = data.get("data", [])
        if phone_numbers:
            pn = phone_numbers[0]
            return {
                "messaging_limit": pn.get("messaging_limit_tier", "TIER_1K"),
                "quality_rating": pn.get("quality_rating", "UNKNOWN"),
            }
        return None

    except Exception as e:
        logger.warning(f"Erro ao consultar WABA {waba_id}: {e}")
        return None


# ========== TASK: ATUALIZAR CRM COM IA (background, após resposta da IA) ==========

@celery_app.task(name="app.tasks.tasks.atualizar_crm_ia")
def atualizar_crm_ia(empresa_id: int, whatsapp_number: str, force: bool = False):
    """
    Analisa a conversa com Claude Haiku e atualiza os campos CRM do lead automaticamente.
    Executa em background após cada resposta da IA conversacional.
    Só avança no funil — nunca regride (ex: negociacao → novo_lead é ignorado).
    """
    ORDEM_FUNIL = [
        "novo_lead",
        "pediu_orcamento",
        "orcamento_enviado",
        "negociacao",
        "fechado",
        "perdido",
    ]

    db = SessionLocal()
    try:
        import asyncio
        from datetime import timezone, timedelta
        from app.services.ai_service import analisar_conversa

        # Verificar se conversa ainda está ativa (mensagem nos últimos 9 min)
        # Se sim, pula — outra task agendada mais recente vai cuidar disso
        # force=True ignora a verificação (usado quando IA encerrou a conversa)
        if not force:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=9)
            msg_recente = db.query(MensagemLog).filter(
                MensagemLog.empresa_id == empresa_id,
                MensagemLog.whatsapp_number == whatsapp_number,
                MensagemLog.timestamp >= cutoff,
            ).first()
            if msg_recente:
                print(f"⏸️  Conversa ainda ativa para {whatsapp_number} — CRM update adiado")
                return

        # Buscar mensagens recentes para análise (últimas 40)
        mensagens = (
            db.query(MensagemLog)
            .filter(
                MensagemLog.empresa_id == empresa_id,
                MensagemLog.whatsapp_number == whatsapp_number,
            )
            .order_by(MensagemLog.timestamp.desc())
            .limit(40)
            .all()
        )
        mensagens = list(reversed(mensagens))

        if len(mensagens) < 2:
            return  # Muito pouco contexto para analisar

        cliente = db.query(Cliente).filter(
            Cliente.empresa_id == empresa_id,
            Cliente.whatsapp_number == whatsapp_number,
        ).first()

        if not cliente:
            return  # Lead não cadastrado ainda

        nome_cliente = cliente.nome_completo or whatsapp_number
        sugestao = asyncio.run(analisar_conversa(mensagens, nome_cliente))

        # Atualizar campos textuais sempre (IA tem contexto mais recente)
        if sugestao.get("resumo_conversa"):
            cliente.resumo_conversa = sugestao["resumo_conversa"]
        if sugestao.get("preferencias"):
            cliente.preferencias = sugestao["preferencias"]
        if sugestao.get("observacoes_crm"):
            cliente.observacoes_crm = sugestao["observacoes_crm"]

        # Atualizar valor estimado se detectado
        if sugestao.get("valor_estimado") and float(sugestao["valor_estimado"]) > 0:
            cliente.valor_estimado = sugestao["valor_estimado"]

        # Avançar etapa do funil (só progressão, nunca regressão)
        nova_etapa = sugestao.get("funil_etapa")
        if nova_etapa and nova_etapa in ORDEM_FUNIL:
            etapa_atual = cliente.funil_etapa or "novo_lead"
            idx_atual = ORDEM_FUNIL.index(etapa_atual) if etapa_atual in ORDEM_FUNIL else 0
            idx_nova = ORDEM_FUNIL.index(nova_etapa)
            # Permite avançar E permite marcar como perdido independente da etapa
            if idx_nova > idx_atual or nova_etapa == "perdido":
                cliente.funil_etapa = nova_etapa
                print(f"📊 Funil atualizado: {whatsapp_number} → {etapa_atual} → {nova_etapa}")

        db.commit()
        print(f"✅ CRM atualizado automaticamente para {whatsapp_number}")

    except Exception as e:
        print(f"❌ Erro no atualizar_crm_ia: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()
