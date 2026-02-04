from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from typing import Dict, Set
import json
from datetime import datetime

from app.database.database import get_db

router = APIRouter()

# Gerenciador de conexões WebSocket
class ConnectionManager:
    def __init__(self):
        # Armazena conexões ativas: {atendente_id: Set[WebSocket]}
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, atendente_id: int):
        """Aceita nova conexão WebSocket."""
        await websocket.accept()

        if atendente_id not in self.active_connections:
            self.active_connections[atendente_id] = set()

        self.active_connections[atendente_id].add(websocket)
        print(f"✅ WebSocket conectado: atendente {atendente_id}")

    def disconnect(self, websocket: WebSocket, atendente_id: int):
        """Remove conexão WebSocket."""
        if atendente_id in self.active_connections:
            self.active_connections[atendente_id].discard(websocket)

            # Remove o atendente se não tiver mais conexões
            if not self.active_connections[atendente_id]:
                del self.active_connections[atendente_id]

        print(f"❌ WebSocket desconectado: atendente {atendente_id}")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Envia mensagem para uma conexão específica."""
        try:
            await websocket.send_json(message)
        except Exception as e:
            print(f"Erro enviando mensagem: {e}")

    async def broadcast_to_atendente(self, message: dict, atendente_id: int):
        """Envia mensagem para todas as conexões de um atendente."""
        if atendente_id in self.active_connections:
            disconnected = []

            for connection in self.active_connections[atendente_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"Erro no broadcast: {e}")
                    disconnected.append(connection)

            # Remove conexões mortas
            for connection in disconnected:
                self.active_connections[atendente_id].discard(connection)

    async def broadcast_to_all(self, message: dict):
        """Envia mensagem para todos os atendentes conectados."""
        for atendente_id in list(self.active_connections.keys()):
            await self.broadcast_to_atendente(message, atendente_id)

    def get_connected_count(self) -> int:
        """Retorna número total de conexões ativas."""
        return sum(len(connections) for connections in self.active_connections.values())


# Instância global do gerenciador
manager = ConnectionManager()


@router.websocket("/ws/{atendente_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    atendente_id: int,
    db: Session = Depends(get_db)
):
    """
    WebSocket endpoint para atendentes.

    Eventos suportados:
    - nova_mensagem: Nova mensagem recebida
    - mensagem_enviada: Mensagem foi enviada com sucesso
    - atendimento_atualizado: Status de atendimento mudou
    - typing: Alguém está digitando
    """
    await manager.connect(websocket, atendente_id)

    try:
        # Envia mensagem de boas-vindas
        await manager.send_personal_message({
            "type": "connected",
            "message": f"Conectado como atendente {atendente_id}",
            "timestamp": datetime.now().isoformat(),
            "connected_count": manager.get_connected_count()
        }, websocket)

        # Loop principal - recebe mensagens do cliente
        while True:
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
                message_type = message.get("type")

                # Ping/Pong para manter conexão viva
                if message_type == "ping":
                    await manager.send_personal_message({
                        "type": "pong",
                        "timestamp": datetime.now().isoformat()
                    }, websocket)

                # Status de digitação
                elif message_type == "typing":
                    whatsapp_number = message.get("whatsapp_number")
                    # Broadcast para outros atendentes que alguém está digitando
                    await manager.broadcast_to_all({
                        "type": "typing",
                        "atendente_id": atendente_id,
                        "whatsapp_number": whatsapp_number,
                        "timestamp": datetime.now().isoformat()
                    })

                # Echo para debug
                else:
                    await manager.send_personal_message({
                        "type": "echo",
                        "received": message,
                        "timestamp": datetime.now().isoformat()
                    }, websocket)

            except json.JSONDecodeError:
                await manager.send_personal_message({
                    "type": "error",
                    "message": "JSON inválido",
                    "timestamp": datetime.now().isoformat()
                }, websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket, atendente_id)

    except Exception as e:
        print(f"Erro no WebSocket: {e}")
        manager.disconnect(websocket, atendente_id)


# Função auxiliar para broadcast de novas mensagens (chamada de outros endpoints)
async def broadcast_nova_mensagem(mensagem: dict):
    """
    Broadcast de nova mensagem para todos os atendentes conectados.
    Deve ser chamado quando uma nova mensagem chega via webhook.
    """
    await manager.broadcast_to_all({
        "type": "nova_mensagem",
        "mensagem": mensagem,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_atendimento_atualizado(atendimento: dict):
    """
    Broadcast de atualização de atendimento.
    Chamado quando status de atendimento muda.
    """
    await manager.broadcast_to_all({
        "type": "atendimento_atualizado",
        "atendimento": atendimento,
        "timestamp": datetime.now().isoformat()
    })


# Endpoint para testar WebSocket
@router.get("/ws/test")
async def test_websocket():
    """Endpoint para testar se WebSocket está funcionando."""
    return {
        "status": "ok",
        "websocket_url": "ws://localhost:8000/api/v1/ws/{atendente_id}",
        "connected_count": manager.get_connected_count(),
        "message": "WebSocket está funcionando. Use o URL acima para conectar."
    }
