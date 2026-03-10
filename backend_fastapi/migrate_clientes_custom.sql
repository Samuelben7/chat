-- Migration: Campos customizáveis para clientes
-- Executar no banco de dados PostgreSQL

CREATE TABLE IF NOT EXISTS campo_custom_cliente (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'texto',
    opcoes JSONB,
    obrigatorio BOOLEAN DEFAULT FALSE,
    ativo BOOLEAN DEFAULT TRUE,
    ordem INTEGER DEFAULT 0,
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cliente_valor_custom (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES whatsapp_bot_cliente(id) ON DELETE CASCADE,
    campo_id INTEGER NOT NULL REFERENCES campo_custom_cliente(id) ON DELETE CASCADE,
    valor TEXT,
    atualizado_em TIMESTAMP DEFAULT NOW(),
    UNIQUE(cliente_id, campo_id)
);

CREATE INDEX IF NOT EXISTS idx_campo_custom_empresa ON campo_custom_cliente(empresa_id);
CREATE INDEX IF NOT EXISTS idx_valor_custom_cliente ON cliente_valor_custom(cliente_id);
