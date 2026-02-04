# 🚀 Backend FastAPI - WhatsApp Sistema

Backend assíncrono em FastAPI para gerenciamento de mensagens WhatsApp e atendimento em tempo real.

## 📋 Estrutura do Projeto

```
backend_fastapi/
├── app/
│   ├── api/              # Endpoints REST
│   │   ├── webhook.py    # Webhook WhatsApp (GET/POST)
│   │   ├── mensagens.py  # CRUD de mensagens
│   │   ├── chat.py       # Interface de chat/atendimento
│   │   └── atendentes.py # Gerenciamento de atendentes
│   ├── core/
│   │   └── config.py     # Configurações (Pydantic Settings)
│   ├── database/
│   │   └── database.py   # Conexão SQLAlchemy
│   ├── models/
│   │   └── models.py     # Models SQLAlchemy
│   ├── schemas/
│   │   └── schemas.py    # Schemas Pydantic (validação)
│   └── services/
│       └── whatsapp.py   # Serviço WhatsApp API
├── alembic/              # Migrations
├── main.py               # Aplicação FastAPI
├── requirements.txt      # Dependências
├── run.sh               # Script de inicialização
└── .env                 # Variáveis de ambiente
```

## 🔧 Instalação

### 1. Criar ambiente virtual

```bash
python3 -m venv venv
source venv/bin/activate
```

### 2. Instalar dependências

```bash
pip install -r requirements.txt
```

### 3. Configurar variáveis de ambiente

Arquivo `.env` já está configurado com:
- PostgreSQL (porta 5434)
- Redis (porta 6380)
- WhatsApp API credentials
- JWT secret key

### 4. Iniciar serviços (PostgreSQL + Redis)

```bash
# PostgreSQL
docker run --name whatsapp_postgres \
  -e POSTGRES_USER=whatsapp_user \
  -e POSTGRES_PASSWORD=whatsapp_pass_2026 \
  -e POSTGRES_DB=whatsapp_db \
  -p 5434:5432 -d postgres:15-alpine

# Redis
docker run --name whatsapp_redis \
  -p 6380:6379 -d redis:7-alpine
```

### 5. Aplicar migrations

```bash
alembic upgrade head
```

## 🚀 Executar

### Forma simples (script automático):

```bash
./run.sh
```

### Forma manual:

```bash
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## 📚 Documentação da API

Após iniciar o servidor:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/api/v1/openapi.json

## 🔌 Endpoints Principais

### Webhook WhatsApp

- `GET /api/v1/webhook` - Verificação de webhook (Meta)
- `POST /api/v1/webhook` - Receber mensagens do WhatsApp

### Mensagens

- `POST /api/v1/mensagens` - Enviar mensagem
- `GET /api/v1/mensagens/{whatsapp_number}` - Listar mensagens
- `PATCH /api/v1/mensagens/{message_id}/marcar-lida` - Marcar como lida
- `GET /api/v1/mensagens/{whatsapp_number}/nao-lidas` - Contar não lidas

### Chat / Atendimento

- `GET /api/v1/chat/conversas` - Listar conversas (sidebar)
- `GET /api/v1/chat/conversa/{whatsapp_number}` - Detalhes da conversa
- `POST /api/v1/chat/atendimento/{whatsapp_number}/assumir` - Assumir atendimento
- `POST /api/v1/chat/atendimento/{whatsapp_number}/finalizar` - Finalizar atendimento
- `POST /api/v1/chat/atendimento/{whatsapp_number}/transferir-bot` - Voltar pro bot
- `PATCH /api/v1/chat/atendimento/{id}` - Atualizar atendimento

### Atendentes

- `GET /api/v1/atendentes` - Listar atendentes
- `POST /api/v1/atendentes` - Criar atendente
- `GET /api/v1/atendentes/{id}` - Obter atendente
- `PATCH /api/v1/atendentes/{id}` - Atualizar atendente
- `DELETE /api/v1/atendentes/{id}` - Deletar atendente
- `POST /api/v1/atendentes/{id}/online` - Marcar como online
- `POST /api/v1/atendentes/{id}/offline` - Marcar como offline
- `GET /api/v1/atendentes/{id}/estatisticas` - Estatísticas do atendente

## 🔐 Configuração do Webhook WhatsApp

### 1. Configurar ngrok (desenvolvimento)

```bash
ngrok http 8000
```

### 2. Configurar no Meta Developer

1. Acesse: https://developers.facebook.com/apps
2. Vá em WhatsApp > Configuração
3. Configure o webhook:
   - URL: `https://seu-dominio.ngrok.io/api/v1/webhook`
   - Verify Token: `meu_token_secreto_123` (mesmo do .env)
   - Inscreva-se em: `messages`

## 🛠️ Desenvolvimento

### Criar nova migration

```bash
alembic revision --autogenerate -m "Descrição da mudança"
alembic upgrade head
```

### Testar endpoints

```bash
# Health check
curl http://localhost:8000/health

# Listar conversas
curl http://localhost:8000/api/v1/chat/conversas

# Enviar mensagem
curl -X POST http://localhost:8000/api/v1/mensagens \
  -H "Content-Type: application/json" \
  -d '{
    "whatsapp_number": "5511999999999",
    "conteudo": "Olá!",
    "tipo_mensagem": "text"
  }'
```

## 📊 Banco de Dados

### Models principais:

- **Cliente** - Dados dos clientes
- **MensagemLog** - Log de todas as mensagens
- **ChatSessao** - Estado da conversa com o bot
- **Atendimento** - Sessões de atendimento
- **Atendente** - Dados dos atendentes
- **TipoServico** - Tipos de serviços oferecidos
- **Contratacao** - Contratações de serviços
- **Agendamento** - Agendamentos de serviços
- **VagaAgenda** - Disponibilidade de vagas

### Acessar banco de dados:

```bash
docker exec -it whatsapp_postgres psql -U whatsapp_user -d whatsapp_db
```

## 🔄 Próximos Passos

- [ ] Implementar WebSocket para tempo real
- [ ] Configurar Celery para tasks assíncronas
- [ ] Adicionar autenticação JWT
- [ ] Implementar rate limiting
- [ ] Adicionar testes unitários
- [ ] Configurar logging estruturado
- [ ] Implementar cache Redis

## 📝 Notas

- Porta 8000: FastAPI
- Porta 5434: PostgreSQL
- Porta 6380: Redis
- CORS está aberto para desenvolvimento (`allow_origins=["*"]`)
- Debug mode ativado no `.env`

## 🐛 Troubleshooting

### Porta já em uso:

```bash
# Encontrar processo
lsof -i :8000

# Matar processo
kill -9 <PID>
```

### Resetar banco de dados:

```bash
docker rm -f whatsapp_postgres
docker run --name whatsapp_postgres -e POSTGRES_USER=whatsapp_user -e POSTGRES_PASSWORD=whatsapp_pass_2026 -e POSTGRES_DB=whatsapp_db -p 5434:5432 -d postgres:15-alpine
alembic upgrade head
```

### Logs de erro:

O FastAPI mostra erros detalhados no console quando `DEBUG=True`.
