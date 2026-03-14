-- Migration: Recuperação de senha + confirmação email dev
-- Execute via: docker exec -i whatsapp_postgres psql -U postgres -d whatsapp < migrate_reset_senha.sql

CREATE TABLE IF NOT EXISTS tokens_reset_senha (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    usado BOOLEAN DEFAULT FALSE,
    expira_em TIMESTAMP NOT NULL,
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tokens_reset_email ON tokens_reset_senha (email);
CREATE INDEX IF NOT EXISTS idx_tokens_reset_token ON tokens_reset_senha (token);

CREATE TABLE IF NOT EXISTS tokens_confirmacao_email_dev (
    id SERIAL PRIMARY KEY,
    dev_id INTEGER NOT NULL REFERENCES dev_usuario(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    usado BOOLEAN DEFAULT FALSE,
    expira_em TIMESTAMP NOT NULL,
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tokens_confirmacao_dev_dev_id ON tokens_confirmacao_email_dev (dev_id);
CREATE INDEX IF NOT EXISTS idx_tokens_confirmacao_dev_email ON tokens_confirmacao_email_dev (email);
CREATE INDEX IF NOT EXISTS idx_tokens_confirmacao_dev_token ON tokens_confirmacao_email_dev (token);
