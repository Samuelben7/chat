#!/bin/bash

# Script para iniciar Celery Worker

echo "🚀 Iniciando Celery Worker..."
echo ""

# Ativar ambiente virtual
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "❌ Virtual environment não encontrado!"
    echo "Execute: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Verificar se Redis está rodando
echo "🔍 Verificando Redis..."
if docker ps | grep -q whatsapp_redis; then
    echo "✅ Redis está rodando"
else
    echo "⚠️  Redis não está rodando. Iniciando..."
    docker start whatsapp_redis || docker run --name whatsapp_redis -p 6380:6379 -d redis:7-alpine
fi

echo ""
echo "👷 Celery Worker iniciando..."
echo "Pressione CTRL+C para parar"
echo ""

# Iniciar Celery Worker
celery -A app.tasks.celery_app worker --loglevel=info --concurrency=4
