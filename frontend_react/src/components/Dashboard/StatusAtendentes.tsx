import React, { useState } from 'react';
import './StatusAtendentes.css';
import { atendentesApi } from '../../services/api';

interface Atendente {
  id: number;
  nome_exibicao: string;
  email: string;
  status: string;
  total_chats_ativos: number;
  foto_url?: string;
}

interface StatusAtendentesProps {
  atendentes: Atendente[];
  onNovoAtendente?: () => void;
  onAtendenteRemovido?: (id: number) => void;
}

export const StatusAtendentes: React.FC<StatusAtendentesProps> = ({
  atendentes,
  onNovoAtendente,
  onAtendenteRemovido,
}) => {
  const [deletandoId, setDeletandoId] = useState<number | null>(null);

  const handleDeletar = async (atendente: Atendente) => {
    const confirmado = window.confirm(
      `Remover atendente "${atendente.nome_exibicao}"?\n\nAtendimentos ativos serão devolvidos para a fila. Esta ação não pode ser desfeita.`
    );
    if (!confirmado) return;

    try {
      setDeletandoId(atendente.id);
      await atendentesApi.deletar(atendente.id);
      onAtendenteRemovido?.(atendente.id);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Erro ao remover atendente');
    } finally {
      setDeletandoId(null);
    }
  };
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return '🟢';
      case 'ausente':
        return '🟡';
      default:
        return '⚫';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'ausente':
        return 'Ausente';
      default:
        return 'Offline';
    }
  };

  return (
    <div className="status-atendentes-container">
      <div className="status-header">
        <h3 className="status-title">Atendentes</h3>
        {onNovoAtendente && (
          <button className="btn-novo-atendente" onClick={onNovoAtendente}>
            + Adicionar
          </button>
        )}
      </div>

      <div className="atendentes-lista">
        {atendentes.length === 0 ? (
          <div className="atendentes-empty">
            <p>Nenhum atendente cadastrado</p>
            {onNovoAtendente && (
              <button className="btn-primeiro-atendente" onClick={onNovoAtendente}>
                Cadastrar Primeiro Atendente
              </button>
            )}
          </div>
        ) : (
          atendentes.map((atendente) => (
            <div key={atendente.id} className="atendente-card">
              <div className="atendente-avatar">
                {atendente.foto_url ? (
                  <img src={atendente.foto_url} alt={atendente.nome_exibicao} />
                ) : (
                  <div className="avatar-iniciais">
                    {atendente.nome_exibicao
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .substring(0, 2)
                      .toUpperCase()}
                  </div>
                )}
              </div>

              <div className="atendente-info">
                <div className="atendente-nome">{atendente.nome_exibicao}</div>
                <div className="atendente-status">
                  <span className="status-icon">{getStatusIcon(atendente.status)}</span>
                  <span className="status-text">{getStatusText(atendente.status)}</span>
                </div>
              </div>

              <div className="atendente-stats">
                <div className="stat-badge">
                  {atendente.total_chats_ativos} chats
                </div>
                {onAtendenteRemovido && (
                  <button
                    className="btn-deletar-atendente"
                    onClick={() => handleDeletar(atendente)}
                    disabled={deletandoId === atendente.id}
                    title="Remover atendente"
                  >
                    {deletandoId === atendente.id ? '...' : '🗑'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
