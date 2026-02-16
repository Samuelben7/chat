from fastapi import APIRouter, Request, HTTPException, Query, Depends, BackgroundTasks
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from typing import Dict, Any
from datetime import datetime

from app.database.database import get_db
from app.models.models import MensagemLog, ChatSessao, Atendimento, Empresa, Cliente
from app.services.whatsapp import extract_message_data
from app.services.bot_handler import BotMessageHandler
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
        from_number = message.get("from")
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
                content = button_reply.get("id", "")  # Usa ID ao invés de title
                dados_extras["button_id"] = button_reply.get("id", "")
                dados_extras["button_title"] = button_reply.get("title", "")
            elif interactive_type == "list_reply":
                list_reply = interactive.get("list_reply", {})
                content = list_reply.get("id", "")  # Usa ID ao invés de title
                dados_extras["list_id"] = list_reply.get("id", "")
                dados_extras["list_title"] = list_reply.get("title", "")

        print(f"📥 Mensagem de {from_number}: {content}")

        # INVALIDAR CACHE DE CONVERSAS (nova mensagem = atualizar lista)
        redis_cache.invalidate_pattern(f"conversas:emp:{empresa.id}*")
        print(f"🗑️  Cache de conversas invalidado para empresa {empresa.id}")

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

        # Se não existe atendimento ou está em atendimento humano, não processa no bot
        processar_bot = True

        if atendimento and atendimento.status == 'em_atendimento':
            processar_bot = False
            print(f"ℹ️  Mensagem em atendimento humano, não processar bot")

        # CRÍTICO: Verificar se humano respondeu recentemente (últimos 5 min)
        # Se sim, NÃO processar bot (evita conflito humano vs bot)
        from datetime import timedelta
        ultima_enviada = db.query(MensagemLog).filter(
            MensagemLog.whatsapp_number == from_number,
            MensagemLog.empresa_id == empresa.id,
            MensagemLog.direcao == 'enviada',
            MensagemLog.timestamp >= datetime.now(timezone.utc) - timedelta(minutes=5)
        ).order_by(MensagemLog.timestamp.desc()).first()

        if ultima_enviada:
            processar_bot = False
            print(f"🚫 Humano respondeu recentemente ({ultima_enviada.timestamp}) - Bot pausado")

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

            if not atendimento:
                atendimento = Atendimento(
                    whatsapp_number=from_number,
                    status='bot'
                )
                db.add(atendimento)
        else:
            atendimento.ultima_mensagem_em = datetime.now()

        db.commit()

        # Processar com bot se necessário
        if processar_bot:
            try:
                # Cria handler do bot
                bot_handler = BotMessageHandler(
                    empresa=empresa,
                    from_number=from_number,
                    message_content=content,
                    message_id=message_id,
                    db=db
                )

                # Processa mensagem
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
