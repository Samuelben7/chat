#!/bin/bash

# Script para iniciar o frontend React

echo "🚀 Iniciando Frontend React..."
echo ""

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
    echo ""
fi

# Limpar cache do React
echo "🧹 Limpando cache..."
rm -rf node_modules/.cache
echo ""

# Verificar se backend está rodando
echo "🔍 Verificando backend..."
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Backend está rodando"
else
    echo "⚠️  Backend não está rodando!"
    echo "   Execute: cd ../backend_fastapi && ./run.sh"
    echo ""
fi

echo "🌐 Iniciando servidor em http://localhost:3000"
echo "🎨 Tailwind CSS v3 carregando..."
echo "Pressione CTRL+C para parar"
echo ""

npm start
