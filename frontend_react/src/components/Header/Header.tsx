import React from 'react';
import { ConversaDetalhes } from '../../types';
import { BsThreeDotsVertical, BsArrowLeft, BsSearch, BsBoxArrowRight, BsArrowRepeat, BsXCircle, BsPersonFillExclamation } from 'react-icons/bs';
import { Avatar } from '../Avatar/Avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { chatApi } from '../../services/api';

interface HeaderProps {
  conversa: ConversaDetalhes | null;
  onVoltar?: () => void;
  onAssumir?: () => void;
  onFinalizar?: () => void;
  onTransferir?: () => void;
  onConversaDeletada?: () => void;
}

const Header: React.FC<HeaderProps> = ({
  conversa,
  onVoltar,
  onAssumir,
  onFinalizar,
  onTransferir,
  onConversaDeletada,
}) => {
  const [menuAberto, setMenuAberto] = React.useState(false);
  const [deletando, setDeletando] = React.useState(false);
  const { theme, colors } = useTheme();
  const { user } = useAuth();

  const isEmpresa = user?.role === 'empresa';

  const handleDeletarConversa = async () => {
    if (!conversa) return;
    const ok = window.confirm(
      `Apagar toda a conversa com ${conversa.cliente?.nome_completo || conversa.whatsapp_number}?\n\nTodas as mensagens serão removidas. Esta ação não pode ser desfeita.`
    );
    if (!ok) return;
    try {
      setDeletando(true);
      await chatApi.deletarConversa(conversa.whatsapp_number);
      setMenuAberto(false);
      onConversaDeletada?.();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Erro ao apagar conversa');
    } finally {
      setDeletando(false);
    }
  };
  // Empresa pode assumir controle de atendente humano (botão laranja)
  const podeAssumirForca =
    isEmpresa &&
    conversa?.atendimento?.status === 'em_atendimento' &&
    conversa?.atendimento?.atendente_id != null &&
    !conversa?.atendimento?.atendido_por_ia;

  // Qualquer usuário pode assumir quando: fora de atendimento OU chat gerenciado pela IA
  const podeAssumir =
    conversa?.atendimento?.status !== 'em_atendimento' ||
    conversa?.atendimento?.atendido_por_ia === true ||
    conversa?.atendimento?.atendente_id == null;

  if (!conversa) {
    return (
      <div
        className="border-b p-4 h-[60px] flex items-center justify-center"
        style={{
          backgroundColor: colors.headerBg,
          borderColor: colors.border
        }}
      >
        <p style={{ color: colors.textSecondary }} className="text-sm">
          Selecione uma conversa
        </p>
      </div>
    );
  }

  const statusBadge = {
    bot: { text: 'Bot', color: 'bg-gray-500' },
    aguardando: { text: 'Aguardando', color: 'bg-yellow-500' },
    em_atendimento: { text: 'Em atendimento', color: theme === 'yoursystem' ? 'bg-blue-400' : 'bg-green-500' },
    finalizado: { text: 'Finalizado', color: 'bg-gray-400' },
  }[conversa.atendimento?.status || 'bot'];

  return (
    <div
      className="border-b px-4 py-2.5 min-h-[60px] flex items-center justify-between sticky top-0 z-10 flex-shrink-0"
      style={{
        backgroundColor: colors.headerBg,
        borderColor: colors.border
      }}
    >
      {/* Info do contato */}
      <div className="flex items-center flex-1 min-w-0">
        {/* Botao voltar (mobile) */}
        {onVoltar && (
          <button
            onClick={onVoltar}
            className="mr-3 md:hidden hover:opacity-80 transition-opacity"
            style={{ color: colors.textSecondary }}
          >
            <BsArrowLeft size={22} />
          </button>
        )}

        {/* Avatar */}
        <div className="mr-3 flex-shrink-0">
          <Avatar
            src={null}
            name={conversa.cliente?.nome_completo || conversa.whatsapp_number}
            size="medium"
            status={null}
          />
        </div>

        {/* Nome e status */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <h2
            className="font-medium text-[15px] truncate"
            style={{ color: colors.textPrimary }}
          >
            {conversa.cliente?.nome_completo || conversa.whatsapp_number}
          </h2>
          <div className="flex items-center space-x-2 overflow-hidden">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full text-white ${statusBadge.color} flex-shrink-0`}>
              {statusBadge.text}
            </span>
            {conversa.atendimento?.atendido_por_ia && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
                🤖 IA
              </span>
            )}
            {conversa.cliente && (
              <span className="text-[12px] truncate" style={{ color: colors.textSecondary }}>
                {conversa.cliente.cidade}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Botoes de acao */}
      <div className="flex items-center space-x-1.5 ml-4 flex-shrink-0">
        {/* Assumir — fora de atendimento OU chat gerenciado pela IA */}
        {podeAssumir && onAssumir && (
          <button
            onClick={onAssumir}
            className="flex items-center gap-1 text-white px-2 sm:px-3 py-1.5 rounded-md transition-all text-[12px] font-medium hover:opacity-90"
            style={{
              background: theme === 'yoursystem'
                ? 'linear-gradient(135deg, #4B7BEC 0%, #6C8EE6 100%)'
                : '#25D366'
            }}
            title="Assumir atendimento"
          >
            <BsBoxArrowRight size={14} />
            <span className="hidden xs:inline sm:inline">Assumir</span>
          </button>
        )}

        {/* Assumir Controle — empresa pode tomar de atendente */}
        {podeAssumirForca && onAssumir && (
          <button
            onClick={onAssumir}
            className="flex items-center gap-1 text-white px-2 sm:px-3 py-1.5 rounded-md transition-all text-[12px] font-medium hover:opacity-90"
            style={{ backgroundColor: '#e67e22' }}
            title="Assumir controle deste atendimento"
          >
            <BsPersonFillExclamation size={14} />
            <span className="hidden sm:inline">Assumir</span>
          </button>
        )}

        {/* Transferir */}
        {conversa.atendimento?.status === 'em_atendimento' && onTransferir && (
          <button
            onClick={onTransferir}
            className="flex items-center gap-1 text-white px-2 sm:px-3 py-1.5 rounded-md transition-all text-[12px] font-medium hover:opacity-90"
            style={{
              backgroundColor: theme === 'yoursystem' ? colors.secondary : '#0088cc'
            }}
            title="Transferir atendimento"
          >
            <BsArrowRepeat size={14} />
            <span className="hidden sm:inline">Transferir</span>
          </button>
        )}

        {/* Encerrar */}
        {conversa.atendimento?.status === 'em_atendimento' && onFinalizar && (
          <button
            onClick={onFinalizar}
            className="flex items-center gap-1 text-white px-2 sm:px-3 py-1.5 rounded-md transition-colors text-[12px] font-medium hover:opacity-90"
            style={{ backgroundColor: '#dc3545' }}
            title="Encerrar atendimento"
          >
            <BsXCircle size={14} />
            <span className="hidden sm:inline">Encerrar</span>
          </button>
        )}

        {/* Busca */}
        <button
          className="p-2 rounded-full transition-colors hover:opacity-80"
          style={{ color: colors.textSecondary }}
          title="Buscar mensagens"
        >
          <BsSearch size={18} />
        </button>

        {/* Menu 3 pontos */}
        <div className="relative">
          <button
            onClick={() => setMenuAberto(!menuAberto)}
            className="p-2 rounded-full transition-colors hover:opacity-80"
            style={{ color: colors.textSecondary }}
            title="Menu"
          >
            <BsThreeDotsVertical size={18} />
          </button>

          {menuAberto && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuAberto(false)}
              />
              <div
                className="absolute right-0 mt-2 w-52 rounded-md shadow-xl py-2 z-20"
                style={{
                  backgroundColor: colors.sidebarBg,
                  borderColor: colors.border,
                  borderWidth: '1px'
                }}
              >
                {podeAssumir && onAssumir && (
                  <button
                    onClick={() => { onAssumir(); setMenuAberto(false); }}
                    className="w-full text-left px-5 py-2.5 text-[13px] md:hidden hover:opacity-80 transition-opacity flex items-center gap-2"
                    style={{ color: colors.textPrimary }}
                  >
                    <BsBoxArrowRight size={14} /> Assumir atendimento
                  </button>
                )}

                {conversa.atendimento?.status === 'em_atendimento' && onTransferir && (
                  <button
                    onClick={() => { onTransferir(); setMenuAberto(false); }}
                    className="w-full text-left px-5 py-2.5 text-[13px] md:hidden hover:opacity-80 transition-opacity flex items-center gap-2"
                    style={{ color: colors.textPrimary }}
                  >
                    <BsArrowRepeat size={14} /> Transferir atendimento
                  </button>
                )}

                {conversa.atendimento?.status === 'em_atendimento' && onFinalizar && (
                  <button
                    onClick={() => { onFinalizar(); setMenuAberto(false); }}
                    className="w-full text-left px-5 py-2.5 text-[13px] md:hidden hover:opacity-80 transition-opacity flex items-center gap-2"
                    style={{ color: colors.textPrimary }}
                  >
                    <BsXCircle size={14} /> Finalizar atendimento
                  </button>
                )}

                <button
                  onClick={() => setMenuAberto(false)}
                  className="w-full text-left px-5 py-2.5 text-[13px] hover:opacity-80 transition-opacity"
                  style={{ color: colors.textSecondary }}
                >
                  Ver informacoes
                </button>

                {isEmpresa && (
                  <>
                    <div style={{ borderTop: `1px solid ${colors.border}`, margin: '4px 0' }} />
                    <button
                      onClick={handleDeletarConversa}
                      disabled={deletando}
                      className="w-full text-left px-5 py-2.5 text-[13px] hover:opacity-80 transition-opacity flex items-center gap-2"
                      style={{ color: '#dc3545' }}
                    >
                      🗑 {deletando ? 'Apagando...' : 'Apagar conversa'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Header;
