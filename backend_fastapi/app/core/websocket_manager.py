"""
Gerenciador de Conexões WebSocket
Gerencia salas por empresa e por usuário (atendente/empresa)
"""

from typing import Dict, List, Set
from fastapi import WebSocket
import json
import asyncio
from datetime import datetime


class ConnectionManager:
    """
    Gerencia conexões WebSocket organizadas por empresa e usuário

    Estrutura:
    - connections_by_empresa: {empresa_id: {user_id: WebSocket}}
    - connections_by_user: {user_id: WebSocket}
    """

    def __init__(self):
        # Conexões organizadas por empresa
        self.connections_by_empresa: Dict[int, Dict[str, WebSocket]] = {}

        # Conexões organizadas por usuário (para acesso rápido)
        self.connections_by_user: Dict[str, WebSocket] = {}

        # Metadados das conexões (empresa_id, role, etc)
        self.connection_metadata: Dict[str, dict] = {}

    async def connect(
        self,
        websocket: WebSocket,
        empresa_id: int,
        user_id: str,
        role: str
    ):
        """
        Conecta um novo cliente WebSocket

        Args:
            websocket: Conexão WebSocket
            empresa_id: ID da empresa
            user_id: ID do usuário (atendente_id ou "empresa")
            role: Role do usuário ("atendente" ou "empresa")
        """
        await websocket.accept()

        # Adicionar à estrutura de empresa
        if empresa_id not in self.connections_by_empresa:
            self.connections_by_empresa[empresa_id] = {}

        self.connections_by_empresa[empresa_id][user_id] = websocket

        # Adicionar ao índice por usuário
        connection_key = f"{empresa_id}_{user_id}"
        self.connections_by_user[connection_key] = websocket

        # Salvar metadados
        self.connection_metadata[connection_key] = {
            "empresa_id": empresa_id,
            "user_id": user_id,
            "role": role,
            "connected_at": datetime.now().isoformat()
        }

        print(f"✅ WebSocket conectado: empresa={empresa_id}, user={user_id}, role={role}")

    def disconnect(self, empresa_id: int, user_id: str):
        """
        Desconecta um cliente WebSocket

        Args:
            empresa_id: ID da empresa
            user_id: ID do usuário
        """
        connection_key = f"{empresa_id}_{user_id}"

        # Remover da estrutura de empresa
        if empresa_id in self.connections_by_empresa:
            if user_id in self.connections_by_empresa[empresa_id]:
                del self.connections_by_empresa[empresa_id][user_id]

            # Limpar empresa se não houver mais conexões
            if not self.connections_by_empresa[empresa_id]:
                del self.connections_by_empresa[empresa_id]

        # Remover do índice por usuário
        if connection_key in self.connections_by_user:
            del self.connections_by_user[connection_key]

        # Remover metadados
        if connection_key in self.connection_metadata:
            del self.connection_metadata[connection_key]

        print(f"❌ WebSocket desconectado: empresa={empresa_id}, user={user_id}")

    async def send_personal_message(
        self,
        message: dict,
        empresa_id: int,
        user_id: str
    ):
        """
        Envia mensagem para um usuário específico

        Args:
            message: Mensagem a ser enviada (dict)
            empresa_id: ID da empresa
            user_id: ID do usuário
        """
        connection_key = f"{empresa_id}_{user_id}"

        if connection_key in self.connections_by_user:
            websocket = self.connections_by_user[connection_key]
            try:
                await websocket.send_json(message)
            except Exception as e:
                print(f"❌ Erro ao enviar mensagem pessoal: {e}")
                self.disconnect(empresa_id, user_id)

    async def broadcast_to_empresa(
        self,
        message: dict,
        empresa_id: int,
        exclude_user: str = None
    ):
        """
        Envia mensagem para todos os usuários de uma empresa

        Args:
            message: Mensagem a ser enviada (dict)
            empresa_id: ID da empresa
            exclude_user: ID do usuário a ser excluído (opcional)
        """
        if empresa_id not in self.connections_by_empresa:
            return

        disconnected_users = []

        for user_id, websocket in self.connections_by_empresa[empresa_id].items():
            if exclude_user and user_id == exclude_user:
                continue

            try:
                await websocket.send_json(message)
            except Exception as e:
                print(f"❌ Erro ao enviar broadcast: {e}")
                disconnected_users.append(user_id)

        # Limpar conexões mortas
        for user_id in disconnected_users:
            self.disconnect(empresa_id, user_id)

    async def broadcast_to_role(
        self,
        message: dict,
        empresa_id: int,
        role: str
    ):
        """
        Envia mensagem para todos os usuários de uma role específica

        Args:
            message: Mensagem a ser enviada (dict)
            empresa_id: ID da empresa
            role: Role dos usuários ("atendente" ou "empresa")
        """
        if empresa_id not in self.connections_by_empresa:
            return

        disconnected_users = []

        for user_id, websocket in self.connections_by_empresa[empresa_id].items():
            connection_key = f"{empresa_id}_{user_id}"
            metadata = self.connection_metadata.get(connection_key, {})

            if metadata.get("role") == role:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    print(f"❌ Erro ao enviar broadcast por role: {e}")
                    disconnected_users.append(user_id)

        # Limpar conexões mortas
        for user_id in disconnected_users:
            self.disconnect(empresa_id, user_id)

    def get_connected_users(self, empresa_id: int) -> List[dict]:
        """
        Retorna lista de usuários conectados de uma empresa

        Args:
            empresa_id: ID da empresa

        Returns:
            Lista de dicionários com dados dos usuários conectados
        """
        if empresa_id not in self.connections_by_empresa:
            return []

        connected = []
        for user_id in self.connections_by_empresa[empresa_id].keys():
            connection_key = f"{empresa_id}_{user_id}"
            metadata = self.connection_metadata.get(connection_key, {})
            connected.append({
                "user_id": user_id,
                "role": metadata.get("role"),
                "connected_at": metadata.get("connected_at")
            })

        return connected

    def is_user_online(self, empresa_id: int, user_id: str) -> bool:
        """
        Verifica se um usuário está online

        Args:
            empresa_id: ID da empresa
            user_id: ID do usuário

        Returns:
            True se o usuário está online, False caso contrário
        """
        connection_key = f"{empresa_id}_{user_id}"
        return connection_key in self.connections_by_user


# Instância global do gerenciador
manager = ConnectionManager()
