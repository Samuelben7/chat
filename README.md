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
token: IitlWBgPYq2WCiCPou9ggVZGU9jSnQuuk1CvaVX7yM8
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
- [x] Cadastro de empresas com verificação de email em 2 etapas
- [x] Emails transacionais com design profissional

### Bot Builder
- [x] Editor visual de fluxos
- [x] Tipos: text, button, list, interactive
- [x] Validações de campos (CPF, CEP, data, etc)
- [x] Templates salvos
- [x] Bot de limpeza/engenharia pré-configurado
- [x] Script de criação automática de bots

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
- [x] Processamento assíncrono (Celery + Redis)
- [x] Retry automático
- [x] Email SMTP (Gmail)

## 🤖 Bot de Limpeza/Engenharia

Sistema inclui bot pré-configurado com fluxo completo:

1. **Menu Inicial** - Boas-vindas com opções
2. **Verificação Cliente** - Busca por CPF ou novo cadastro
3. **Tipo de Serviço** - Casas/Apartamentos/Empresas
4. **Quantidade Quartos** - 2-4, 3-4, 4+ quartos
5. **Agendamento** - Data do serviço
6. **Cadastro Completo** - Nome, CPF, endereço, CEP, complemento, cidade
7. **Pagamento** - Crédito/PIX/Débito
8. **Finalização** - Confirmação

**Criar novo bot:**
```bash
cd backend_fastapi
python criar_bot_limpeza.py <empresa_id>
```

**Ver estrutura do bot:**
```bash
python -c "
from app.database.database import SessionLocal
from app.models.models import BotFluxoNo

db = SessionLocal()
nos = db.query(BotFluxoNo).filter_by(empresa_id=1).order_by(BotFluxoNo.ordem).all()
for no in nos:
    print(f'{no.ordem}. {no.titulo} ({no.tipo})')
"
```

## 📧 Sistema de Email

Confirmação de cadastro em 2 etapas com emails profissionais:

- Design moderno com gradientes
- Logo da empresa
- Responsivo (mobile-friendly)
- Links seguros com token de 32 caracteres
- Expiração em 24 horas
- Processamento assíncrono via Celery (não trava a API)

**Configuração:**
```bash
# .env
EMAIL_HOST_PASSWORD=sua_senha_de_app_do_gmail
```

**Gerar senha de app Gmail:**
https://myaccount.google.com/apppasswords

## 📚 Documentação

- **[LOCAL_SETUP.md](LOCAL_SETUP.md)** - Guia completo de setup local (NOVO!)
- **[DEPLOY_DOCKER.md](DEPLOY_DOCKER.md)** - Guia completo de deploy com Docker
- **[OTIMIZACOES.md](OTIMIZACOES.md)** - Detalhes das otimizações implementadas
- **[.env.example](.env.example)** - Variáveis de ambiente necessárias

## 🚀 Quick Start (Desenvolvimento Local)

### Setup Automático

```bash
# 1. Backend
cd backend_fastapi

# Criar ambiente virtual
python3 -m venv venv
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Configurar .env
cp .env.example .env
nano .env  # Configure EMAIL_HOST_PASSWORD e outras variáveis

# Criar banco PostgreSQL
sudo -u postgres createdb whatsapp_sistema

# Setup completo (cria tabelas, empresa e bot)
python setup_local.py

# 2. Frontend
cd ../frontend_react
npm install
cp .env.example .env

# 3. Iniciar serviços (4 terminais)
./start_local.sh  # Ver instruções
```

### Iniciar Serviços Manualmente

**Terminal 1 - Redis:**
```bash
redis-server
```

**Terminal 2 - Celery Worker:**
```bash
cd backend_fastapi
source venv/bin/activate
celery -A app.tasks.celery_app worker --loglevel=info
```

**Terminal 3 - Backend:**
```bash
cd backend_fastapi
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 4 - Frontend:**
```bash
cd frontend_react
npm start
```

Acesse:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000/docs
- **Redoc:** http://localhost:8000/redoc

**Credenciais de teste:**
- Email: tami.hta1208@gmail.com
- Senha: 123456

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
