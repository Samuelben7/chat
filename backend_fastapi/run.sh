#!/bin/bash

# Script para iniciar o backend FastAPI

echo "🚀 Iniciando Backend FastAPI..."
echo ""

# Ativar ambiente virtual
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "❌ Virtual environment não encontrado!"
    echo "Execute: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Verificar se PostgreSQL e Redis estão rodando
echo "🔍 Verificando serviços..."
if ! docker ps | grep -q whatsapp_postgres; then
    echo "⚠️  PostgreSQL não está rodando. Iniciando..."
    docker start whatsapp_postgres || docker run --name whatsapp_postgres -e POSTGRES_USER=whatsapp_user -e POSTGRES_PASSWORD=whatsapp_pass_2026 -e POSTGRES_DB=whatsapp_db -p 5434:5432 -d postgres:15-alpine
fi

if ! docker ps | grep -q whatsapp_redis; then
    echo "⚠️  Redis não está rodando. Iniciando..."
    docker start whatsapp_redis || docker run --name whatsapp_redis -p 6380:6379 -d redis:7-alpine
fi

echo "✅ Serviços verificados"
echo ""

# Aplicar migrations
echo "📊 Aplicando migrations..."
alembic upgrade head
echo ""

# Iniciar servidor
echo "🌐 Iniciando servidor em http://localhost:8000"
echo "📚 Documentação: http://localhost:8000/docs"
echo ""
echo "Pressione CTRL+C para parar"
echo ""

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
