#!/bin/bash

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                                                                              ║
# ║              COMANDOS DE VERIFICAÇÃO - Otimizações v2.0.0                    ║
# ║                                                                              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "                    VERIFICAÇÃO DAS OTIMIZAÇÕES v2.0.0"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# [1] Verificar serviços rodando
# ═══════════════════════════════════════════════════════════════════════════════

echo "📦 [1/8] Verificando serviços Docker..."
echo ""
docker-compose ps
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# [2] Verificar Redis versão
# ═══════════════════════════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔴 [2/8] Verificando Redis..."
echo ""
echo "Versão Redis (deve ser >= 5.0):"
docker exec -it whatsapp_redis redis-cli INFO server | grep redis_version
echo ""
echo "Teste de conexão:"
docker exec -it whatsapp_redis redis-cli PING
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# [3] Verificar dependência prometheus-client
# ═══════════════════════════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 [3/8] Verificando prometheus-client..."
echo ""
docker exec -it whatsapp_api pip list | grep prometheus
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# [4] Verificar logs Redis Pub/Sub
# ═══════════════════════════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📡 [4/8] Verificando inicialização Redis Pub/Sub..."
echo ""
docker-compose logs api | grep -E "Redis Pub/Sub|listener ativo" | tail -5
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# [5] Verificar métricas endpoint
# ═══════════════════════════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📈 [5/8] Verificando endpoint /metrics..."
echo ""
echo "Status HTTP (deve ser 200):"
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/metrics
echo ""
echo ""
echo "Primeiras métricas:"
curl -s http://localhost:8000/metrics | head -20
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# [6] Verificar chaves de deduplicação
# ═══════════════════════════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🛡️ [6/8] Verificando deduplicação (chaves Redis)..."
echo ""
echo "Quantidade de mensagens processadas:"
docker exec -it whatsapp_redis redis-cli KEYS "msg:processed:*" | wc -l
echo ""
echo "Últimas 5 chaves:"
docker exec -it whatsapp_redis redis-cli KEYS "msg:processed:*" | tail -5
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# [7] Verificar tags de cache
# ═══════════════════════════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚡ [7/8] Verificando cache com tags..."
echo ""
echo "Tags de cache ativas:"
docker exec -it whatsapp_redis redis-cli KEYS "tag:*"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# [8] Verificar circuit breaker state
# ═══════════════════════════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 [8/8] Verificando Circuit Breaker..."
echo ""
curl -s http://localhost:8000/metrics | grep circuit_breaker
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# RESUMO
# ═══════════════════════════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ VERIFICAÇÃO COMPLETA!"
echo ""
echo "Para monitorar em tempo real:"
echo "  • Logs API:     docker-compose logs -f api"
echo "  • Logs Celery:  docker-compose logs -f celery_worker"
echo "  • Redis Pub/Sub: docker exec -it whatsapp_redis redis-cli PSUBSCRIBE 'ws:broadcast:emp:*'"
echo "  • Métricas:     curl http://localhost:8000/metrics"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
