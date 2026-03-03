● Guia de Teste Manual — Todas as Telas e Funções Novas

  Aqui está o passo a passo completo para testar tudo localmente:

  ---
  1. Rodar a Migration (primeiro passo obrigatório)

  # Copiar o SQL para dentro do container e executar
  docker cp ~/Chat/whatsapp_system/backend_fastapi/migration_dev_gateway.sql whatsapp_postgres:/migration.sql
  docker exec whatsapp_postgres psql -U whatsapp_user -d whatsapp_db -f /migration.sql

  Isso cria as tabelas (DevUsuario, DevAuth, ApiKey, Plano, Assinatura, Pagamento, GatewayLog) e insere os planos
  padrão (Starter R$97, Pro R$197, Enterprise R$497, Developer R$67).

  ---
  2. Rebuild dos containers

  cd ~/Chat/whatsapp_system
  docker compose build api celery_worker celery_beat
  docker compose up -d

  ---
  3. Testar as Telas do Frontend

  Após subir tudo (docker compose up -d), acesse:

  ┌──────────────────┬─────────────────────────────────────┬───────────────────────────────────────────────────────┐
  │       Tela       │                 URL                 │                      Quem acessa                      │
  ├──────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────────┤
  │ Página de Planos │ http://localhost:3000/planos        │ Público (sem login)                                   │
  ├──────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────────┤
  │ Login Dev        │ http://localhost:3000/dev/login     │ Público                                               │
  ├──────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────────┤
  │ Cadastro Dev     │ http://localhost:3000/dev/cadastro  │ Público                                               │
  ├──────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────────┤
  │ Dashboard Dev    │ http://localhost:3000/dev/dashboard │ Dev logado                                            │
  ├──────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────────┤
  │ Admin Panel      │ http://localhost:3000/admin         │ Admin logado (login normal de empresa com role admin) │
  └──────────────────┴─────────────────────────────────────┴───────────────────────────────────────────────────────┘

  ---
  4. Fluxo de Teste: Portal do Dev

  4.1 — Cadastro de Dev:
  1. Acesse http://localhost:3000/dev/cadastro
  2. Preencha: nome, email, senha, telefone, nome da empresa
  3. Submeta → deve redirecionar para /dev/dashboard

  4.2 — Login de Dev:
  1. Acesse http://localhost:3000/dev/login
  2. Use email/senha cadastrados
  3. Deve ir para /dev/dashboard

  4.3 — Dashboard Dev — Aba Overview:
  - Cards de uso (requests hoje, mensagens mês)
  - Status WhatsApp (desconectado até fazer Embedded Signup)
  - Status da assinatura (trial de 15 dias)

  4.4 — Dashboard Dev — Aba API Keys:
  1. Clique "Gerar Nova API Key"
  2. Dê um nome (ex: "Teste Local")
  3. COPIE a chave exibida — ela aparece só uma vez
  4. A key deve aparecer na lista (com prefixo mascarado)
  5. Teste revogar uma key

  4.5 — Dashboard Dev — Aba Webhook:
  1. Configure uma URL (pode usar https://webhook.site para teste)
  2. Clique "Testar Webhook" → deve enviar payload de teste
  3. Verifique no webhook.site se chegou com header X-Webhook-Signature

  4.6 — Dashboard Dev — Aba Docs:
  - Documentação inline da API com exemplos curl
  - Verifique se está legível e completa

  ---
  5. Testar APIs via curl (Backend)

  5.1 — Cadastro Dev via API:
  curl -X POST http://localhost:8000/api/v1/auth/dev/register \
    -H "Content-Type: application/json" \
    -d '{"nome":"Dev Teste","email":"dev@teste.com","senha":"senha123","telefone":"11999999999","empresa_nome":"Teste
  Corp"}'

  5.2 — Login Dev:
  curl -X POST http://localhost:8000/api/v1/auth/dev/login \
    -H "Content-Type: application/json" \
    -d '{"email":"dev@teste.com","senha":"senha123"}'
  # Guarde o token retornado

  5.3 — Criar API Key:
  curl -X POST http://localhost:8000/api/v1/dev/api-keys \
    -H "Authorization: Bearer SEU_TOKEN_DEV" \
    -H "Content-Type: application/json" \
    -d '{"nome":"Key Teste"}'
  # Guarde a api_key retornada (aparece só 1x)

  5.4 — Listar Planos (público):
  curl http://localhost:8000/api/v1/planos
  curl http://localhost:8000/api/v1/planos/dev
  curl http://localhost:8000/api/v1/planos/empresa

  5.5 — Ver Uso:
  curl http://localhost:8000/api/v1/dev/usage \
    -H "Authorization: Bearer SEU_TOKEN_DEV"

  ---
  6. Testar Pagamentos (precisa das credenciais MP)

  Quando colocar as credenciais do Mercado Pago no .env:

  6.1 — Criar Assinatura:
  # Primeiro pegue o ID do plano dev (da listagem de planos)
  curl -X POST http://localhost:8000/api/v1/assinatura/criar \
    -H "Authorization: Bearer SEU_TOKEN_DEV" \
    -H "Content-Type: application/json" \
    -d '{"plano_id": ID_DO_PLANO_DEV}'
  # Guarde o assinatura.id retornado

  6.2 — Gerar PIX:
  curl -X POST http://localhost:8000/api/v1/pagamentos/pix \
    -H "Authorization: Bearer SEU_TOKEN_DEV" \
    -H "Content-Type: application/json" \
    -d '{"assinatura_id": ID_ASSINATURA, "email": "dev@teste.com"}'
  # Retorna qr_code e qr_code_base64

  6.3 — Verificar Status:
  curl http://localhost:8000/api/v1/pagamentos/status/PAYMENT_ID \
    -H "Authorization: Bearer SEU_TOKEN_DEV"

  Sem credenciais MP: os endpoints de planos, assinaturas, dashboard e API keys funcionam normalmente. Só os endpoints
  de pagamento (/pagamentos/pix, /pagamentos/cartao) vão retornar erro 500.

  ---
  7. Testar Admin Panel

  O admin é o login padrão de empresa com role admin. Para acessar os endpoints admin via curl:

  # Use o token de um usuário empresa com role admin
  curl http://localhost:8000/api/v1/admin/devs \
    -H "Authorization: Bearer SEU_TOKEN_ADMIN"

  curl http://localhost:8000/api/v1/admin/pagamentos \
    -H "Authorization: Bearer SEU_TOKEN_ADMIN"

  curl http://localhost:8000/api/v1/admin/pagamentos/totais \
    -H "Authorization: Bearer SEU_TOKEN_ADMIN"

  curl http://localhost:8000/api/v1/admin/gateway/monitor \
    -H "Authorization: Bearer SEU_TOKEN_ADMIN"

  Se já tem um admin logado no frontend, acesse http://localhost:3000/admin — os novos endpoints (devs, pagamentos,
  gateway monitor) devem aparecer se as telas admin já consomem esses dados.

  ---
  8. Testar Gateway (precisa WhatsApp conectado)

  O gateway só funciona completamente com:
  1. Dev com WhatsApp conectado (token Meta + phone_number_id)
  2. API key ativa
  3. Nginx configurado com auth_request

  Para teste local sem Nginx, teste o endpoint de validação direto:
  curl http://localhost:8000/api/v1/internal/validar-token \
    -H "X-Api-Key: SUA_API_KEY_COMPLETA"
  # Deve retornar 200 com headers X-Meta-Token e X-Phone-Number-Id
  # Ou 403 se WhatsApp não conectado

  ---
  Resumo do que funciona SEM credenciais externas

  ┌─────────────────────────────────┬──────────────────┬────────────────────┐
  │         Funcionalidade          │ Funciona sem MP? │ Funciona sem Meta? │
  ├─────────────────────────────────┼──────────────────┼────────────────────┤
  │ Cadastro/Login Dev              │ Sim              │ Sim                │
  ├─────────────────────────────────┼──────────────────┼────────────────────┤
  │ Dashboard Dev                   │ Sim              │ Sim                │
  ├─────────────────────────────────┼──────────────────┼────────────────────┤
  │ API Keys (criar/listar/revogar) │ Sim              │ Sim                │
  ├─────────────────────────────────┼──────────────────┼────────────────────┤
  │ Página de Planos                │ Sim              │ Sim                │
  ├─────────────────────────────────┼──────────────────┼────────────────────┤
  │ Criar Assinatura                │ Sim              │ Sim                │
  ├─────────────────────────────────┼──────────────────┼────────────────────┤
  │ Webhook Config/Test             │ Sim              │ Sim                │
  ├─────────────────────────────────┼──────────────────┼────────────────────┤
  │ Uso/Histórico                   │ Sim              │ Sim                │
  ├─────────────────────────────────┼──────────────────┼────────────────────┤
  │ Admin Devs/Pagamentos           │ Sim              │ Sim                │
  ├─────────────────────────────────┼──────────────────┼────────────────────┤
  │ Pagamento PIX/Cartão            │ Não              │ Sim                │
  ├─────────────────────────────────┼──────────────────┼────────────────────┤
  │ Gateway (enviar msg)            │ Sim              │ Não                │
  ├─────────────────────────────────┼──────────────────┼────────────────────┤
  │ Embedded Signup WhatsApp        │ Sim              │ Não                │
  └─────────────────────────────────┴──────────────────┴────────────────────┘