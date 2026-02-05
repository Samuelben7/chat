"""
Endpoint WebSocket para comunicação em tempo real
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy.orm import Session
from app.core.websocket_manager import manager
from app.core.auth import decodificar_token
from app.database.database import get_db
from app.models.models import Atendente
import json
from datetime import datetime

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    """
    Endpoint WebSocket para comunicação em tempo real

    Query Parameters:
        token: JWT token de autenticação

    Eventos recebidos do cliente:
        - ping: Heartbeat
        - typing: Usuário está digitando
        - read_messages: Marcar mensagens como lidas

    Eventos enviados para o cliente:
        - connected: Confirmação de conexão
        - nova_mensagem: Nova mensagem recebida
        - conversa_assumida: Conversa foi assumida
        - conversa_transferida: Conversa foi transferida
        - atendente_online: Atendente ficou online
        - atendente_offline: Atendente ficou offline
        - metricas_atualizadas: Métricas foram atualizadas
    """

    try:
        # Decodificar e validar token
        payload = decodificar_token(token)
        empresa_id = payload.get("empresa_id")
        role = payload.get("role")
        user_id = str(payload.get("atendente_id", "empresa"))

        if not empresa_id or not role:
            await websocket.close(code=4001, reason="Token inválido")
            return

        # Conectar o cliente
        await manager.connect(websocket, empresa_id, user_id, role)

        # Atualizar status para online se for atendente
        if role == "atendente":
            atendente_id = payload.get("atendente_id")
            atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()
            if atendente:
                atendente.status = 'online'
                db.commit()

                # Notificar OUTROS usuários da empresa (exceto ele mesmo)
                await manager.broadcast_to_empresa(
                    empresa_id,
                    {
                        "event": "atendente_online",
                        "data": {
                            "atendente_id": atendente_id,
                            "nome": atendente.nome_exibicao,
                            "timestamp": datetime.now().isoformat()
                        }
                    },
                    exclude_user=user_id  # Não enviar para ele mesmo!
                )

        # Enviar confirmação de conexão
        await websocket.send_json({
            "event": "connected",
            "data": {
                "message": "Conectado ao WebSocket",
                "empresa_id": empresa_id,
                "user_id": user_id,
                "role": role,
                "connected_users": manager.get_connected_users(empresa_id)
            }
        })

        # Loop de recebimento de mensagens
        while True:
            try:
                data = await websocket.receive_text()
                message = json.loads(data)

                event_type = message.get("event")

                # Heartbeat/Ping
                if event_type == "ping":
                    await websocket.send_json({
                        "event": "pong",
                        "data": {"timestamp": datetime.now().isoformat()}
                    })

                # Usuário está digitando
                elif event_type == "typing":
                    whatsapp = message.get("data", {}).get("whatsapp") or message.get("whatsapp")
                    user_nome = message.get("data", {}).get("user_nome") or "Atendente"

                    # Broadcast para outros atendentes/empresa (exceto quem está digitando)
                    await manager.broadcast_to_empresa(
                        {
                            "event": "user_typing",
                            "data": {
                                "whatsapp": whatsapp,
                                "user_id": user_id,
                                "user_nome": user_nome,
                                "role": role
                            }
                        },
                        empresa_id,
                        exclude_user=user_id
                    )

                # Marcar mensagens como lidas
                elif event_type == "read_messages":
                    whatsapp = message.get("whatsapp")
                    # Aqui você pode atualizar o banco de dados
                    # e notificar outros usuários
                    pass

                # Evento desconhecido
                else:
                    await websocket.send_json({
                        "event": "error",
                        "data": {"message": f"Evento desconhecido: {event_type}"}
                    })

            except json.JSONDecodeError:
                await websocket.send_json({
                    "event": "error",
                    "data": {"message": "Mensagem inválida (JSON malformado)"}
                })

    except WebSocketDisconnect:
        print(f"WebSocket desconectado: empresa={empresa_id}, user={user_id}")

        # Atualizar status para offline se for atendente
        if role == "atendente":
            atendente_id = payload.get("atendente_id")
            atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()
            if atendente:
                atendente.status = 'offline'
                db.commit()

                # Notificar OUTROS usuários da empresa (exceto ele mesmo que já desconectou)
                await manager.broadcast_to_empresa(
                    {
                        "event": "atendente_offline",
                        "data": {
                            "atendente_id": atendente_id,
                            "nome": atendente.nome_exibicao,
                            "timestamp": datetime.now().isoformat()
                        }
                    },
                    empresa_id,
                    exclude_user=user_id  # Não precisa notificar quem já desconectou
                )

        manager.disconnect(empresa_id, user_id)

    except Exception as e:
        print(f"Erro no WebSocket: {e}")
        if empresa_id and user_id:
            manager.disconnect(empresa_id, user_id)


async def notify_nova_mensagem(
    empresa_id: int,
    whatsapp: str,
    mensagem: str,
    tipo: str,
    timestamp: str
):
    """
    Notifica todos os usuários da empresa sobre uma nova mensagem

    Args:
        empresa_id: ID da empresa
        whatsapp: Número do WhatsApp
        mensagem: Conteúdo da mensagem
        tipo: Tipo da mensagem (recebida/enviada)
        timestamp: Timestamp da mensagem
    """
    await manager.broadcast_to_empresa(
        {
            "event": "nova_mensagem",
            "data": {
                "whatsapp": whatsapp,
                "mensagem": mensagem,
                "tipo": tipo,
                "timestamp": timestamp
            }
        },
        empresa_id
    )


async def notify_conversa_assumida(
    empresa_id: int,
    whatsapp: str,
    atendente_id: int,
    atendente_nome: str
):
    """
    Notifica sobre conversa assumida

    Args:
        empresa_id: ID da empresa
        whatsapp: Número do WhatsApp
        atendente_id: ID do atendente que assumiu
        atendente_nome: Nome do atendente
    """
    await manager.broadcast_to_empresa(
        {
            "event": "conversa_assumida",
            "data": {
                "whatsapp": whatsapp,
                "atendente_id": atendente_id,
                "atendente_nome": atendente_nome,
                "timestamp": datetime.now().isoformat()
            }
        },
        empresa_id
    )


async def notify_conversa_transferida(
    empresa_id: int,
    whatsapp: str,
    de_atendente_id: int,
    para_atendente_id: int,
    para_atendente_nome: str
):
    """
    Notifica sobre conversa transferida

    Args:
        empresa_id: ID da empresa
        whatsapp: Número do WhatsApp
        de_atendente_id: ID do atendente que transferiu
        para_atendente_id: ID do atendente que recebeu
        para_atendente_nome: Nome do atendente que recebeu
    """
    await manager.broadcast_to_empresa(
        {
            "event": "conversa_transferida",
            "data": {
                "whatsapp": whatsapp,
                "de_atendente_id": de_atendente_id,
                "para_atendente_id": para_atendente_id,
                "para_atendente_nome": para_atendente_nome,
                "timestamp": datetime.now().isoformat()
            }
        },
        empresa_id
    )


@router.get("/ws/test")
async def test_websocket_notification(empresa_id: int = 1):
    """
    Endpoint de teste para disparar notificação WebSocket
    Útil para testar se as notificações em tempo real estão funcionando
    """
    usuarios_conectados = manager.get_connected_users(empresa_id)

    # Enviar notificação de teste
    await manager.broadcast_to_empresa(
        {
            "event": "nova_mensagem",
            "data": {
                "whatsapp": "+5511999999999",
                "mensagem": "🧪 Mensagem de teste WebSocket",
                "tipo": "recebida",
                "timestamp": datetime.now().isoformat()
            }
        },
        empresa_id
    )

    return {
        "sucesso": True,
        "empresa_id": empresa_id,
        "usuarios_conectados": len(usuarios_conectados),
        "detalhes": usuarios_conectados,
        "mensagem": "Notificação de teste enviada para todos os usuários conectados"
    }
