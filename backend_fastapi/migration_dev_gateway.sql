-- Migration: Dev API Gateway + Planos + Pagamentos
-- Executar via: docker exec whatsapp_postgres psql -U whatsapp_user -d whatsapp_db -f /migration.sql

-- ==================== DEV USUARIOS ====================
CREATE TABLE IF NOT EXISTS dev_usuario (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    telefone VARCHAR(20),
    empresa_nome VARCHAR(255),
    whatsapp_token TEXT,
    phone_number_id VARCHAR(50) UNIQUE,
    waba_id VARCHAR(50),
    verify_token VARCHAR(255),
    webhook_url TEXT,
    webhook_secret VARCHAR(255),
    status VARCHAR(20) DEFAULT 'trial',
    trial_inicio TIMESTAMPTZ DEFAULT NOW(),
    trial_fim TIMESTAMPTZ,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_usuario_email ON dev_usuario(email);
CREATE INDEX IF NOT EXISTS idx_dev_usuario_phone ON dev_usuario(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_dev_usuario_waba ON dev_usuario(waba_id);

-- ==================== DEV AUTH ====================
CREATE TABLE IF NOT EXISTS dev_auth (
    id SERIAL PRIMARY KEY,
    dev_id INTEGER UNIQUE NOT NULL REFERENCES dev_usuario(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    ultimo_login TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dev_auth_email ON dev_auth(email);
CREATE INDEX IF NOT EXISTS idx_dev_auth_dev_id ON dev_auth(dev_id);

-- ==================== API KEYS ====================
CREATE TABLE IF NOT EXISTS api_key (
    id SERIAL PRIMARY KEY,
    dev_id INTEGER NOT NULL REFERENCES dev_usuario(id) ON DELETE CASCADE,
    key_prefix VARCHAR(8) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    nome VARCHAR(100),
    ativa BOOLEAN DEFAULT TRUE,
    ultima_utilizacao TIMESTAMPTZ,
    criada_em TIMESTAMPTZ DEFAULT NOW(),
    revogada_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_api_key_dev_id ON api_key(dev_id);
CREATE INDEX IF NOT EXISTS idx_api_key_prefix ON api_key(key_prefix);

-- ==================== PLANOS ====================
CREATE TABLE IF NOT EXISTS plano (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL,
    nome VARCHAR(100) NOT NULL,
    preco_mensal NUMERIC(10,2) NOT NULL,
    descricao TEXT,
    features JSONB DEFAULT '[]'::jsonb,
    limites JSONB DEFAULT '{}'::jsonb,
    ativo BOOLEAN DEFAULT TRUE,
    ordem INTEGER DEFAULT 0,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir planos padrão
INSERT INTO plano (tipo, nome, preco_mensal, descricao, features, limites, ordem) VALUES
('empresa', 'Starter', 97.00, 'Ideal para pequenas empresas',
 '["Atendimento automatizado 24/7", "1 atendente", "Bot builder básico", "500 mensagens/mês"]'::jsonb,
 '{"mensagens_mes": 500, "atendentes": 1, "requests_min": 30}'::jsonb, 1),
('empresa', 'Pro', 197.00, 'Para empresas em crescimento',
 '["Tudo do Starter", "5 atendentes", "Bot builder avançado", "5.000 mensagens/mês", "CRM completo", "Envio em massa"]'::jsonb,
 '{"mensagens_mes": 5000, "atendentes": 5, "requests_min": 60}'::jsonb, 2),
('empresa', 'Enterprise', 497.00, 'Para grandes operações',
 '["Tudo do Pro", "Atendentes ilimitados", "50.000 mensagens/mês", "API dedicada", "Suporte prioritário"]'::jsonb,
 '{"mensagens_mes": 50000, "atendentes": 999, "requests_min": 120}'::jsonb, 3),
('dev', 'Developer', 67.00, 'API Gateway para desenvolvedores',
 '["API Gateway WhatsApp", "1.000 mensagens/mês", "60 requests/min", "Webhook forwarding", "Dashboard de uso"]'::jsonb,
 '{"mensagens_mes": 1000, "requests_min": 60}'::jsonb, 1)
ON CONFLICT DO NOTHING;

-- ==================== ASSINATURAS ====================
CREATE TABLE IF NOT EXISTS assinatura (
    id SERIAL PRIMARY KEY,
    tipo_usuario VARCHAR(20) NOT NULL,
    empresa_id INTEGER REFERENCES empresa(id) ON DELETE SET NULL,
    dev_id INTEGER REFERENCES dev_usuario(id) ON DELETE SET NULL,
    plano_id INTEGER NOT NULL REFERENCES plano(id),
    status VARCHAR(20) DEFAULT 'active',
    data_inicio TIMESTAMPTZ DEFAULT NOW(),
    data_proximo_vencimento TIMESTAMPTZ,
    data_bloqueio TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_assinatura_empresa ON assinatura(empresa_id);
CREATE INDEX IF NOT EXISTS idx_assinatura_dev ON assinatura(dev_id);
CREATE INDEX IF NOT EXISTS idx_assinatura_plano ON assinatura(plano_id);

-- ==================== PAGAMENTOS ====================
CREATE TABLE IF NOT EXISTS pagamento (
    id SERIAL PRIMARY KEY,
    assinatura_id INTEGER NOT NULL REFERENCES assinatura(id),
    tipo_usuario VARCHAR(20) NOT NULL,
    empresa_id INTEGER REFERENCES empresa(id) ON DELETE SET NULL,
    dev_id INTEGER REFERENCES dev_usuario(id) ON DELETE SET NULL,
    valor NUMERIC(10,2) NOT NULL,
    metodo VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    mp_payment_id VARCHAR(100),
    mp_pix_qr_code TEXT,
    mp_pix_qr_code_base64 TEXT,
    dados_extras JSONB DEFAULT '{}'::jsonb,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pagamento_mp_id ON pagamento(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_pagamento_status ON pagamento(status);
CREATE INDEX IF NOT EXISTS idx_pagamento_assinatura ON pagamento(assinatura_id);

-- ==================== GATEWAY LOG ====================
CREATE TABLE IF NOT EXISTS gateway_log (
    id SERIAL PRIMARY KEY,
    dev_id INTEGER NOT NULL REFERENCES dev_usuario(id) ON DELETE CASCADE,
    api_key_id INTEGER REFERENCES api_key(id) ON DELETE SET NULL,
    endpoint VARCHAR(255),
    status_code INTEGER,
    latency_ms INTEGER,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gateway_log_dev ON gateway_log(dev_id);
CREATE INDEX IF NOT EXISTS idx_gateway_log_timestamp ON gateway_log(timestamp);
