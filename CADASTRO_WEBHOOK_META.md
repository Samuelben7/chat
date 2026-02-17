# 📱 Como Cadastrar o Webhook na Meta (WhatsApp Business API)

## ✅ Webhook pronto e funcionando!

**URL testada e aprovada:** https://api.yoursystem.dev.br/api/v1/webhook

---

## 🔐 Informações da Empresa no Sistema

O banco de dados já possui uma empresa cadastrada:

- **Nome:** Minha Empresa
- **Verify Token:** `meuTokenSecreto123`
- **Status:** Ativa ✅

---

## 📋 Passo a passo para cadastrar na Meta

### 1. Acesse o Meta Developer Dashboard
- URL: https://developers.facebook.com/apps
- Faça login com sua conta Meta Business

### 2. Selecione seu App WhatsApp
- Escolha o app que tem o WhatsApp Business API configurado
- Vá para: **WhatsApp > Configuration** (no menu lateral)

### 3. Configure o Webhook

Na seção **Webhook**, clique em **Edit** ou **Configure Webhook**:

#### Callback URL:
```
https://api.yoursystem.dev.br/api/v1/webhook
```

#### Verify Token:
```
meuTokenSecreto123
```

**IMPORTANTE:** O verify token precisa ser EXATAMENTE igual ao cadastrado no banco. É case-sensitive!

### 4. Clique em "Verify and Save"

A Meta vai fazer uma requisição GET para seu webhook:
```
GET https://api.yoursystem.dev.br/api/v1/webhook?hub.mode=subscribe&hub.verify_token=meuTokenSecreto123&hub.challenge=RANDOM_STRING
```

Seu servidor vai:
1. Verificar se `hub.mode = "subscribe"`
2. Buscar a empresa com `verify_token = "meuTokenSecreto123"`
3. Retornar o `hub.challenge` de volta

Se tudo estiver correto, você verá: ✅ **"Webhook verified successfully"**

### 5. Subscrever aos eventos (Subscribe to webhook fields)

Na seção **Webhook fields**, marque os eventos que deseja receber:

✅ **Recomendado:**
- `messages` - Mensagens recebidas
- `messaging_postbacks` - Respostas de botões interativos
- `message_deliveries` - Status de entrega (enviado, entregue, lido)
- `message_reads` - Quando usuário lê a mensagem

Clique em **Subscribe** para cada campo.

---

## 🧪 Como testar se está funcionando

### Teste 1: Verificação manual
```bash
curl "https://api.yoursystem.dev.br/api/v1/webhook?hub.mode=subscribe&hub.verify_token=meuTokenSecreto123&hub.challenge=TESTE123"
```

**Resposta esperada:**
```
TESTE123
```

### Teste 2: Enviar mensagem de teste
Depois de configurar o webhook:
1. Envie uma mensagem para o número do WhatsApp Business cadastrado
2. Verifique os logs do container:
```bash
docker compose logs -f api
```

Você deve ver:
```
📨 Webhook recebido
✅ Webhook enviado para Celery
```

---

## 🔍 Troubleshooting

### Erro: "The callback URL couldn't be validated"

**Possíveis causas:**

1. **Verify token errado**
   - Verifique se está usando exatamente: `meuTokenSecreto123`
   - É case-sensitive!

2. **HTTPS não acessível**
   - Teste: `curl -I https://api.yoursystem.dev.br/health`
   - Deve retornar `200 OK`

3. **Servidor fora do ar**
   - Verifique: `docker compose ps`
   - Todos devem estar `Up (healthy)`

### Erro: "Verification token mismatch"

O token no banco não corresponde ao fornecido. Verifique o token correto:

```bash
docker compose exec -T postgres psql -U whatsapp_user -d whatsapp_db -c "SELECT id, nome, verify_token FROM empresa WHERE ativa = true;"
```

### Como alterar o verify token

Se precisar usar outro token (ex: `meu_token_secreto_123`):

```bash
docker compose exec -T postgres psql -U whatsapp_user -d whatsapp_db -c "UPDATE empresa SET verify_token = 'meu_token_secreto_123' WHERE id = 1;"
```

---

## 📊 Verificar logs em tempo real

```bash
# Todos os logs
docker compose logs -f

# Apenas API
docker compose logs -f api

# Apenas últimas 50 linhas
docker compose logs api --tail=50
```

---

## 🎯 URLs importantes

- **API Docs:** https://api.yoursystem.dev.br/docs
- **Health Check:** https://api.yoursystem.dev.br/health
- **Webhook:** https://api.yoursystem.dev.br/api/v1/webhook
- **Meta Developer:** https://developers.facebook.com/apps

---

## ✅ Checklist final

Antes de cadastrar na Meta, confirme:

- [ ] SSL funcionando: `curl -I https://api.yoursystem.dev.br/health` retorna 200
- [ ] Webhook respondendo: teste manual retorna o challenge
- [ ] Containers rodando: `docker compose ps` todos "Up"
- [ ] Verify token correto no banco: `meuTokenSecreto123`
- [ ] Logs sem erros: `docker compose logs api --tail=20`

---

**Tudo pronto! Agora é só cadastrar na Meta! 🚀**

Se houver qualquer erro, verifique os logs:
```bash
docker compose logs api --tail=50 -f
```
