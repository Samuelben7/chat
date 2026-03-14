-- Migration: Lembrete config → modelo e template por ID com mapeamento de variáveis
-- Substitui campos JSON raw por referências a ModeloMensagem e MessageTemplate existentes

ALTER TABLE agenda_lembrete_config
  ADD COLUMN IF NOT EXISTS modelo_id    INTEGER REFERENCES modelo_mensagem(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modelo_params JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS template_id  INTEGER REFERENCES message_template(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_params JSONB DEFAULT '{}';
