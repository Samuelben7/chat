from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.database.database import engine, Base
import os
import mimetypes
from pathlib import Path
import asyncio

# Registrar MIME types que o Python pode não ter por padrão
# Necessário para servir arquivos com Content-Type correto (ex: para Meta API)
mimetypes.add_type("image/jpeg", ".jpg")
mimetypes.add_type("image/jpeg", ".jpeg")
mimetypes.add_type("image/png", ".png")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/gif", ".gif")
mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("audio/ogg", ".ogg")
mimetypes.add_type("audio/mpeg", ".mp3")

# Import routers
from app.api import webhook, mensagens, chat, atendentes, websocket, empresas, auth, empresa, atendente, websocket_endpoint, webhooks_evolution, bot_builder, templates, contatos, pagamentos, media, agenda, crm, perfil_whatsapp, modelos_mensagem, clientes
from app.api import dev_auth, dev_api_keys, dev_gateway, dev_usage, dev_webhook, dev_numeros, dev_embedded_signup
from app.api import processos
from app.api import planos, admin_planos, assinaturas, pagamentos_plataforma, admin_panel

# Import Redis Pub/Sub e WebSocket Manager
from app.core.redis_pubsub import pubsub_manager
from app.core.websocket_manager import manager as ws_manager

# Import Metrics
from app.core.metrics import get_metrics
from fastapi import Response

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://yoursystem.dev.br",
        "https://www.yoursystem.dev.br",
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Criar diretório de uploads se não existir
uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)
(uploads_dir / "avatars").mkdir(exist_ok=True)
(uploads_dir / "bot-builder").mkdir(exist_ok=True)
(uploads_dir / "templates").mkdir(exist_ok=True)

# Servir arquivos estáticos (fotos)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.on_event("startup")
async def startup_event():
    """Evento de inicialização da aplicação."""
    print(f"🚀 {settings.PROJECT_NAME} iniciado!")
    print(f"📊 Database: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'configured'}")
    print(f"🔴 Redis: {settings.REDIS_URL}")
    print(f"🔌 WebSocket: ws://localhost:8000{settings.API_V1_STR}/ws/{{atendente_id}}")

    # Conectar Redis Pub/Sub
    await pubsub_manager.connect()

    # Criar handler de broadcasts
    async def handle_broadcast(message: dict):
        """Handler que recebe mensagens do Redis Pub/Sub e envia via WebSocket"""
        try:
            empresa_id = message.pop("empresa_id", None)
            if not empresa_id:
                print("⚠️ Mensagem Pub/Sub sem empresa_id")
                return

            await ws_manager.broadcast_to_empresa(empresa_id, message)
            print(f"✅ Broadcast via Pub/Sub para empresa {empresa_id}")

        except Exception as e:
            print(f"❌ Erro no handler de broadcast: {e}")

    # Iniciar listener em background
    asyncio.create_task(pubsub_manager.listen(handle_broadcast))
    print("📡 Redis Pub/Sub listener ativo - canal: ws:broadcast:emp:*")


@app.on_event("shutdown")
async def shutdown_event():
    """Evento de encerramento da aplicação."""
    print("👋 Encerrando aplicação...")

    # Desconectar Redis Pub/Sub
    await pubsub_manager.disconnect()

    print("✅ Aplicação encerrada")


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


@app.get("/metrics")
async def metrics():
    """
    Endpoint Prometheus metrics

    Expõe métricas em formato Prometheus para scraping.
    Métricas incluem:
    - Conexões WebSocket ativas
    - Latências (Pub/Sub, broadcasts, WhatsApp API)
    - Taxa de sucesso de envios
    - Cache hit rate
    - Estado do circuit breaker
    """
    return Response(content=get_metrics(), media_type="text/plain")


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
app.include_router(templates.router, prefix=settings.API_V1_STR, tags=["templates"])
app.include_router(contatos.router, prefix=settings.API_V1_STR, tags=["contatos"])
app.include_router(pagamentos.router, prefix=settings.API_V1_STR, tags=["pagamentos"])
app.include_router(media.router, prefix=settings.API_V1_STR, tags=["media"])
app.include_router(agenda.router, prefix=settings.API_V1_STR, tags=["agenda"])
app.include_router(crm.router, prefix=settings.API_V1_STR, tags=["crm"])
app.include_router(clientes.router, prefix=settings.API_V1_STR, tags=["clientes"])
app.include_router(perfil_whatsapp.router, prefix=settings.API_V1_STR, tags=["perfil-whatsapp"])
app.include_router(modelos_mensagem.router, prefix=settings.API_V1_STR, tags=["modelos-mensagem"])
app.include_router(processos.router, prefix=settings.API_V1_STR, tags=["processos-juridicos"])

# Dev API Gateway
app.include_router(dev_auth.router, prefix=settings.API_V1_STR, tags=["dev-auth"])
app.include_router(dev_api_keys.router, prefix=settings.API_V1_STR, tags=["dev-api-keys"])
app.include_router(dev_gateway.router, prefix=settings.API_V1_STR, tags=["dev-gateway"])
app.include_router(dev_numeros.router, prefix=settings.API_V1_STR, tags=["dev-numeros"])
app.include_router(dev_embedded_signup.router, prefix=settings.API_V1_STR, tags=["embedded-signup"])
app.include_router(dev_usage.router, prefix=settings.API_V1_STR, tags=["dev-usage"])
app.include_router(dev_webhook.router, prefix=settings.API_V1_STR, tags=["dev-webhook"])

# Planos, Assinaturas e Pagamentos da Plataforma
app.include_router(planos.router, prefix=settings.API_V1_STR, tags=["planos"])
app.include_router(admin_planos.router, prefix=settings.API_V1_STR, tags=["admin-planos"])
app.include_router(assinaturas.router, prefix=settings.API_V1_STR, tags=["assinaturas"])
app.include_router(pagamentos_plataforma.router, prefix=settings.API_V1_STR, tags=["pagamentos-plataforma"])
app.include_router(admin_panel.router, prefix=settings.API_V1_STR, tags=["admin-panel"])
