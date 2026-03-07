import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface EncerrarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEncerrar: (motivo: string, observacao?: string, retornarBot?: boolean) => Promise<void>;
  conversaNumero: string;
}

interface MotivoEncerramento {
  codigo: string;
  nome: string;
  emoji: string;
}

const EncerrarModal: React.FC<EncerrarModalProps> = ({
  isOpen,
  onClose,
  onEncerrar,
  conversaNumero,
}) => {
  const [motivoSelecionado, setMotivoSelecionado] = useState('');
  const [observacao, setObservacao] = useState('');
  const [retornarBot, setRetornarBot] = useState(true);
  const [loading, setLoading] = useState(false);
  const { theme, colors } = useTheme();

  const motivos: MotivoEncerramento[] = [
    { codigo: 'vendido', nome: 'Vendido', emoji: '💰' },
    { codigo: 'spam', nome: 'Spam', emoji: '🚫' },
    { codigo: 'sem_resposta', nome: 'Sem resposta', emoji: '⏰' },
  ];

  const handleEncerrar = async () => {
    if (!motivoSelecionado) return;

    try {
      setLoading(true);
      await onEncerrar(
        motivoSelecionado,
        observacao || undefined,
        retornarBot
      );
      onClose();
      setMotivoSelecionado('');
      setObservacao('');
      setRetornarBot(true);
    } catch (error) {
      console.error('Erro ao encerrar:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: colors.modalOverlay }}
    >
      <div className="rounded-lg shadow-2xl w-full max-w-md my-auto overflow-hidden"
        style={{ backgroundColor: colors.cardBg }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Encerrar Atendimento</h2>
          <button
            onClick={onClose}
            className="hover:opacity-80 rounded-full px-2 transition-colors text-2xl"
          >
            x
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {/* Motivo */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              Motivo:
            </label>

            <div className="grid grid-cols-3 gap-2">
              {motivos.map((motivo) => (
                <button
                  key={motivo.codigo}
                  onClick={() => !loading && setMotivoSelecionado(motivo.codigo)}
                  className="flex flex-col items-center justify-center p-2 rounded-lg transition-all"
                  style={{
                    backgroundColor: motivoSelecionado === motivo.codigo
                      ? (theme === 'yoursystem' ? 'rgba(91, 123, 213, 0.15)' : '#E7F8EE')
                      : colors.headerBg,
                    border: `2px solid ${motivoSelecionado === motivo.codigo ? colors.primary : colors.border}`,
                  }}
                >
                  <span className="text-2xl mb-1">{motivo.emoji}</span>
                  <span className="text-[11px] font-medium text-center" style={{ color: colors.textPrimary }}>
                    {motivo.nome}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Observacao */}
          {motivoSelecionado && (
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1.5" style={{ color: colors.textSecondary }}>
                Observacao (opcional):
              </label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Adicione detalhes..."
                className="w-full px-3 py-2 rounded-lg focus:outline-none resize-none text-[13px]"
                style={{
                  backgroundColor: colors.headerBg,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.border}`,
                }}
                rows={2}
                maxLength={200}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end space-x-3 border-t"
          style={{ backgroundColor: colors.headerBg, borderColor: colors.border }}
        >
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg transition-colors text-[14.5px] font-medium disabled:opacity-50"
            style={{ color: colors.textSecondary }}
          >
            Cancelar
          </button>
          <button
            onClick={handleEncerrar}
            disabled={!motivoSelecionado || loading}
            className="px-5 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-2 text-[13px] font-medium"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Encerrando...</span>
              </>
            ) : (
              <span>Encerrar Atendimento</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EncerrarModal;
