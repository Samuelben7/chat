# 🚀 Setup Local - WhatsApp Sistema

Guia completo para rodar o sistema localmente.

## 📋 Pré-requisitos

- Python 3.9+
- Node.js 16+
- PostgreSQL 13+
- Redis 6+
- Git

## 🔧 1. Configuração do Backend

### 1.1. Criar ambiente virtual

```bash
cd /home/samuel-benjamim/Chat/whatsapp_system/backend_fastapi
python -m venv venv
source venv/bin/activate  # Linux/Mac
```

### 1.2. Instalar dependências

```bash
pip install -r requirements.txt
```

### 1.3. Configurar variáveis de ambiente

Crie o arquivo `.env` na raiz do backend_fastapi:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/whatsapp_sistema

# JWT
SECRET_KEY=sua_chave_secreta_super_segura_aqui
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Email (Gmail SMTP)
EMAIL_HOST_PASSWORD=sua_senha_de_app_do_gmail

# Redis
REDIS_URL=redis://localhost:6379/0

# Celery
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

### 1.4. Criar banco de dados PostgreSQL

```bash
# Entrar no PostgreSQL
sudo -u postgres psql

# Criar banco
CREATE DATABASE whatsapp_sistema;

# Sair
\q
```

### 1.5. Rodar migrações

```bash
# Criar migrações (se necessário)
alembic revision --autogenerate -m "Initial migration"

# Aplicar migrações
alembic upgrade head
```

### 1.6. Criar empresa de teste

```bash
# Abrir Python interativo
python

# Executar:
from app.database.database import SessionLocal
from app.models.models import Empresa
from passlib.context import CryptContext

db = SessionLocal()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

empresa = Empresa(
    nome="YourSystem Limpeza",
    email="tami.hta1208@gmail.com",
    cnpj="12345678000190",
    telefone="75992057013",
    senha=pwd_context.hash("123456"),
    verify_token="seu_token_meta_aqui",
    ativa=True,
    email_confirmado=True
)

db.add(empresa)
db.commit()
print(f"✅ Empresa criada! ID: {empresa.id}")
db.close()
exit()
```

### 1.7. Criar bot de limpeza

```bash
# Usar o ID da empresa criada (geralmente 1)
python criar_bot_limpeza.py 1
```

## 🎨 2. Configuração do Frontend

### 2.1. Instalar dependências

```bash
cd /home/samuel-benjamim/Chat/whatsapp_system/frontend_react
npm install
```

### 2.2. Configurar variáveis de ambiente

Crie o arquivo `.env` na raiz do frontend_react:

```bash
REACT_APP_API_URL=http://localhost:8000
```

## 🚀 3. Iniciar Serviços

### 3.1. Iniciar Redis (Terminal 1)

```bash
redis-server
```

### 3.2. Iniciar Celery Worker (Terminal 2)

```bash
cd /home/samuel-benjamim/Chat/whatsapp_system/backend_fastapi
source venv/bin/activate
celery -A app.tasks.celery_app worker --loglevel=info
```

### 3.3. Iniciar Backend FastAPI (Terminal 3)

```bash
cd /home/samuel-benjamim/Chat/whatsapp_system/backend_fastapi
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3.4. Iniciar Frontend React (Terminal 4)

```bash
cd /home/samuel-benjamim/Chat/whatsapp_system/frontend_react
npm start
```

## 🧪 4. Testar o Sistema

### 4.1. Acessar aplicação

Abra o navegador em: **http://localhost:3000**

### 4.2. Testar cadastro

1. Ir para `/cadastro`
2. Preencher formulário
3. Verificar email enviado (check terminal do Celery)
4. Clicar no link de confirmação
5. Fazer login

### 4.3. Testar bot

1. No backend, verificar endpoint: `GET http://localhost:8000/api/bot/fluxo/1`
2. Deve retornar o fluxo completo do bot criado

## 📊 5. URLs Importantes

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Redoc**: http://localhost:8000/redoc

## 🔑 6. Credenciais de Teste

- **Email**: tami.hta1208@gmail.com
- **Senha**: 123456
- **Empresa ID**: 1

## 📝 7. Comandos Úteis

### Ver logs do Celery
```bash
celery -A app.tasks.celery_app worker --loglevel=debug
```

### Resetar banco de dados
```bash
alembic downgrade base
alembic upgrade head
```

### Ver estrutura do bot
```bash
python -c "
from app.database.database import SessionLocal
from app.models.models import BotFluxoNo, BotFluxoOpcao

db = SessionLocal()
nos = db.query(BotFluxoNo).filter(BotFluxoNo.empresa_id == 1).order_by(BotFluxoNo.ordem).all()

for no in nos:
    print(f'{no.ordem}. {no.titulo} ({no.tipo})')
    opcoes = db.query(BotFluxoOpcao).filter(BotFluxoOpcao.no_id == no.id).order_by(BotFluxoOpcao.ordem).all()
    for op in opcoes:
        print(f'   → {op.titulo}')
"
```

## 🐛 8. Troubleshooting

### Erro: "relation does not exist"
```bash
# Rodar migrações
alembic upgrade head
```

### Erro: "Connection refused" (Redis)
```bash
# Verificar se Redis está rodando
redis-cli ping
# Deve retornar: PONG
```

### Erro: Email não envia
```bash
# Verificar variável de ambiente
echo $EMAIL_HOST_PASSWORD

# Gerar senha de app no Gmail:
# https://myaccount.google.com/apppasswords
```

### Erro: "No module named 'app'"
```bash
# Garantir que está no diretório correto
cd /home/samuel-benjamim/Chat/whatsapp_system/backend_fastapi
# Ativar venv
source venv/bin/activate
```

## 🎉 Pronto!

Sistema rodando 100% local!

VPS será usada apenas para o webhook do Meta WhatsApp.
