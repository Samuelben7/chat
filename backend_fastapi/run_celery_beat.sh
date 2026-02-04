#!/bin/bash

# Script para iniciar Celery Beat (tarefas periódicas)

echo "🚀 Iniciando Celery Beat..."
echo ""

# Ativar ambiente virtual
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "❌ Virtual environment não encontrado!"
    exit 1
fi

echo "📅 Celery Beat iniciando (tarefas periódicas)..."
echo "Pressione CTRL+C para parar"
echo ""

# Iniciar Celery Beat
celery -A app.tasks.celery_app beat --loglevel=info
