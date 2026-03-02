from fastapi import APIRouter, Request, HTTPException, Query, Depends, BackgroundTasks
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from typing import Dict, Any
from datetime import datetime, timezone

from app.database.database import get_db
from app.models.models import MensagemLog, ChatSessao, Atendimento, Empresa, Cliente
from app.services.whatsapp import extract_message_data, WhatsAppService
from app.services.bot_handler import BotMessageHandler
from app.services.ai_chat_service import gerar_resposta_ia
from app.core.redis_client import redis_cache

router = APIRouter()

# Import WebSocket manager para broadcast
try:
    from app.core.websocket_manager import manager as ws_manager
    WS_AVAILABLE = True
except:
    WS_AVAILABLE = False
    print("⚠️  WebSocket não disponível no webhook")

# Import Celery tasks
try:
    from app.tasks.tasks import processar_webhook_completo
    CELERY_AVAILABLE = True
except:
    CELERY_AVAILABLE = False
    print("⚠️  Celery não disponível no webhook")


@router.get("/webhook")
async def verify_webhook(
    request: Request,
    hub_mode: str = Query(default=None, alias="hub.mode"),
    hub_verify_token: str = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str = Query(default=None, alias="hub.challenge"),
    db: Session = Depends(get_db)
):
    """
    Webhook verification endpoint para WhatsApp (multi-tenant).
    Meta envia GET request para verificar o webhook.
    """
    # Log completo da requisição para debug
    print(f"🔐 Verificação webhook recebida")
    print(f"Query params: {dict(request.query_params)}")
    print(f"Mode: {hub_mode}")
    print(f"Token recebido: {hub_verify_token}")
    print(f"Challenge: {hub_challenge}")

    # Validar que todos os parâmetros foram fornecidos
    if not hub_mode or not hub_verify_token or not hub_challenge:
        print("❌ Parâmetros ausentes na verificação do webhook")
        raise HTTPException(
            status_code=400,
            detail="Missing required parameters: hub.mode, hub.verify_token, hub.challenge"
        )

    if hub_mode == "subscribe":
        # Busca empresa pelo verify_token
        empresa = db.query(Empresa).filter(
            Empresa.verify_token == hub_verify_token,
            Empresa.ativa == True
        ).first()

        if empresa:
            print(f"✅ Webhook verificado para empresa: {empresa.nome}")
            return PlainTextResponse(content=hub_challenge)

    print("❌ Token de verificação inválido!")
    raise HTTPException(status_code=403, detail="Verification token mismatch")


@router.post("/webhook")
async def receive_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Webhook endpoint para receber mensagens do WhatsApp (multi-tenant).
    Meta envia POST request quando há novas mensagens.

    OTIMIZAÇÃO:
    - Responde em < 100ms (Meta tem timeout de 2 segundos)
    - Processamento assíncrono via Celery
    - Cache invalidation imediata
    """
    try:
        body = await request.json()
        print(f"📨 Webhook recebido")

        # RESPONDER IMEDIATAMENTE (< 100ms)
        # Processar em background via Celery ou BackgroundTasks
        if CELERY_AVAILABLE:
            # Melhor opção: Celery (worker separado)
            processar_webhook_completo.delay(body)
            print("✅ Webhook enviado para Celery")
        else:
            # Fallback: BackgroundTasks (mesmo processo)
            background_tasks.add_task(process_webhook_sync, body, db)
            print("⚠️  Webhook processando via BackgroundTasks (use Celery em produção)")

        return {"status": "ok"}

    except Exception as e:
        print(f"❌ Erro recebendo webhook: {e}")
        # Ainda assim retornar 200 para Meta não reenviar
        return {"status": "ok"}


async def process_webhook_sync(body: dict, db: Session):
    """Processa webhook de forma síncrona (fallback quando Celery não disponível)."""
    try:
        if body.get("object") == "whatsapp_business_account":
            entries = body.get("entry", [])

            for entry in entries:
                changes = entry.get("changes", [])

                for change in changes:
                    value = change.get("value", {})

                    # Extrai phone_number_id para identificar empresa
                    phone_number_id = value.get("metadata", {}).get("phone_number_id")

                    if not phone_number_id:
                        continue

                    # Busca empresa
                    empresa = db.query(Empresa).filter(
                        Empresa.phone_number_id == phone_number_id,
                        Empresa.ativa == True
                    ).first()

                    if not empresa:
                        continue

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
                            await process_incoming_message(message, empresa, db, contacts_info)

                    # Processar status de mensagens enviadas
                    if "statuses" in value:
                        statuses = value.get("statuses", [])
                        for status in statuses:
                            await process_message_status(status, empresa, db)

    except Exception as e:
        print(f"❌ Erro processando webhook sync: {e}")
        import traceback
        traceback.print_exc()


async def process_incoming_message(message: Dict[str, Any], empresa: Empresa, db: Session, contacts_info: dict = None):
    """Processa mensagem recebida do WhatsApp."""
    try:
        from_number = (message.get("from") or "").lstrip('+')  # sempre sem '+' para consistência
        message_id = message.get("id")

        # ========== AUTO-SALVAR CONTATO ==========
        try:
            existing_client = db.query(Cliente).filter(
                Cliente.empresa_id == empresa.id,
                Cliente.whatsapp_number == from_number,
            ).first()

            # Extrair profile_name dos dados do webhook
            profile_name = (contacts_info or {}).get(from_number, "")

            if not existing_client:
                if not profile_name:
                    profile_name = f"Contato {from_number[-4:]}"

                new_client = Cliente(
                    empresa_id=empresa.id,
                    nome_completo=profile_name,
                    whatsapp_number=from_number,
                )
                db.add(new_client)
                db.commit()
                print(f"📇 Novo contato salvo: {profile_name} ({from_number})")
            else:
                # Atualizar nome se for genérico E tiver profile_name do webhook
                if profile_name and existing_client.nome_completo.startswith("Contato "):
                    existing_client.nome_completo = profile_name
                    db.commit()
                    print(f"📝 Nome atualizado: {existing_client.nome_completo} -> {profile_name}")
        except Exception as e:
            print(f"⚠️ Erro ao auto-salvar contato: {e}")
            db.rollback()
        timestamp = message.get("timestamp")
        message_type = message.get("type")

        # Extrair conteúdo baseado no tipo
        content = ""
        dados_extras = {}

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

        # TYPING INDICATOR + READ RECEIPT para Meta (se houver atendente humano ativo)
        # Mostra para o usuário que a empresa viu a mensagem e está respondendo
        # Fire-and-forget: não bloqueia o processamento em caso de falha
        try:
            atend_ativo = db.query(Atendimento).filter(
                Atendimento.whatsapp_number == from_number,
                Atendimento.empresa_id == empresa.id,
                Atendimento.status == "em_atendimento",
            ).first()
            if atend_ativo:
                from app.services.whatsapp import WhatsAppService
                _ws = WhatsAppService(empresa)
                await _ws.send_typing_indicator(message_id)
        except Exception as _e:
            print(f"⚠️  Typing indicator falhou (não crítico): {_e}")

        # INVALIDAR CACHE DE CONVERSAS (nova mensagem = atualizar lista)
        redis_cache.invalidate_pattern(f"conversas:emp:{empresa.id}*")
        print(f"🗑️  Cache de conversas invalidado para empresa {empresa.id}")

        # ========== PESQUISA DE SATISFAÇÃO ==========
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

                sessao.estado_atual = "inicio"
                sessao.dados_temporarios = {}
                db.commit()

                # Salvar mensagem + enviar agradecimento
                from app.services.whatsapp import WhatsAppService
                msg_log = MensagemLog(
                    empresa_id=empresa.id,
                    whatsapp_number=from_number,
                    message_id=message_id,
                    direcao="recebida",
                    tipo_mensagem=message_type,
                    conteudo=content,
                    dados_extras=dados_extras,
                    estado_sessao="pesquisa_satisfacao"
                )
                db.add(msg_log)
                db.commit()

                respostas = {
                    1: "Lamentamos que sua experiência não tenha sido boa. Vamos melhorar!",
                    2: "Agradecemos seu feedback. Vamos trabalhar para melhorar!",
                    3: "Obrigado pela avaliação! Vamos buscar ser ainda melhores.",
                    4: "Que bom que gostou! Obrigado pelo feedback!",
                    5: "Excelente! Ficamos muito felizes com sua avaliação!"
                }
                msg_agradecimento = f"Obrigado pela sua avaliação! {respostas.get(nota, '')}"
                whatsapp_svc = WhatsAppService(empresa)
                numero = from_number if from_number.startswith('+') else f'+{from_number}'
                await whatsapp_svc.send_text_message(numero, msg_agradecimento)

                return  # Não processar com bot

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

        # Determinar se processa com bot/IA ou está em atendimento humano
        processar_bot = True

        if atendimento and atendimento.status == 'em_atendimento':
            # Humano assumiu o chat via painel — bot e IA ficam pausados
            processar_bot = False
            print(f"ℹ️  Chat em atendimento humano (status=em_atendimento) — bot/IA pausado")
        elif atendimento and atendimento.atendente_id is not None:
            # Tem atendente vinculado mas pode não ter assumido ainda — deixa bot/IA rodar
            # (apenas status 'em_atendimento' pausa, não só ter atendente_id)
            pass

        if not atendimento:
            # Busca na tabela de mensagens para ver se já existe registro
            msg_existente = db.query(MensagemLog).filter(
                MensagemLog.empresa_id == empresa.id,
                MensagemLog.whatsapp_number == from_number
            ).first()

            if msg_existente:
                # Busca atendimento associado
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

        # Processar com IA ou bot
        if processar_bot:
            # ── IA Conversacional (tem prioridade sobre o bot) ──
            if getattr(empresa, 'ia_ativa', False) and content and message_type in ('text', 'button', 'interactive'):
                try:
                    # Buscar histórico da conversa (sem a mensagem atual)
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

                    resposta_ia = await gerar_resposta_ia(
                        mensagens=historico,
                        nova_mensagem=content,
                        nome_assistente=getattr(empresa, 'ia_nome_assistente', 'Assistente') or 'Assistente',
                        contexto_negocio=getattr(empresa, 'ia_contexto', None),
                        delay_min=getattr(empresa, 'ia_delay_min', 3) or 3,
                        delay_max=getattr(empresa, 'ia_delay_max', 10) or 10,
                    )

                    # Enviar resposta via WhatsApp API (direto para Meta)
                    wa_service = WhatsAppService(empresa)
                    await wa_service.send_text_message(from_number, resposta_ia)

                    # Salvar resposta da IA no banco
                    msg_ia = MensagemLog(
                        empresa_id=empresa.id,
                        whatsapp_number=from_number,
                        message_id=f"ia_{message_id}",
                        direcao="enviada",
                        tipo_mensagem="text",
                        conteudo=resposta_ia,
                        timestamp=datetime.now(timezone.utc),
                    )
                    db.add(msg_ia)
                    db.commit()
                    print(f"🤖 IA respondeu para {from_number}: {resposta_ia[:60]}...")

                except Exception as e:
                    print(f"❌ Erro na IA conversacional: {e}")
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
                    await bot_handler.process_message()
                    print(f"✅ Mensagem processada pelo bot")

                except Exception as e:
                    print(f"❌ Erro ao processar mensagem com bot: {e}")
                    import traceback
                    traceback.print_exc()

        # Broadcast via WebSocket para atendentes conectados
        # BROADCAST AMBAS: mensagem recebida E resposta do bot (se houver)
        if WS_AVAILABLE:
            # Busca últimas 2 mensagens (recebida + resposta bot)
            mensagens_recentes = db.query(MensagemLog).filter(
                MensagemLog.empresa_id == empresa.id,
                MensagemLog.whatsapp_number == from_number
            ).order_by(MensagemLog.timestamp.desc()).limit(2).all()

            for msg in reversed(mensagens_recentes):  # Broadcast em ordem cronológica
                await ws_manager.broadcast_to_empresa(empresa.id, {
                    "event": "nova_mensagem",
                    "data": {
                        "mensagem": {
                            "id": msg.id,
                            "whatsapp_number": msg.whatsapp_number,
                            "message_id": msg.message_id,
                            "conteudo": msg.conteudo,
                            "direcao": msg.direcao,
                            "tipo_mensagem": msg.tipo_mensagem,
                            "timestamp": msg.timestamp.isoformat(),
                            "lida": msg.lida,
                            "dados_extras": msg.dados_extras or {}  # CRÍTICO: incluir dados_extras para renderizar listas/botões
                        },
                        "atendimento": {
                            "status": atendimento.status if atendimento else "bot"
                        }
                    }
                })
                print(f"🔔 Broadcast {msg.direcao}: {msg.conteudo[:50]}")

    except Exception as e:
        print(f"❌ Erro processando mensagem: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()


async def process_message_status(status: Dict[str, Any], empresa: Empresa, db: Session):
    """Processa status de mensagem enviada (sent/delivered/read/failed)."""
    try:
        from app.core.redis_client import redis_cache
        from app.core.websocket_manager import manager

        message_id = status.get("id")
        status_type = status.get("status")  # sent, delivered, read, failed

        print(f"📊 Status da mensagem {message_id}: {status_type}")

        # Atualizar status da mensagem no banco
        mensagem = db.query(MensagemLog).filter(
            MensagemLog.empresa_id == empresa.id,
            MensagemLog.message_id == message_id
        ).first()

        if mensagem:
            if status_type == "read":
                mensagem.lida = True

                # REDIS: Marcar como lida (performance - evita queries futuras)
                read_key = f"msg:read:{message_id}"
                redis_cache.client.setex(read_key, 86400, "1")  # TTL 24h

                print(f"✅ Mensagem marcada como lida no Redis: {message_id}")

            elif status_type == "failed":
                error = status.get("errors", [{}])[0]
                mensagem.erro = error.get("message", "Erro desconhecido")

            db.commit()

            # WEBSOCKET BROADCAST: Notificar frontend em tempo real
            if status_type in ["read", "delivered"]:
                await manager.broadcast_to_empresa(
                    empresa.id,
                    {
                        "event": "message_status_update",
                        "data": {
                            "message_id": message_id,
                            "whatsapp_number": mensagem.whatsapp_number,
                            "status": status_type,
                            "lida": mensagem.lida,
                            "id": mensagem.id
                        }
                    }
                )
                print(f"🔔 Broadcast status '{status_type}' para empresa {empresa.id}")

    except Exception as e:
        print(f"❌ Erro processando status: {e}")
        db.rollback()
