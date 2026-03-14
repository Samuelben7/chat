-- =========================================================
-- Migration: Agenda + Especialidades + IA Bot Chamada + Lembretes
-- =========================================================

-- 1. Adicionar especialidade e compareceu ao agendamento
ALTER TABLE agenda_agendamento
  ADD COLUMN IF NOT EXISTS especialidade_id INTEGER REFERENCES especialidade(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compareceu BOOLEAN DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_agendamento_especialidade ON agenda_agendamento(especialidade_id);
CREATE INDEX IF NOT EXISTS idx_agendamento_compareceu ON agenda_agendamento(empresa_id, compareceu);

-- 2. Vínculo IA → BotFluxo existente para coleta de dados
CREATE TABLE IF NOT EXISTS ia_bot_chamada (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  gatilho VARCHAR(50) NOT NULL DEFAULT 'agendamento', -- 'agendamento' | 'cadastro' | 'manual'
  bot_fluxo_id INTEGER NOT NULL REFERENCES bot_fluxo(id) ON DELETE CASCADE,
  descricao_campos TEXT,  -- ex: "Coleta nome completo, CPF e e-mail"
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ia_bot_chamada_empresa ON ia_bot_chamada(empresa_id);

-- 3. Configuração de lembrete de agendamento por empresa
CREATE TABLE IF NOT EXISTS agenda_lembrete_config (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER UNIQUE NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  -- Mensagem interativa (janela 24h aberta)
  mensagem_interativa JSONB,
  mensagem_interativa_nome VARCHAR(200),
  -- Template Meta (fora da janela 24h)
  template_nome VARCHAR(100),
  template_idioma VARCHAR(10) DEFAULT 'pt_BR',
  template_componentes JSONB DEFAULT '[]',   -- componentes com params dinâmicos
  ativo BOOLEAN DEFAULT TRUE,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lembrete_config_empresa ON agenda_lembrete_config(empresa_id);

-- 4. Coluna lembrete_enviado no agendamento
ALTER TABLE agenda_agendamento
  ADD COLUMN IF NOT EXISTS lembrete_enviado BOOLEAN DEFAULT FALSE;
