import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface EncerrarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEncerrar: (motivo: string, observacao?: string, retornarBot?: boolean, etapaFunil?: string, valorNegocio?: number) => Promise<void>;
  conversaNumero: string;
}

interface EtapaFunil {
  codigo: string;
  nome: string;
  emoji: string;
  cor: string;
}

const ETAPAS_FUNIL: EtapaFunil[] = [
  { codigo: 'lead',          nome: 'Lead',           emoji: '📬', cor: '#94a3b8' },
  { codigo: 'contato',       nome: 'Contato feito',  emoji: '📞', cor: '#60a5fa' },
  { codigo: 'proposta',      nome: 'Proposta',        emoji: '📋', cor: '#a78bfa' },
  { codigo: 'negociacao',    nome: 'Negociação',      emoji: '🤝', cor: '#f59e0b' },
  { codigo: 'vendido',       nome: 'Vendido',         emoji: '💰', cor: '#22c55e' },
  { codigo: 'perdido',       nome: 'Perdido',         emoji: '❌', cor: '#ef4444' },
  { codigo: 'sem_resposta',  nome: 'Sem resposta',    emoji: '⏰', cor: '#f97316' },
  { codigo: 'spam',          nome: 'Spam',            emoji: '🚫', cor: '#6b7280' },
];

const EncerrarModal: React.FC<EncerrarModalProps> = ({
  isOpen,
  onClose,
  onEncerrar,
  conversaNumero,
}) => {
  const [etapaSelecionada, setEtapaSelecionada] = useState('');
  const [observacao, setObservacao] = useState('');
  const [valorNegocio, setValorNegocio] = useState('');
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();

  const handleEncerrar = async () => {
    if (!etapaSelecionada) return;
    try {
      setLoading(true);
      const valor = valorNegocio ? parseFloat(valorNegocio.replace(',', '.')) : undefined;
      await onEncerrar(
        etapaSelecionada,
        observacao || undefined,
        true, // retornarBot
        etapaSelecionada,
        isNaN(valor as number) ? undefined : valor,
      );
      onClose();
      setEtapaSelecionada('');
      setObservacao('');
      setValorNegocio('');
    } catch (error) {
      console.error('Erro ao encerrar:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const etapaAtual = ETAPAS_FUNIL.find((e) => e.codigo === etapaSelecionada);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: colors.modalOverlay }}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-md my-auto overflow-hidden"
        style={{ backgroundColor: colors.cardBg }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Encerrar Atendimento</h2>
            <p className="text-sm opacity-80">{conversaNumero}</p>
          </div>
          <button
            onClick={onClose}
            className="hover:opacity-80 rounded-full w-8 h-8 flex items-center justify-center transition-colors text-xl"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {/* Etapa do funil */}
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2" style={{ color: colors.textSecondary }}>
              Etapa do funil:
            </label>
            <div className="grid grid-cols-4 gap-2">
              {ETAPAS_FUNIL.map((etapa) => {
                const selected = etapaSelecionada === etapa.codigo;
                return (
                  <button
                    key={etapa.codigo}
                    onClick={() => !loading && setEtapaSelecionada(etapa.codigo)}
                    className="flex flex-col items-center justify-center p-2 rounded-lg transition-all text-center"
                    style={{
                      backgroundColor: selected ? `${etapa.cor}20` : colors.headerBg,
                      border: `2px solid ${selected ? etapa.cor : colors.border}`,
                    }}
                  >
                    <span className="text-xl mb-0.5">{etapa.emoji}</span>
                    <span
                      className="text-[10px] font-medium leading-tight"
                      style={{ color: selected ? etapa.cor : colors.textPrimary }}
                    >
                      {etapa.nome}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Valor do negócio */}
          {etapaSelecionada && (
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1.5" style={{ color: colors.textSecondary }}>
                Valor do negócio (opcional):
              </label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium"
                  style={{ color: colors.textSecondary }}
                >
                  R$
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valorNegocio}
                  onChange={(e) => setValorNegocio(e.target.value)}
                  placeholder="0,00"
                  className="w-full pl-8 pr-3 py-2 rounded-lg focus:outline-none text-[14px]"
                  style={{
                    backgroundColor: colors.headerBg,
                    color: colors.textPrimary,
                    border: `1px solid ${colors.border}`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Observação */}
          {etapaSelecionada && (
            <div className="mb-2">
              <label className="block text-sm font-medium mb-1.5" style={{ color: colors.textSecondary }}>
                Observação (opcional):
              </label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Adicione detalhes sobre este atendimento..."
                className="w-full px-3 py-2 rounded-lg focus:outline-none resize-none text-[13px]"
                style={{
                  backgroundColor: colors.headerBg,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.border}`,
                }}
                rows={2}
                maxLength={300}
              />
              <p className="text-xs mt-1 text-right" style={{ color: colors.textSecondary }}>
                {observacao.length}/300
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex items-center justify-between border-t"
          style={{ backgroundColor: colors.headerBg, borderColor: colors.border }}
        >
          {etapaAtual ? (
            <span className="text-sm flex items-center gap-1.5" style={{ color: etapaAtual.cor }}>
              <span>{etapaAtual.emoji}</span>
              <span className="font-medium">{etapaAtual.nome}</span>
            </span>
          ) : (
            <span className="text-sm" style={{ color: colors.textSecondary }}>
              Selecione uma etapa
            </span>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-[14px] font-medium disabled:opacity-50"
              style={{ color: colors.textSecondary }}
            >
              Cancelar
            </button>
            <button
              onClick={handleEncerrar}
              disabled={!etapaSelecionada || loading}
              className="px-5 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-[14px] font-medium"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  <span>Encerrando...</span>
                </>
              ) : (
                <span>Encerrar</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EncerrarModal;
