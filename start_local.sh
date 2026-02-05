#!/bin/bash

# Script para iniciar todos os serviços localmente
# Uso: ./start_local.sh

echo "🚀 Iniciando WhatsApp Sistema - Modo Local"
echo "=========================================="
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se Redis está rodando
echo "🔍 Verificando serviços..."
if ! redis-cli ping &> /dev/null; then
    echo -e "${RED}❌ Redis não está rodando!${NC}"
    echo "   Inicie com: redis-server"
    echo ""
fi

# Verificar se PostgreSQL está rodando
if ! pg_isready &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL não está rodando!${NC}"
    echo "   Inicie com: sudo systemctl start postgresql"
    echo ""
fi

# Verificar arquivo .env do backend
if [ ! -f "backend_fastapi/.env" ]; then
    echo -e "${YELLOW}⚠️  Arquivo .env do backend não encontrado!${NC}"
    echo "   Copie de: cp backend_fastapi/.env.example backend_fastapi/.env"
    echo "   E configure as variáveis necessárias"
    echo ""
fi

# Verificar arquivo .env do frontend
if [ ! -f "frontend_react/.env" ]; then
    echo -e "${YELLOW}⚠️  Arquivo .env do frontend não encontrado!${NC}"
    echo "   Copie de: cp frontend_react/.env.example frontend_react/.env"
    echo ""
fi

echo ""
echo "📋 Para iniciar todos os serviços, abra 4 terminais:"
echo ""
echo -e "${GREEN}Terminal 1 - Redis:${NC}"
echo "   redis-server"
echo ""
echo -e "${GREEN}Terminal 2 - Celery Worker:${NC}"
echo "   cd backend_fastapi"
echo "   source venv/bin/activate"
echo "   celery -A app.tasks.celery_app worker --loglevel=info"
echo ""
echo -e "${GREEN}Terminal 3 - Backend FastAPI:${NC}"
echo "   cd backend_fastapi"
echo "   source venv/bin/activate"
echo "   uvicorn main:app --reload"
echo ""
echo -e "${GREEN}Terminal 4 - Frontend React:${NC}"
echo "   cd frontend_react"
echo "   npm start"
echo ""
echo "=========================================="
echo "🌐 Acesse: http://localhost:3000"
echo "📚 API Docs: http://localhost:8000/docs"
echo "=========================================="
