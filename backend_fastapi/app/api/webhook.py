from fastapi import APIRouter, Request, HTTPException, Query, Depends, BackgroundTasks
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from typing import Dict, Any
from datetime import datetime

from app.database.database import get_db
from app.models.models import MensagemLog, ChatSessao, Atendimento, Empresa
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
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
    db: Session = Depends(get_db)
):
    """
    Webhook verification endpoint para WhatsApp (multi-tenant).
    Meta envia GET request para verificar o webhook.
    """
    print(f"🔐 Verificação webhook recebida")
    print(f"Mode: {hub_mode}")
    print(f"Token recebido: {hub_verify_token}")

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

                    # Processar mensagens recebidas
                    if "messages" in value:
                        messages = value.get("messages", [])
                        for message in messages:
                            await process_incoming_message(message, empresa, db)

                    # Processar status de mensagens enviadas
                    if "statuses" in value:
                        statuses = value.get("statuses", [])
                        for status in statuses:
                            await process_message_status(status, empresa, db)

    except Exception as e:
        print(f"❌ Erro processando webhook sync: {e}")
        import traceback
        traceback.print_exc()


async def process_incoming_message(message: Dict[str, Any], empresa: Empresa, db: Session):
    """Processa mensagem recebida do WhatsApp."""
    try:
        from_number = message.get("from")
        message_id = message.get("id")
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
        if WS_AVAILABLE:
            # Busca mensagem mais recente salva pelo bot
            mensagem_log = db.query(MensagemLog).filter(
                MensagemLog.empresa_id == empresa.id,
                MensagemLog.whatsapp_number == from_number
            ).order_by(MensagemLog.timestamp.desc()).first()

            if mensagem_log:
                await ws_manager.broadcast_to_empresa(empresa.id, {
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
                })
                print(f"🔔 Broadcast enviado via WebSocket para empresa {empresa.id}")

    except Exception as e:
        print(f"❌ Erro processando mensagem: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()


async def process_message_status(status: Dict[str, Any], empresa: Empresa, db: Session):
    """Processa status de mensagem enviada."""
    try:
        message_id = status.get("id")
        status_type = status.get("status")  # sent, delivered, read, failed

        print(f"📊 Status da mensagem {message_id}: {status_type}")

        # Atualizar status da mensagem no log
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
