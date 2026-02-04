"""
Webhooks da Evolution API
Recebe eventos do WhatsApp em tempo real
"""
from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from datetime import datetime
import logging

from ..database.database import get_db
from ..models.models import MensagemLog, Atendimento
from ..core.websocket_manager import manager

router = APIRouter(prefix="/webhooks", tags=["Webhooks Evolution"])

logger = logging.getLogger(__name__)


@router.post("/evolution")
async def webhook_evolution(request: Request, db: Session = Depends(get_db)):
    """
    Webhook para receber eventos da Evolution API

    Eventos recebidos:
    - messages.upsert: Nova mensagem recebida
    - messages.update: Status de mensagem atualizada
    - connection.update: Conexão abriu/fechou
    - qrcode.updated: QR Code gerado/atualizado
    """
    try:
        body = await request.json()
        event = body.get("event")
        instance = body.get("instance")
        data = body.get("data", {})

        logger.info(f"📨 Webhook Evolution recebido: {event} | Instância: {instance}")

        # Processar evento baseado no tipo
        if event == "messages.upsert":
            await handle_new_message(data, instance, db)

        elif event == "messages.update":
            await handle_message_update(data, instance, db)

        elif event == "connection.update":
            await handle_connection_update(data, instance, db)

        elif event == "qrcode.updated":
            await handle_qrcode_updated(data, instance, db)

        else:
            logger.info(f"Evento não tratado: {event}")

        return {"status": "success", "event": event}

    except Exception as e:
        logger.error(f"Erro no webhook Evolution: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


async def handle_new_message(data: dict, instance: str, db: Session):
    """Processar nova mensagem recebida"""
    try:
        # Extrair informações da mensagem
        key = data.get("key", {})
        message = data.get("message", {})
        message_timestamp = data.get("messageTimestamp")
        push_name = data.get("pushName", "")

        # Número do remetente
        remote_jid = key.get("remoteJid", "")
        whatsapp_number = remote_jid.replace("@s.whatsapp.net", "")

        # Verificar se é mensagem enviada por mim
        from_me = key.get("fromMe", False)
        if from_me:
            logger.info(f"Mensagem enviada por mim, ignorando: {whatsapp_number}")
            return

        # ID da mensagem
        message_id = key.get("id")

        # Extrair conteúdo da mensagem
        conteudo = None
        tipo_mensagem = "text"
        dados_extras = {}

        if "conversation" in message:
            conteudo = message["conversation"]
            tipo_mensagem = "text"

        elif "extendedTextMessage" in message:
            conteudo = message["extendedTextMessage"].get("text")
            tipo_mensagem = "text"

        elif "imageMessage" in message:
            conteudo = message["imageMessage"].get("caption", "[Imagem]")
            tipo_mensagem = "image"
            dados_extras = {
                "mimetype": message["imageMessage"].get("mimetype"),
                "url": message["imageMessage"].get("url"),
            }

        elif "documentMessage" in message:
            conteudo = f"[Documento] {message['documentMessage'].get('fileName', 'arquivo')}"
            tipo_mensagem = "document"
            dados_extras = {
                "mimetype": message["documentMessage"].get("mimetype"),
                "fileName": message["documentMessage"].get("fileName"),
            }

        elif "audioMessage" in message:
            conteudo = "[Áudio]"
            tipo_mensagem = "audio"

        elif "videoMessage" in message:
            conteudo = message["videoMessage"].get("caption", "[Vídeo]")
            tipo_mensagem = "video"

        else:
            conteudo = "[Mensagem não suportada]"
            tipo_mensagem = "unknown"
            logger.warning(f"Tipo de mensagem não suportado: {message.keys()}")

        if not conteudo:
            logger.warning(f"Conteúdo vazio na mensagem: {message}")
            return

        logger.info(f"💬 Nova mensagem de {whatsapp_number}: {conteudo[:50]}...")

        # Buscar ou criar cliente
        cliente = db.query(Cliente).filter(Cliente.whatsapp_number == whatsapp_number).first()
        if not cliente:
            # Criar cliente automaticamente
            cliente = Cliente(
                empresa_id=1,  # TODO: identificar empresa pela instância
                nome_completo=push_name or whatsapp_number,
                whatsapp_number=whatsapp_number,
                cpf="",  # Será preenchido depois
                endereco_residencial="",
                cidade="",
            )
            db.add(cliente)
            db.commit()
            db.refresh(cliente)
            logger.info(f"✅ Cliente criado: {whatsapp_number}")

        # Buscar ou criar atendimento
        atendimento = db.query(Atendimento).filter(
            Atendimento.whatsapp_number == whatsapp_number,
            Atendimento.status.in_(["bot", "aguardando", "em_atendimento"])
        ).first()

        if not atendimento:
            # Criar novo atendimento (status: aguardando)
            atendimento = Atendimento(
                empresa_id=1,  # TODO: identificar empresa pela instância
                whatsapp_number=whatsapp_number,
                status="aguardando",
                iniciado_em=datetime.now(),
                ultima_mensagem_em=datetime.now(),
            )
            db.add(atendimento)
            db.commit()
            db.refresh(atendimento)
            logger.info(f"✅ Atendimento criado: {whatsapp_number}")
        else:
            # Atualizar última mensagem
            atendimento.ultima_mensagem_em = datetime.now()
            db.commit()

        # Salvar mensagem no banco
        mensagem_log = MensagemLog(
            empresa_id=1,  # TODO: identificar empresa pela instância
            whatsapp_number=whatsapp_number,
            message_id=message_id,
            direcao="recebida",
            tipo_mensagem=tipo_mensagem,
            conteudo=conteudo,
            dados_extras=dados_extras,
            timestamp=datetime.fromtimestamp(message_timestamp) if message_timestamp else datetime.now(),
            lida=False,
        )
        db.add(mensagem_log)
        db.commit()
        db.refresh(mensagem_log)

        logger.info(f"✅ Mensagem salva no banco: ID {mensagem_log.id}")

        # Enviar via WebSocket para os atendentes em tempo real
        await manager.broadcast_to_empresa(
            {
                "event": "nova_mensagem",
                "data": {
                    "whatsapp": whatsapp_number,
                    "mensagem": conteudo,
                    "tipo": "recebida",
                    "timestamp": mensagem_log.timestamp.isoformat(),
                    "cliente_nome": cliente.nome_completo,
                }
            },
            empresa_id=1  # TODO: identificar empresa pela instância
        )

        logger.info(f"✅ WebSocket broadcast enviado para empresa")

    except Exception as e:
        logger.error(f"Erro ao processar nova mensagem: {e}", exc_info=True)
        db.rollback()


async def handle_message_update(data: dict, instance: str, db: Session):
    """Processar atualização de status de mensagem (lida, entregue)"""
    try:
        key = data.get("key", {})
        message_id = key.get("id")
        status = data.get("status")  # Pode ser: ERROR, PENDING, SERVER_ACK, DELIVERY_ACK, READ

        logger.info(f"📬 Atualização de mensagem {message_id}: {status}")

        # Atualizar no banco
        mensagem = db.query(MensagemLog).filter(MensagemLog.message_id == message_id).first()
        if mensagem:
            if status == "READ":
                mensagem.lida = True
                db.commit()
                logger.info(f"✅ Mensagem marcada como lida: {message_id}")

                # Broadcast via WebSocket
                await manager.broadcast_to_empresa(
                    {
                        "event": "mensagem_lida",
                        "data": {
                            "message_id": message_id,
                            "whatsapp": mensagem.whatsapp_number,
                        }
                    },
                    empresa_id=1
                )

    except Exception as e:
        logger.error(f"Erro ao processar atualização de mensagem: {e}", exc_info=True)


async def handle_connection_update(data: dict, instance: str, db: Session):
    """Processar atualização de conexão (abriu/fechou)"""
    try:
        state = data.get("state")  # open, close, connecting
        logger.info(f"🔌 Conexão da instância {instance}: {state}")

        # TODO: Atualizar status da instância no banco
        # Você pode criar uma tabela InstanciaWhatsApp para guardar status

    except Exception as e:
        logger.error(f"Erro ao processar conexão: {e}", exc_info=True)


async def handle_qrcode_updated(data: dict, instance: str, db: Session):
    """Processar atualização de QR Code"""
    try:
        qrcode = data.get("qrcode")
        logger.info(f"📱 QR Code atualizado para instância {instance}")

        # TODO: Salvar QR Code no banco ou cache para exibir no frontend
        # Pode usar Redis para armazenar temporariamente

    except Exception as e:
        logger.error(f"Erro ao processar QR Code: {e}", exc_info=True)
