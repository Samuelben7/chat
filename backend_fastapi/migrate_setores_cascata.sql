-- ============================================================
-- Migration: Setores, Cascata, Especialidades, Encerramento
-- ============================================================

-- 1. Setores/Departamentos
CREATE TABLE IF NOT EXISTS setor (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    descricao VARCHAR(255),
    ativo BOOLEAN DEFAULT TRUE,
    ordem INTEGER DEFAULT 0,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_setor_empresa ON setor(empresa_id);

-- 2. Atendente <-> Setor (many-to-many)
CREATE TABLE IF NOT EXISTS atendente_setor (
    id SERIAL PRIMARY KEY,
    atendente_id INTEGER NOT NULL REFERENCES painel_atendente(id) ON DELETE CASCADE,
    setor_id INTEGER NOT NULL REFERENCES setor(id) ON DELETE CASCADE,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT idx_atendente_setor_unique UNIQUE (atendente_id, setor_id)
);

-- 3. Especialidades
CREATE TABLE IF NOT EXISTS especialidade (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    nome VARCHAR(150) NOT NULL,
    descricao TEXT,
    valor NUMERIC(10, 2),
    duracao_minutos INTEGER,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_especialidade_empresa ON especialidade(empresa_id);

-- 4. Empresa: cascata
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cascata_ativo BOOLEAN DEFAULT FALSE;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cascata_index INTEGER DEFAULT 0;

-- 5. Atendimento: encerramento enriquecido
ALTER TABLE painel_atendimento ADD COLUMN IF NOT EXISTS etapa_funil VARCHAR(50);
ALTER TABLE painel_atendimento ADD COLUMN IF NOT EXISTS valor_negocio NUMERIC(12, 2);
ALTER TABLE painel_atendimento ADD COLUMN IF NOT EXISTS setor_id INTEGER REFERENCES setor(id);
