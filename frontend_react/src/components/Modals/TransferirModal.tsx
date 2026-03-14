import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';

interface AtendenteSimples {
  id: number;
  nome_exibicao: string;
  status: string;
  foto_url?: string;
}

interface Setor {
  id: number;
  nome: string;
  descricao?: string;
  ativo: boolean;
  atendentes: AtendenteSimples[];
}

interface TransferirModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTransferir: (atendenteId: number, observacao?: string) => Promise<void>;
  conversaNumero: string;
}

const TransferirModal: React.FC<TransferirModalProps> = ({
  isOpen,
  onClose,
  onTransferir,
  conversaNumero,
}) => {
  const [setores, setSetores] = useState<Setor[]>([]);
  const [setoresExpandidos, setSetoresExpandidos] = useState<Set<number>>(new Set());
  const [atendenteSelecionado, setAtendenteSelecionado] = useState<number | null>(null);
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSetores, setLoadingSetores] = useState(false);
  const { theme, colors } = useTheme();

  useEffect(() => {
    if (isOpen) {
      carregarSetores();
    }
  }, [isOpen]);

  const carregarSetores = async () => {
    try {
      setLoadingSetores(true);
      const response = await api.get('/setores/para-transferencia');
      const data: Setor[] = response.data;
      setSetores(data);
      // Expandir todos os setores por padrão
      setSetoresExpandidos(new Set(data.map((s) => s.id)));
    } catch (error) {
      console.error('Erro ao carregar setores:', error);
      setSetores([]);
    } finally {
      setLoadingSetores(false);
    }
  };

  const toggleSetor = (setorId: number) => {
    setSetoresExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(setorId)) next.delete(setorId);
      else next.add(setorId);
      return next;
    });
  };

  const handleTransferir = async () => {
    if (!atendenteSelecionado) return;
    try {
      setLoading(true);
      await onTransferir(atendenteSelecionado, observacao || undefined);
      onClose();
      setAtendenteSelecionado(null);
      setObservacao('');
    } catch (error) {
      console.error('Erro ao transferir:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const gradiente = theme === 'yoursystem'
    ? 'linear-gradient(135deg, #4B7BEC 0%, #6C8EE6 100%)'
    : 'linear-gradient(135deg, #00A884 0%, #25D366 100%)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: colors.modalOverlay }}
    >
      <div
        className="rounded-lg shadow-2xl w-full max-w-md my-auto overflow-hidden"
        style={{ backgroundColor: colors.cardBg }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ background: gradiente }}
        >
          <h2 className="text-lg font-semibold text-white">Transferir Atendimento</h2>
          <button
            onClick={onClose}
            className="rounded-full px-2 transition-colors text-2xl text-white hover:opacity-80"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Info conversa */}
          <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: colors.headerBg }}>
            <p className="text-sm" style={{ color: colors.textSecondary }}>Transferindo conversa:</p>
            <p className="text-[15px] font-medium" style={{ color: colors.textPrimary }}>{conversaNumero}</p>
          </div>

          {/* Setores e atendentes */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              Selecione um atendente:
            </label>

            {loadingSetores ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: colors.primary }} />
              </div>
            ) : setores.length === 0 ? (
              <div className="text-center py-6" style={{ color: colors.textSecondary }}>
                <p className="text-sm">Nenhum setor disponível.</p>
                <p className="text-xs mt-1">Crie setores e associe atendentes no painel.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                {setores.map((setor) => (
                  <div key={setor.id} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                    {/* Header do setor */}
                    <button
                      onClick={() => toggleSetor(setor.id)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
                      style={{ backgroundColor: colors.headerBg }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">🗂️</span>
                        <span className="text-sm font-semibold" style={{ color: colors.textPrimary }}>
                          {setor.nome}
                        </span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: colors.inputBg, color: colors.textSecondary }}
                        >
                          {setor.atendentes.length}
                        </span>
                      </div>
                      <span style={{ color: colors.textSecondary }}>
                        {setoresExpandidos.has(setor.id) ? '▲' : '▼'}
                      </span>
                    </button>

                    {/* Atendentes do setor */}
                    {setoresExpandidos.has(setor.id) && (
                      <div className="divide-y" style={{ borderColor: colors.border }}>
                        {setor.atendentes.length === 0 ? (
                          <p className="px-4 py-2 text-xs" style={{ color: colors.textSecondary }}>
                            Nenhum atendente neste setor.
                          </p>
                        ) : (
                          setor.atendentes.map((atendente) => {
                            const isOnline = atendente.status === 'online';
                            const isSelected = atendenteSelecionado === atendente.id;
                            return (
                              <div
                                key={atendente.id}
                                onClick={() => !loading && setAtendenteSelecionado(atendente.id)}
                                className="flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                                style={{
                                  backgroundColor: isSelected
                                    ? (theme === 'yoursystem' ? 'rgba(91,123,213,0.12)' : 'rgba(0,168,132,0.08)')
                                    : 'transparent',
                                  border: isSelected ? `1px solid ${colors.primary}` : '1px solid transparent',
                                }}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                                  <div>
                                    <p className="text-[14px] font-medium" style={{ color: colors.textPrimary }}>
                                      {atendente.nome_exibicao}
                                    </p>
                                    <p className="text-[12px]" style={{ color: isOnline ? '#22c55e' : colors.textSecondary }}>
                                      {isOnline ? 'Online' : atendente.status === 'ausente' ? 'Ausente' : 'Offline'}
                                    </p>
                                  </div>
                                </div>
                                {isSelected && (
                                  <span className="text-lg" style={{ color: colors.primary }}>✓</span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observação */}
          <div className="mb-2">
            <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              Observação (opcional):
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Adicione uma observação para o próximo atendente..."
              className="w-full px-3 py-2 rounded-lg focus:outline-none resize-none text-[14.5px]"
              style={{
                backgroundColor: colors.headerBg,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
              }}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs mt-1 text-right" style={{ color: colors.textSecondary }}>
              {observacao.length}/500
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex items-center justify-end space-x-3 border-t"
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
            onClick={handleTransferir}
            disabled={!atendenteSelecionado || loading}
            className="px-5 py-2 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-2 text-[14.5px] font-medium"
            style={{ background: gradiente }}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Transferindo...</span>
              </>
            ) : (
              <>
                <span>→</span>
                <span>Transferir</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransferirModal;
