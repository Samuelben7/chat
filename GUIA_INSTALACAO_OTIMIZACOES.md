# Guia de Instalação - Otimizações WebSocket

Este guia descreve como instalar e ativar as otimizações implementadas no sistema WhatsApp.

---

## 📋 Pré-requisitos

- Docker e Docker Compose instalados
- Sistema atual funcionando
- Acesso SSH/terminal ao servidor

---

## 🚀 Instalação Rápida

### 1. Atualizar Dependências Python

```bash
cd /home/samuel-benjamim/Chat/whatsapp_system/backend_fastapi

# Ativar ambiente virtual (se usar)
source venv/bin/activate

# Instalar nova dependência
pip install prometheus-client==0.19.0

# OU reinstalar todas dependências
pip install -r requirements.txt
```

### 2. Verificar Instalação Redis

As otimizações requerem Redis com suporte a Pub/Sub (já incluído no Redis 5.0+).

```bash
# Verificar versão do Redis (deve ser >= 5.0)
docker exec -it whatsapp_redis redis-cli INFO server | grep redis_version

# Saída esperada:
# redis_version:5.0.x ou superior
```

### 3. Restart dos Serviços

```bash
cd /home/samuel-benjamim/Chat/whatsapp_system

# Restart completo (recomendado)
docker-compose down
docker-compose up -d

# OU restart individual
docker-compose restart api
docker-compose restart celery_worker
```

### 4. Verificar Logs de Inicialização

```bash
# Logs da API (verificar Redis Pub/Sub)
docker-compose logs -f api | grep -E "Redis Pub/Sub|Broadcast"

# Deve aparecer:
# ✅ Redis Pub/Sub conectado - padrão: ws:broadcast:emp:*
# 📡 Redis Pub/Sub listener ativo - canal: ws:broadcast:emp:*
```

```bash
# Logs do Celery (verificar circuit breaker)
docker-compose logs -f celery_worker | grep -E "Circuit|WhatsApp"
```

---

## 🧪 Testes de Validação

### Teste 1: Redis Pub/Sub Funcionando ✅

```bash
# Terminal 1: Monitorar canal Redis
docker exec -it whatsapp_redis redis-cli PSUBSCRIBE "ws:broadcast:emp:*"

# Terminal 2: Enviar mensagem via API ou WhatsApp
# (Qualquer mensagem recebida deve aparecer no Terminal 1)
```

**Resultado esperado:**
```
1) "psubscribe"
2) "ws:broadcast:emp:*"
3) (integer) 1
1) "pmessage"
2) "ws:broadcast:emp:*"
3) "ws:broadcast:emp:123"
4) "{\"empresa_id\":123,\"event\":\"nova_mensagem\",\"data\":{...}}"
```

### Teste 2: Deduplicação Backend ✅

```bash
# Verificar chaves de deduplicação no Redis
docker exec -it whatsapp_redis redis-cli KEYS "msg:processed:*"

# Verificar TTL de uma chave
docker exec -it whatsapp_redis redis-cli TTL msg:processed:wamid.xxxxx

# Saída esperada: número entre 1 e 86400 (24 horas)
```

### Teste 3: Métricas Prometheus ✅

```bash
# Acessar endpoint de métricas
curl http://localhost:8000/metrics

# OU via navegador:
# http://seu-servidor:8000/metrics
```

**Métricas esperadas:**
```
# HELP websocket_connections_total Total de conexões WebSocket estabelecidas
# TYPE websocket_connections_total counter
websocket_connections_total{empresa_id="1"} 5.0

# HELP websocket_active_connections Número de conexões WebSocket ativas
# TYPE websocket_active_connections gauge
websocket_active_connections{empresa_id="1"} 3.0

# HELP pubsub_latency_seconds Latência de publicação/recebimento Redis Pub/Sub
# TYPE pubsub_latency_seconds histogram
pubsub_latency_seconds_bucket{le="0.001"} 45.0
pubsub_latency_seconds_bucket{le="0.005"} 50.0
...
```

### Teste 4: Circuit Breaker ✅

```bash
# Verificar estado do circuit breaker via métricas
curl http://localhost:8000/metrics | grep circuit_breaker

# Saída esperada (estado CLOSED):
# circuit_breaker_state{component="whatsapp_api"} 0.0
# circuit_breaker_failures{component="whatsapp_api"} 0.0

# Estados possíveis:
# 0.0 = CLOSED (funcionando)
# 1.0 = HALF_OPEN (testando)
# 2.0 = OPEN (bloqueado)
```

### Teste 5: Deduplicação Frontend ✅

Abrir DevTools do navegador (F12) → Console:

```javascript
// Enviar mesma mensagem 2x rapidamente
// Deve aparecer no console:
// ⚠️ Mensagem duplicada (ignorada): 123
```

---

## 📊 Monitoramento em Produção

### Configurar Prometheus (Opcional mas Recomendado)

1. **Adicionar ao `docker-compose.yml`:**

```yaml
prometheus:
  image: prom/prometheus:latest
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
  ports:
    - "9090:9090"
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
```

2. **Criar `prometheus.yml`:**

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'whatsapp_system'
    static_configs:
      - targets: ['api:8000']
```

3. **Restart:**

```bash
docker-compose up -d prometheus
```

4. **Acessar Prometheus:**
   - URL: `http://localhost:9090`
   - Query exemplo: `rate(whatsapp_sent_total[5m])`

### Configurar Grafana (Opcional)

```yaml
# Adicionar ao docker-compose.yml
grafana:
  image: grafana/grafana:latest
  ports:
    - "3001:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
  volumes:
    - grafana_data:/var/lib/grafana

volumes:
  grafana_data:
```

**Dashboards recomendados:**
- Latências (Pub/Sub, WhatsApp API)
- Conexões WebSocket ativas
- Taxa de sucesso de envios
- Estado do Circuit Breaker

---

## ⚠️ Troubleshooting

### Problema: "Redis Pub/Sub não conecta"

**Solução:**
```bash
# Verificar se Redis está rodando
docker-compose ps redis

# Verificar logs do Redis
docker-compose logs redis | tail -50

# Testar conexão manual
docker exec -it whatsapp_redis redis-cli PING
# Esperado: PONG

# Verificar configuração
grep REDIS_URL /home/samuel-benjamim/Chat/whatsapp_system/.env
```

### Problema: "Métricas retornam 404"

**Solução:**
```bash
# Verificar se prometheus-client foi instalado
docker exec -it whatsapp_api pip list | grep prometheus

# Reinstalar dependências
docker exec -it whatsapp_api pip install prometheus-client==0.19.0

# Restart API
docker-compose restart api
```

### Problema: "Mensagens duplicadas ainda aparecem"

**Verificações:**
```bash
# 1. Verificar se deduplicação backend está ativa
docker-compose logs celery_worker | grep "marcada como processada"

# 2. Verificar chaves no Redis
docker exec -it whatsapp_redis redis-cli KEYS "msg:processed:*" | wc -l
# Deve retornar número > 0

# 3. Verificar logs frontend (browser console)
# Deve aparecer: "⚠️ Mensagem duplicada (ignorada)"
```

### Problema: "Circuit breaker sempre OPEN"

**Solução:**
```bash
# Verificar se WhatsApp API está acessível
curl -I https://graph.facebook.com/v18.0/

# Verificar token WhatsApp
grep WHATSAPP_TOKEN /home/samuel-benjamim/Chat/whatsapp_system/.env

# Reset manual do circuit breaker (se necessário)
# Adicionar endpoint temporário em main.py:
@app.post("/admin/reset-circuit-breaker")
async def reset_cb():
    from app.core.circuit_breaker import whatsapp_circuit_breaker
    whatsapp_circuit_breaker.reset()
    return {"status": "reset"}
```

### Problema: "Latência não melhorou"

**Diagnóstico:**
```bash
# 1. Verificar se Pub/Sub está sendo usado
docker-compose logs celery_worker | grep "Broadcast publicado via Redis Pub/Sub"
# Se aparecer "HTTP POST" em vez de "Redis Pub/Sub", código antigo ainda ativo

# 2. Medir latência diretamente
curl http://localhost:8000/metrics | grep pubsub_latency_seconds_sum

# 3. Verificar latência Redis
docker exec -it whatsapp_redis redis-cli --latency
# Esperado: < 10ms
```

---

## 🔄 Rollback Completo

Se necessário voltar à versão anterior:

```bash
cd /home/samuel-benjamim/Chat/whatsapp_system

# 1. Fazer backup dos arquivos novos
cp backend_fastapi/app/core/redis_pubsub.py backup/
cp backend_fastapi/app/core/circuit_breaker.py backup/
cp backend_fastapi/app/core/metrics.py backup/

# 2. Reverter via Git (se estiver usando)
git checkout HEAD~1 backend_fastapi/main.py
git checkout HEAD~1 backend_fastapi/app/tasks/tasks.py
git checkout HEAD~1 backend_fastapi/app/core/redis_client.py
git checkout HEAD~1 frontend_react/src/hooks/useWebSocket.ts

# 3. Remover arquivos novos
rm backend_fastapi/app/core/redis_pubsub.py
rm backend_fastapi/app/core/circuit_breaker.py
rm backend_fastapi/app/core/metrics.py

# 4. Restart
docker-compose restart api celery_worker
```

---

## 📞 Suporte

Em caso de problemas:

1. ✅ Verificar logs: `docker-compose logs -f api celery_worker`
2. ✅ Consultar documentação: `OTIMIZACOES_IMPLEMENTADAS.md`
3. ✅ Verificar issues no GitHub do projeto

---

## ✅ Checklist de Instalação

- [ ] Dependências instaladas (`prometheus-client`)
- [ ] Redis funcionando (versão >= 5.0)
- [ ] Serviços reiniciados
- [ ] Logs verificados (sem erros)
- [ ] Teste Pub/Sub OK
- [ ] Teste Métricas OK (`/metrics` acessível)
- [ ] Teste Deduplicação OK
- [ ] Performance melhorada (latência < 350ms)

---

**Última atualização:** 2026-02-05
**Versão:** 1.0.0
