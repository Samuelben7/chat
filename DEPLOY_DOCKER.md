# 🐳 Deploy com Docker - WhatsApp System

Deploy simplificado usando Docker Compose para backend completo (FastAPI + Celery + Redis + PostgreSQL).

React será hospedado separadamente (Vercel, Netlify, ou VPS com Nginx).

---

## 📋 Pré-requisitos na VPS

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Adicionar seu usuário ao grupo docker (evita usar sudo)
sudo usermod -aG docker $USER

# Logout e login novamente para aplicar o grupo
exit
# Faça login novamente via SSH

# Verificar instalação
docker --version
docker compose version
```

---

## 🚀 Deploy Passo a Passo

### 1. Clonar/Enviar Código para VPS

```bash
# Opção A: Git (recomendado)
cd ~
git clone https://github.com/SEU_USUARIO/SEU_REPO.git
cd SEU_REPO/whatsapp_system

# Opção B: SCP (do seu PC local)
scp -r ~/Chat/whatsapp_system samuel@SEU_IP_VPS:~
```

### 2. Configurar Variáveis de Ambiente

```bash
cd ~/whatsapp_system

# Copiar exemplo
cp .env.example .env

# Editar com seus valores reais
nano .env
```

**Gerar SECRET_KEY segura:**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Exemplo de .env:**
```bash
POSTGRES_DB=whatsapp_db
POSTGRES_USER=whatsapp_user
POSTGRES_PASSWORD=SenhaForte@123!XYZ

SECRET_KEY=sua-chave-gerada-com-32-caracteres-ou-mais
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

WHATSAPP_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PHONE_NUMBER_ID=123456789012345

DEBUG=False
ENVIRONMENT=production
```

Salve com `Ctrl+O`, Enter, `Ctrl+X`

### 3. Criar Diretórios Necessários

```bash
# Criar diretórios para volumes
mkdir -p backend_fastapi/logs
mkdir -p backend_fastapi/uploads/avatars

# Dar permissões
chmod -R 755 backend_fastapi/logs backend_fastapi/uploads
```

### 4. Build e Iniciar Containers

```bash
# Build das imagens (primeira vez ou após mudanças no código)
docker compose build

# Iniciar todos os serviços
docker compose up -d

# Ver logs em tempo real
docker compose logs -f

# Ver status dos containers
docker compose ps
```

**Saída esperada:**
```
NAME                     STATUS              PORTS
whatsapp_api             Up (healthy)        0.0.0.0:8000->8000/tcp
whatsapp_celery_beat     Up                  
whatsapp_celery_worker   Up                  
whatsapp_postgres        Up (healthy)        0.0.0.0:5432->5432/tcp
whatsapp_redis           Up (healthy)        0.0.0.0:6379->6379/tcp
```

### 5. Rodar Migrações do Banco

```bash
# Entrar no container da API
docker compose exec api bash

# Dentro do container:
alembic upgrade head

# OU criar tabelas manualmente:
python3 -c "from app.database.database import engine, Base; from app.models import models; Base.metadata.create_all(bind=engine)"

# Sair do container
exit
```

### 6. Verificar Funcionamento

```bash
# Testar API
curl http://localhost:8000/docs

# Ver logs da API
docker compose logs -f api

# Ver logs do Celery Worker
docker compose logs -f celery_worker

# Ver logs do Celery Beat
docker compose logs -f celery_beat

# Verificar Redis
docker compose exec redis redis-cli ping
# Deve retornar: PONG

# Verificar Postgres
docker compose exec postgres psql -U whatsapp_user -d whatsapp_db -c "\dt"
```

### 7. Configurar Nginx (Reverse Proxy)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Criar configuração
sudo nano /etc/nginx/sites-available/whatsapp-api
```

Cole (substitua `api.seudominio.com`):

```nginx
server {
    listen 80;
    server_name api.seudominio.com;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req zone=api_limit burst=20 nodelay;

    # API
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "OK";
        add_header Content-Type text/plain;
    }
}
```

```bash
# Ativar site
sudo ln -s /etc/nginx/sites-available/whatsapp-api /etc/nginx/sites-enabled/

# Testar configuração
sudo nginx -t

# Recarregar Nginx
sudo systemctl reload nginx

# Configurar SSL
sudo certbot --nginx -d api.seudominio.com

# Renovação automática já configurada!
```

### 8. Configurar Firewall

```bash
# Permitir portas necessárias
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS

# Ativar firewall
sudo ufw enable

# Ver status
sudo ufw status
```

---

## 🔄 Comandos Úteis

### Gerenciar Containers

```bash
# Ver status
docker compose ps

# Ver logs
docker compose logs -f [service_name]

# Reiniciar serviço específico
docker compose restart api
docker compose restart celery_worker

# Parar tudo
docker compose down

# Parar e remover volumes (CUIDADO: apaga dados!)
docker compose down -v

# Rebuild após mudanças no código
docker compose build
docker compose up -d
```

### Atualizar Código

```bash
# Puxar atualizações
git pull origin main

# Rebuild e restart
docker compose build
docker compose up -d

# Ver se aplicou
docker compose logs -f api
```

### Backup Database

```bash
# Backup
docker compose exec postgres pg_dump -U whatsapp_user whatsapp_db > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20260204.sql | docker compose exec -T postgres psql -U whatsapp_user -d whatsapp_db
```

### Limpar Cache Redis

```bash
# Entrar no Redis
docker compose exec redis redis-cli

# Ver chaves
KEYS *

# Limpar tudo (desenvolvimento)
FLUSHALL

# Sair
exit
```

### Ver Métricas

```bash
# Uso de recursos
docker stats

# Espaço em disco
docker system df

# Limpar imagens antigas
docker system prune -a
```

---

## 🔧 Troubleshooting

### Container não inicia

```bash
# Ver logs detalhados
docker compose logs api

# Ver erros de build
docker compose build --no-cache

# Verificar permissões
ls -la backend_fastapi/
```

### Erro de conexão com banco

```bash
# Verificar se Postgres está rodando
docker compose ps postgres

# Ver logs do Postgres
docker compose logs postgres

# Testar conexão manual
docker compose exec postgres psql -U whatsapp_user -d whatsapp_db
```

### Celery não processa tasks

```bash
# Ver logs do worker
docker compose logs -f celery_worker

# Ver status do Redis
docker compose exec redis redis-cli ping

# Reiniciar worker
docker compose restart celery_worker
```

### Webhook não funciona

```bash
# Ver logs da API
docker compose logs -f api

# Verificar se porta 8000 está acessível
curl http://localhost:8000/docs

# Verificar se Nginx está funcionando
sudo nginx -t
sudo systemctl status nginx

# Testar webhook manualmente (do Meta ou curl)
curl -X POST https://api.seudominio.com/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

---

## 📊 Monitoramento

### Logs Centralizados

```bash
# Todos os serviços
docker compose logs -f

# Último 100 linhas
docker compose logs --tail=100

# Serviço específico
docker compose logs -f api
docker compose logs -f celery_worker
```

### Healthchecks

```bash
# API
curl http://localhost:8000/docs

# Redis
docker compose exec redis redis-cli ping

# Postgres
docker compose exec postgres pg_isready -U whatsapp_user
```

---

## 🎯 Deploy do Frontend React (Separado)

O React será hospedado em outro lugar. Opções:

### Opção 1: Vercel (Recomendado - Grátis)

```bash
# No diretório do frontend
cd frontend_react

# Criar .env.production
echo "VITE_API_URL=https://api.seudominio.com" > .env.production
echo "VITE_WS_URL=wss://api.seudominio.com/ws" >> .env.production

# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Opção 2: Netlify (Grátis)

```bash
# Netlify CLI
npm i -g netlify-cli

# Build
npm run build

# Deploy
netlify deploy --prod
```

### Opção 3: VPS com Nginx (Mesma máquina)

```bash
cd ~/whatsapp_system/frontend_react

# Build
npm install
npm run build

# Copiar build para Nginx
sudo cp -r dist/* /var/www/html/

# Configurar Nginx
sudo nano /etc/nginx/sites-available/frontend
```

```nginx
server {
    listen 80;
    server_name seudominio.com www.seudominio.com;

    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL
sudo certbot --nginx -d seudominio.com -d www.seudominio.com
```

---

## ✅ Checklist Final

- [ ] Docker e Docker Compose instalados
- [ ] Código clonado/enviado para VPS
- [ ] Arquivo .env configurado com valores reais
- [ ] Diretórios logs/ e uploads/ criados
- [ ] `docker compose up -d` executado com sucesso
- [ ] Todos os 5 containers rodando (ps mostra "Up")
- [ ] Migrações do banco executadas
- [ ] Nginx configurado como reverse proxy
- [ ] SSL configurado (certbot)
- [ ] Firewall configurado (ufw)
- [ ] Frontend deployado separadamente
- [ ] Webhook testado e funcionando
- [ ] Cache Redis operacional
- [ ] Celery worker processando tasks

---

## 🎉 Sistema no Ar!

**API Backend:** https://api.seudominio.com/docs  
**Frontend:** https://seudominio.com  
**Webhook:** https://api.seudominio.com/webhook

**Stack rodando:**
- ✅ FastAPI (4 workers)
- ✅ Celery Worker (4 concurrency)
- ✅ Celery Beat (scheduler)
- ✅ PostgreSQL 15
- ✅ Redis 7
- ✅ Nginx (reverse proxy + SSL)

Tudo otimizado com cache, processamento assíncrono e pronto para escalar! 🚀
