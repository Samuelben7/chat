-- Migração: Tabela modelo_mensagem
-- Modelos customizados de mensagem para envio em massa

CREATE TABLE IF NOT EXISTS modelo_mensagem (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'text',
    mensagem TEXT NOT NULL,
    header VARCHAR(500),
    footer VARCHAR(500),
    media_url VARCHAR(1000),
    buttons JSONB,
    button_text VARCHAR(100),
    sections JSONB,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_modelo_mensagem_empresa ON modelo_mensagem(empresa_id);
