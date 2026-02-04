"""
Script de teste para notificações WebSocket
Simula o assumir de uma conversa e envia notificação em tempo real
"""
import asyncio
import sys
from datetime import datetime
from app.core.websocket_manager import manager
from app.api.websocket_endpoint import notify_conversa_assumida

async def test_notification():
    """Testa notificação de conversa assumida"""
    print("🧪 Testando notificação WebSocket...")
    print(f"📊 Conexões ativas por empresa: {dict(manager.connections_by_empresa)}")

    # Verificar quantos usuários estão conectados na empresa 1
    empresa_id = 1
    usuarios_conectados = manager.get_connected_users(empresa_id)
    print(f"👥 Usuários conectados na empresa {empresa_id}: {len(usuarios_conectados)}")
    for usuario in usuarios_conectados:
        print(f"   - {usuario}")

    if len(usuarios_conectados) > 0:
        # Enviar notificação de teste
        print("\n📤 Enviando notificação de conversa assumida...")
        await notify_conversa_assumida(
            empresa_id=empresa_id,
            whatsapp="+5511999999999",
            atendente_id=5,
            atendente_nome="Pedro Teste"
        )
        print("✅ Notificação enviada com sucesso!")
    else:
        print("⚠️ Nenhum usuário conectado. Conecte-se ao dashboard primeiro.")

if __name__ == "__main__":
    asyncio.run(test_notification())
