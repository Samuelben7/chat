-- Módulo Jurídico: Processos e Movimentações
-- Execute no banco de produção

CREATE TABLE IF NOT EXISTS processo_judicial (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    cliente_id INTEGER REFERENCES whatsapp_bot_cliente(id) ON DELETE SET NULL,
    numero_cnj VARCHAR(25) NOT NULL,
    tribunal VARCHAR(20) NOT NULL,
    segmento VARCHAR(30),
    indice_datajud VARCHAR(50),
    classe VARCHAR(200),
    assunto VARCHAR(500),
    orgao_julgador VARCHAR(300),
    partes JSONB,
    status_atual VARCHAR(100),
    notificar_cliente BOOLEAN DEFAULT TRUE,
    ativo BOOLEAN DEFAULT TRUE,
    ultima_verificacao TIMESTAMP,
    ultima_movimentacao_data TIMESTAMP,
    datajud_id VARCHAR(100),
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processo_empresa_numero
    ON processo_judicial (empresa_id, numero_cnj);

CREATE INDEX IF NOT EXISTS idx_processo_empresa
    ON processo_judicial (empresa_id);

CREATE INDEX IF NOT EXISTS idx_processo_cliente
    ON processo_judicial (cliente_id);


CREATE TABLE IF NOT EXISTS movimentacao_processo (
    id SERIAL PRIMARY KEY,
    processo_id INTEGER NOT NULL REFERENCES processo_judicial(id) ON DELETE CASCADE,
    data_movimentacao TIMESTAMP NOT NULL,
    codigo_nacional INTEGER,
    descricao TEXT NOT NULL,
    texto_completo TEXT,
    resumo_ia TEXT,
    notificado_cliente BOOLEAN DEFAULT FALSE,
    notificado_em TIMESTAMP,
    datajud_hash VARCHAR(64),
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimentacao_processo
    ON movimentacao_processo (processo_id);

CREATE INDEX IF NOT EXISTS idx_movimentacao_data
    ON movimentacao_processo (data_movimentacao);

CREATE INDEX IF NOT EXISTS idx_movimentacao_hash
    ON movimentacao_processo (datajud_hash);
