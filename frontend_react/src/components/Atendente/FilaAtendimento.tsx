import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import './FilaAtendimento.css';

interface ConversaFila {
  whatsapp_number: string;
  cliente_nome: string;
  status: string;
  ultima_mensagem: string | null;
  ultima_mensagem_timestamp: string | null;
  tempo_espera_minutos: number | null;
  total_mensagens_pendentes: number;
}

interface FilaAtendimentoProps {
  onAssumirConversa: () => void;
  onNavigateToChat?: (whatsappNumber: string) => void;
}

export const FilaAtendimento: React.FC<FilaAtendimentoProps> = ({ onAssumirConversa, onNavigateToChat }) => {
  const [conversas, setConversas] = useState<ConversaFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [assumindo, setAssumindo] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todas' | 'bot' | 'aguardando'>('todas');

  useEffect(() => {
    carregarFila();
    // Polling reduzido - atualizações em tempo real vêm via WebSocket
    const interval = setInterval(carregarFila, 60000); // Atualiza a cada 60s (backup)
    return () => clearInterval(interval);
  }, []);

  const carregarFila = async () => {
    try {
      const response = await api.get('/atendente/fila');
      setConversas(response.data);
    } catch (error) {
      console.error('Erro ao carregar fila:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssumirConversa = async (whatsappNumber: string) => {
    try {
      setAssumindo(whatsappNumber);
      await api.post(`/atendente/assumir/${whatsappNumber}`);
      onAssumirConversa();
      if (onNavigateToChat) {
        onNavigateToChat(whatsappNumber);
      } else {
        carregarFila();
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Erro ao assumir conversa');
      setAssumindo(null);
    }
  };

  const formatarTempo = (minutos: number | null) => {
    if (!minutos) return '0m';
    if (minutos < 60) return `${minutos}m`;
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return `${horas}h ${mins}m`;
  };

  const formatarTimestamp = (timestamp: string | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const getCorStatus = (status: string) => {
    return status === 'bot' ? '#10b981' : '#f59e0b';
  };

  const conversasFiltradas = conversas.filter((conversa) => {
    if (filtro === 'todas') return true;
    return conversa.status === filtro;
  });

  if (loading) {
    return (
      <div className="fila-container">
        <div className="fila-header">
          <h3>Fila de Atendimento</h3>
        </div>
        <div className="fila-loading">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="fila-container">
      <div className="fila-header">
        <h3>Fila de Atendimento</h3>
        <span className="fila-count">{conversasFiltradas.length} na fila</span>
      </div>

      <div className="fila-filtros">
        <button
          className={filtro === 'todas' ? 'filtro-btn active' : 'filtro-btn'}
          onClick={() => setFiltro('todas')}
        >
          Todas ({conversas.length})
        </button>
        <button
          className={filtro === 'bot' ? 'filtro-btn active' : 'filtro-btn'}
          onClick={() => setFiltro('bot')}
        >
          Bot ({conversas.filter((c) => c.status === 'bot').length})
        </button>
        <button
          className={filtro === 'aguardando' ? 'filtro-btn active' : 'filtro-btn'}
          onClick={() => setFiltro('aguardando')}
        >
          Aguardando ({conversas.filter((c) => c.status === 'aguardando').length})
        </button>
      </div>

      {conversasFiltradas.length === 0 ? (
        <div className="fila-empty">
          <div className="empty-icon">✅</div>
          <p>Nenhuma conversa na fila</p>
          <span className="empty-subtitle">Você está em dia com os atendimentos!</span>
        </div>
      ) : (
        <div className="fila-lista">
          {conversasFiltradas.map((conversa) => (
            <div key={conversa.whatsapp_number} className="conversa-card">
              <div className="conversa-header">
                <div className="conversa-info">
                  <span className="conversa-nome">{conversa.cliente_nome}</span>
                  <span className="conversa-whatsapp">{conversa.whatsapp_number}</span>
                </div>
                <div className="conversa-badges">
                  <span
                    className="status-badge"
                    style={{ backgroundColor: getCorStatus(conversa.status) }}
                  >
                    {conversa.status}
                  </span>
                  {conversa.total_mensagens_pendentes > 0 && (
                    <span className="mensagens-badge">
                      {conversa.total_mensagens_pendentes} msg
                    </span>
                  )}
                </div>
              </div>

              {conversa.ultima_mensagem && (
                <div className="conversa-ultima-msg">
                  <span className="msg-texto">{conversa.ultima_mensagem}</span>
                  <span className="msg-horario">
                    {formatarTimestamp(conversa.ultima_mensagem_timestamp)}
                  </span>
                </div>
              )}

              <div className="conversa-footer">
                <div className="conversa-tempo">
                  <span className="tempo-icon">⏱️</span>
                  <span>Esperando há {formatarTempo(conversa.tempo_espera_minutos)}</span>
                </div>
                <button
                  className="btn-assumir"
                  onClick={() => handleAssumirConversa(conversa.whatsapp_number)}
                  disabled={assumindo === conversa.whatsapp_number}
                >
                  {assumindo === conversa.whatsapp_number ? 'Assumindo...' : 'Assumir'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
