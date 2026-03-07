import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Avatar } from '../Avatar/Avatar';
import './EquipeOnline.css';

interface Membro {
  id: number;
  nome_exibicao: string;
  status: string;
  foto_url: string | null;
  total_chats_ativos: number;
}

export const EquipeOnline: React.FC = () => {
  const [equipe, setEquipe] = useState<Membro[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarEquipe();
    // Polling reduzido - atualizações em tempo real vêm via WebSocket
    const interval = setInterval(carregarEquipe, 120000); // Atualiza a cada 2min (backup)
    return () => clearInterval(interval);
  }, []);

  const carregarEquipe = async () => {
    try {
      const response = await api.get('/atendente/equipe-online');
      setEquipe(response.data);
    } catch (error) {
      console.error('Erro ao carregar equipe:', error);
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <div className="equipe-container">
        <div className="equipe-header">
          <h3>Equipe</h3>
        </div>
        <div className="equipe-loading">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="equipe-container">
      <div className="equipe-header">
        <h3>Equipe</h3>
        <span className="equipe-count">
          {equipe.filter((m) => m.status === 'online').length} online
        </span>
      </div>

      <div className="equipe-lista">
        {equipe.map((membro) => (
          <div key={membro.id} className="membro-item">
            <Avatar
              src={membro.foto_url}
              name={membro.nome_exibicao}
              size="medium"
              status={membro.status as 'online' | 'offline' | 'ausente'}
            />

            <div className="membro-info">
              <span className="membro-nome">{membro.nome_exibicao}</span>
              <span className="membro-status">
                {getStatusText(membro.status)}
                {membro.status === 'online' && membro.total_chats_ativos > 0 && (
                  <span className="chats-count">
                    {' '}
                    • {membro.total_chats_ativos}{' '}
                    {membro.total_chats_ativos === 1 ? 'chat' : 'chats'}
                  </span>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
