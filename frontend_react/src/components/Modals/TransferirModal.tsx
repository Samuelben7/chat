import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';

interface Atendente {
  id: number;
  nome: string;
  email: string;
  status_online: boolean;
  atendimentos_ativos: number;
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
  const [atendentes, setAtendentes] = useState<Atendente[]>([]);
  const [atendenteSelecionado, setAtendenteSelecionado] = useState<number | null>(null);
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingAtendentes, setLoadingAtendentes] = useState(false);
  const { theme, colors } = useTheme();

  useEffect(() => {
    if (isOpen) {
      carregarAtendentes();
    }
  }, [isOpen]);

  const carregarAtendentes = async () => {
    try {
      setLoadingAtendentes(true);
      const response = await api.get('/atendentes');
      const data = response.data.map((a: any) => ({
        id: a.id,
        nome: a.nome_exibicao || a.nome || `Atendente ${a.id}`,
        email: a.email || '',
        status_online: a.status === 'online',
        atendimentos_ativos: 0,
      }));
      setAtendentes(data);
    } catch (error) {
      console.error('Erro ao carregar atendentes:', error);
      setAtendentes([]);
    } finally {
      setLoadingAtendentes(false);
    }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: colors.modalOverlay }}
    >
      <div className="rounded-lg shadow-2xl w-full max-w-md my-auto overflow-hidden"
        style={{ backgroundColor: colors.cardBg }}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between"
          style={{
            background: theme === 'yoursystem'
              ? 'linear-gradient(135deg, #4B7BEC 0%, #6C8EE6 100%)'
              : 'linear-gradient(135deg, #00A884 0%, #25D366 100%)'
          }}
        >
          <h2 className="text-lg font-semibold text-white">Transferir Atendimento</h2>
          <button
            onClick={onClose}
            className="rounded-full px-2 transition-colors text-2xl text-white hover:opacity-80"
          >
            x
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Info da conversa */}
          <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: colors.headerBg }}>
            <p className="text-sm" style={{ color: colors.textSecondary }}>Transferindo conversa:</p>
            <p className="text-[15px] font-medium" style={{ color: colors.textPrimary }}>{conversaNumero}</p>
          </div>

          {/* Lista de atendentes */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              Selecione um atendente:
            </label>

            {loadingAtendentes ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: colors.primary }}></div>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {atendentes.map((atendente) => (
                  <div
                    key={atendente.id}
                    onClick={() => !loading && setAtendenteSelecionado(atendente.id)}
                    className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors"
                    style={{
                      backgroundColor: atendenteSelecionado === atendente.id
                        ? (theme === 'yoursystem' ? 'rgba(91, 123, 213, 0.15)' : '#E7F8EE')
                        : colors.headerBg,
                      border: `2px solid ${atendenteSelecionado === atendente.id ? colors.primary : 'transparent'}`,
                      opacity: !atendente.status_online ? 0.5 : 1,
                    }}
                  >
                    <div className="flex items-center flex-1 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full mr-3 flex-shrink-0 ${
                        atendente.status_online ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium truncate" style={{ color: colors.textPrimary }}>
                          {atendente.nome}
                        </p>
                        <p className="text-[13px] truncate" style={{ color: colors.textSecondary }}>
                          {atendente.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-3">
                      {atendente.atendimentos_ativos > 0 && (
                        <span className="text-[12px] px-2 py-1 rounded-full"
                          style={{ color: colors.textSecondary, backgroundColor: colors.inputBg }}
                        >
                          {atendente.atendimentos_ativos} ativos
                        </span>
                      )}
                      {atendenteSelecionado === atendente.id && (
                        <span className="text-xl" style={{ color: colors.primary }}>→</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observacao */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              Observacao (opcional):
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Adicione uma observacao para o proximo atendente..."
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
            onClick={handleTransferir}
            disabled={!atendenteSelecionado || loading}
            className="px-5 py-2 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-2 text-[14.5px] font-medium"
            style={{
              background: theme === 'yoursystem'
                ? 'linear-gradient(135deg, #4B7BEC 0%, #6C8EE6 100%)'
                : 'linear-gradient(135deg, #00A884 0%, #25D366 100%)'
            }}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
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
