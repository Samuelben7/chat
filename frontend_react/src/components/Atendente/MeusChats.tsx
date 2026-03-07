import React from 'react';
import './MeusChats.css';
import { Avatar } from '../Avatar/Avatar';

interface ConversaAtiva {
  whatsapp_number: string;
  cliente_nome: string;
  status: string;
  atribuido_em: string | null;
  ultima_mensagem: string | null;
  ultima_mensagem_timestamp: string | null;
  mensagens_nao_lidas: number;
}

interface MeusChatsProps {
  conversas: ConversaAtiva[];
  onSelecionarConversa: (whatsappNumber: string) => void;
  loading?: boolean;
}

export const MeusChats: React.FC<MeusChatsProps> = ({
  conversas,
  onSelecionarConversa,
  loading = false,
}) => {
  const formatarTimestamp = (timestamp: string | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    if (date.toDateString() === hoje.toDateString()) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === ontem.toDateString()) {
      return 'Ontem';
    } else {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }
  };

  if (loading) {
    return (
      <div className="meus-chats-container">
        <div className="meus-chats-header">
          <h3>Meus Atendimentos</h3>
        </div>
        <div className="meus-chats-loading">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="meus-chats-container">
      <div className="meus-chats-header">
        <h3>Meus Atendimentos</h3>
        <span className="chats-count">{conversas.length}</span>
      </div>

      {conversas.length === 0 ? (
        <div className="meus-chats-empty">
          <div className="empty-icon">💬</div>
          <p>Nenhum atendimento ativo</p>
          <span className="empty-subtitle">Assuma conversas da fila para começar</span>
        </div>
      ) : (
        <div className="chats-lista">
          {conversas.map((conversa) => (
            <div
              key={conversa.whatsapp_number}
              className="chat-item"
              onClick={() => onSelecionarConversa(conversa.whatsapp_number)}
            >
              <div className="chat-avatar">
                <Avatar
                  src={null}
                  name={conversa.cliente_nome}
                  size="medium"
                  status={null}
                />
              </div>

              <div className="chat-content">
                <div className="chat-header">
                  <span className="chat-nome">{conversa.cliente_nome}</span>
                  <span className="chat-horario">
                    {formatarTimestamp(conversa.ultima_mensagem_timestamp)}
                  </span>
                </div>

                <div className="chat-preview">
                  <span className="preview-texto">
                    {conversa.ultima_mensagem || 'Sem mensagens'}
                  </span>
                  {conversa.mensagens_nao_lidas > 0 && (
                    <span className="chat-badge">{conversa.mensagens_nao_lidas}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
