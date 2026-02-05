from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.database.database import engine, Base
import os
from pathlib import Path

# Import routers
from app.api import webhook, mensagens, chat, atendentes, websocket, empresas, auth, empresa, atendente, websocket_endpoint, webhooks_evolution, bot_builder

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Em produção, especificar domínios permitidos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Criar diretório de uploads se não existir
uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)
(uploads_dir / "avatars").mkdir(exist_ok=True)

# Servir arquivos estáticos (fotos)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


async def redis_websocket_bridge():
    """
    Ponte entre Redis Pub/Sub e WebSocket connections.
    Escuta mensagens publicadas pelo Celery no Redis e repassa para os WebSockets.
    """
    import redis.asyncio as aioredis
    import json
    from app.core.websocket_manager import manager as ws_manager

    try:
        redis_client = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        pubsub = redis_client.pubsub()
        await pubsub.subscribe('websocket_broadcast')

        print("📡 Redis WebSocket bridge ativo - escutando broadcasts...")

        async for message in pubsub.listen():
            if message['type'] == 'message':
                try:
                    data = json.loads(message['data'])
                    empresa_id = data.pop('empresa_id')

                    await ws_manager.broadcast_to_empresa(empresa_id, data)
                    print(f"✅ Broadcast repassado para empresa {empresa_id}")
                except Exception as e:
                    print(f"❌ Erro ao processar broadcast: {e}")

    except Exception as e:
        print(f"❌ Erro no Redis WebSocket bridge: {e}")
        import traceback
        traceback.print_exc()


@app.on_event("startup")
async def startup_event():
    """Evento de inicialização da aplicação."""
    print(f"🚀 {settings.PROJECT_NAME} iniciado!")
    print(f"📊 Database: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'configured'}")
    print(f"🔴 Redis: {settings.REDIS_URL}")
    print(f"🔌 WebSocket: ws://localhost:8000{settings.API_V1_STR}/ws/{{atendente_id}}")

    # Iniciar listener Redis para broadcasts WebSocket
    import asyncio
    asyncio.create_task(redis_websocket_bridge())


@app.on_event("shutdown")
async def shutdown_event():
    """Evento de encerramento da aplicação."""
    print("👋 Aplicação encerrada")


@app.get("/")
async def root():
    """Endpoint raiz para verificação de saúde."""
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "version": "1.0.0",
        "api": settings.API_V1_STR
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/test-websocket")
async def test_websocket():
    """Serve WebSocket test page."""
    file_path = os.path.join(os.path.dirname(__file__), "test_websocket.html")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return {"error": "Test page not found"}


# Include API routers
app.include_router(auth.router, prefix=settings.API_V1_STR, tags=["auth"])
app.include_router(empresa.router, prefix=settings.API_V1_STR, tags=["empresa"])
app.include_router(atendente.router, prefix=settings.API_V1_STR, tags=["atendente"])
app.include_router(websocket_endpoint.router, prefix=settings.API_V1_STR, tags=["websocket-realtime"])
app.include_router(webhook.router, prefix=settings.API_V1_STR, tags=["webhook"])
app.include_router(webhooks_evolution.router, tags=["webhooks-evolution"])  # Evolution API Webhooks
app.include_router(mensagens.router, prefix=settings.API_V1_STR, tags=["mensagens"])
app.include_router(chat.router, prefix=settings.API_V1_STR, tags=["chat"])
app.include_router(atendentes.router, prefix=settings.API_V1_STR, tags=["atendentes"])
app.include_router(websocket.router, prefix=settings.API_V1_STR, tags=["websocket"])
app.include_router(empresas.router, prefix=f"{settings.API_V1_STR}/empresas", tags=["empresas"])
app.include_router(bot_builder.router, prefix=settings.API_V1_STR, tags=["bot-builder"])
