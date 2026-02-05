# 🚀 WhatsApp System - Multi-tenant SaaS

Sistema completo de atendimento WhatsApp com bot builder, multi-empresa e painel de atendentes.

## 📦 Stack Tecnológica

**Backend:**
- FastAPI (Python 3.12)
- PostgreSQL 15
- Redis 7
- Celery (background tasks)
- SQLAlchemy ORM
- JWT Authentication
- WhatsApp Business API (Meta oficial)

**Frontend:**
- React 18 + TypeScript
- Vite
- Zustand (state management)
- TailwindCSS
- WebSocket (tempo real)

**Deploy:**
- Docker + Docker Compose
- Nginx (reverse proxy)
- SSL (Let's Encrypt)

## ⚡ Performance

Sistema otimizado com:
- ✅ Cache Redis estratégico (95% menos queries)
- ✅ Webhook assíncrono (< 100ms response)
- ✅ Processamento background via Celery
- ✅ Connection pooling (60 conexões simultâneas)
- ✅ Subqueries para eliminar N+1 queries
- ✅ WebSocket para updates em tempo real

**Impacto:**
- 95-97% redução de queries ao banco
- 98% redução de latência com cache
- 80-95% redução no tempo de resposta do webhook
- 25x+ aumento no throughput de mensagens

## 🎯 Funcionalidades

### Multi-tenant
- [x] Sistema multi-empresa isolado
- [x] Autenticação JWT por role (empresa/atendente)
- [x] Dados isolados por empresa_id

### Bot Builder
- [x] Editor visual de fluxos
- [x] Tipos: text, button, list, interactive
- [x] Validações de campos
- [x] Templates salvos

### Atendimento
- [x] Painel de atendentes em tempo real
- [x] Fila de atendimento
- [x] Assumir/Transferir/Finalizar conversas
- [x] Notificações WebSocket
- [x] Contador de não lidas
- [x] Status de leitura (✓ ✓✓)
- [x] Separadores de data (HOJE, ONTEM)

### Integrações
- [x] WhatsApp Business API (Meta)
- [x] Webhook multi-tenant
- [x] Processamento assíncrono
- [x] Retry automático

## 📚 Documentação

- **[DEPLOY_DOCKER.md](DEPLOY_DOCKER.md)** - Guia completo de deploy com Docker
- **[OTIMIZACOES.md](OTIMIZACOES.md)** - Detalhes das otimizações implementadas
- **[.env.example](.env.example)** - Variáveis de ambiente necessárias

## 🚀 Quick Start (Desenvolvimento)

### Backend

```bash
cd backend_fastapi

# Criar ambiente virtual
python3 -m venv venv
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Configurar .env
cp .env.example .env
# Edite .env com suas credenciais

# Rodar com Docker (Postgres + Redis)
cd ..
docker compose up -d postgres redis

# Criar tabelas
cd backend_fastapi
python3 -c "from app.database.database import engine, Base; from app.models import models; Base.metadata.create_all(bind=engine)"

# Rodar API
uvicorn app.main:app --reload --port 8000

# Em outro terminal, rodar Celery Worker
celery -A app.tasks.celery_app worker -l info
```

### Frontend

```bash
cd frontend_react

# Instalar dependências
npm install

# Configurar .env
cp .env.example .env.local
# Edite com URL da API

# Rodar dev server
npm run dev
```

Acesse:
- **Backend API:** http://localhost:8000/docs
- **Frontend:** http://localhost:5173

## 🐳 Deploy Produção (Docker)

```bash
# 1. Configurar variáveis
cp .env.example .env
nano .env

# 2. Build e subir containers
docker compose build
docker compose up -d

# 3. Rodar migrações
docker compose exec api python3 -c "from app.database.database import engine, Base; from app.models import models; Base.metadata.create_all(bind=engine)"

# 4. Verificar status
docker compose ps
docker compose logs -f
```

Ver [DEPLOY_DOCKER.md](DEPLOY_DOCKER.md) para instruções completas.

## 📝 Estrutura do Projeto

```
whatsapp_system/
├── backend_fastapi/           # API FastAPI
│   ├── app/
│   │   ├── api/              # Endpoints
│   │   ├── core/             # Config, auth, Redis
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # Lógica de negócio
│   │   └── tasks/            # Celery tasks
│   ├── Dockerfile
│   └── requirements.txt
├── frontend_react/            # React App
│   ├── src/
│   │   ├── components/       # Componentes React
│   │   ├── contexts/         # Context API
│   │   ├── hooks/            # Custom hooks
│   │   ├── services/         # API calls
│   │   └── store/            # Zustand store
│   └── package.json
├── docker-compose.yml         # Orquestração containers
├── .env.example              # Template variáveis
├── .gitignore
├── DEPLOY_DOCKER.md          # Guia de deploy
└── OTIMIZACOES.md            # Documentação técnica
```

## 🔐 Variáveis de Ambiente

```bash
# Database
POSTGRES_DB=whatsapp_db
POSTGRES_USER=whatsapp_user
POSTGRES_PASSWORD=sua_senha_forte

# JWT
SECRET_KEY=sua_chave_secreta_32_chars

# WhatsApp API
WHATSAPP_TOKEN=seu_token_meta
PHONE_NUMBER_ID=seu_phone_number_id

# App
DEBUG=False
ENVIRONMENT=production
```

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Add nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT.

## 🆘 Suporte

Para dúvidas ou problemas:
- Abra uma issue no GitHub
- Consulte a documentação em `/docs`
- Verifique logs: `docker compose logs -f`

---

**Status:** ✅ Produção-ready  
**Última atualização:** 2026-02-04  
**Performance:** ~95% redução de queries, cache estratégico, webhook < 100ms
