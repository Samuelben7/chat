import React, { useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../contexts/AuthContext';
import { chatApi } from '../../services/api';
import { ConversaPreview } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BsSearch } from 'react-icons/bs';
import { useTheme } from '../../contexts/ThemeContext';

const AVATAR_COLORS = ['#CE423D', '#FDE6A5', '#4AAD67', '#A7D5FE'];
const AVATAR_TEXT_COLORS: Record<string, string> = {
  '#CE423D': '#ffffff',
  '#FDE6A5': '#333333',
  '#4AAD67': '#ffffff',
  '#A7D5FE': '#333333',
};

const getAvatarColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

interface ConversaItemProps {
  conversa: ConversaPreview;
  selecionada: boolean;
  onClick: () => void;
  conversaSelecionada: string | null;
}

const ConversaItem: React.FC<ConversaItemProps> = ({ conversa, selecionada, onClick, conversaSelecionada }) => {
  const { theme, colors } = useTheme();

  const formatarTempo = (timestamp?: string) => {
    if (!timestamp) return '';
    try {
      return formatDistanceToNow(new Date(timestamp), {
        addSuffix: false,
        locale: ptBR,
      });
    } catch {
      return '';
    }
  };

  const statusColor = {
    bot: 'bg-gray-400',
    aguardando: 'bg-yellow-400',
    em_atendimento: theme === 'yoursystem' ? 'bg-blue-400' : 'bg-green-500',
    finalizado: 'bg-gray-300',
  }[conversa.status] || 'bg-gray-400';

  // Iniciais do nome para avatar quadrado
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const nome = conversa.cliente_nome || conversa.whatsapp_number;

  return (
    <div
      onClick={onClick}
      className="flex items-center px-2 py-1.5 cursor-pointer transition-all mx-2 my-0.5"
      style={{
        backgroundColor: selecionada
          ? (theme === 'yoursystem' ? '#2e343d' : '#F0F2F5')
          : 'transparent',
        borderRadius: '12px',
      }}
      onMouseEnter={(e) => {
        if (!selecionada) {
          e.currentTarget.style.backgroundColor = theme === 'yoursystem'
            ? 'rgba(255,255,255,0.04)' : '#f5f6f6';
        }
      }}
      onMouseLeave={(e) => {
        if (!selecionada) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      {/* Avatar quadrado com bordas suaves */}
      <div className="relative flex-shrink-0">
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: '10px',
            background: theme === 'yoursystem'
              ? getAvatarColor(nome)
              : `linear-gradient(135deg, #00A884 0%, #25D366 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 700,
            color: theme === 'yoursystem' ? AVATAR_TEXT_COLORS[getAvatarColor(nome)] : 'white',
            letterSpacing: '0.5px',
          }}
        >
          {getInitials(nome)}
        </div>
        <div
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${statusColor}`}
          style={{ borderColor: selecionada && theme === 'yoursystem' ? '#2e343d' : colors.sidebarBg }}
        />
      </div>

      {/* Info */}
      <div className="ml-2.5 flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <p
              className="font-medium text-[13.5px] truncate"
              style={{ color: colors.textPrimary }}
            >
              {nome}
            </p>
            {(conversa.status === 'bot' || conversa.status === 'aguardando') && !conversa.atendente_nome && (
              <span
                className="text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase flex-shrink-0"
                style={{
                  background: theme === 'yoursystem'
                    ? 'linear-gradient(135deg, #4B7BEC 0%, #6C8EE6 100%)'
                    : '#25D366'
                }}
              >
                NOVO
              </span>
            )}
          </div>
          <span className="text-[11px] ml-1.5 flex-shrink-0" style={{ color: colors.textSecondary }}>
            {formatarTempo(conversa.timestamp)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[12px] truncate flex-1 leading-4" style={{ color: colors.textSecondary }}>
            {conversa.ultima_mensagem || 'Sem mensagens'}
          </p>

          {conversa.nao_lidas > 0 && conversa.whatsapp_number !== conversaSelecionada && (
            <span
              className="ml-1.5 flex-shrink-0 text-white text-[11px] font-bold rounded-full min-w-[20px] h-[20px] px-1.5 flex items-center justify-center"
              style={{ backgroundColor: colors.primary }}
            >
              {conversa.nao_lidas > 99 ? '99+' : conversa.nao_lidas}
            </span>
          )}
        </div>

        {conversa.atendente_nome && (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: colors.accent }}>
            {conversa.atendente_nome}
          </p>
        )}
      </div>
    </div>
  );
};

const Sidebar: React.FC = () => {
  const { token } = useAuth();
  const { theme, colors } = useTheme();
  const {
    conversas,
    conversaSelecionada,
    loadingConversas,
    setConversas,
    setSelecionarConversa,
    setLoadingConversas,
  } = useChatStore();

  const [filtro, setFiltro] = React.useState('');
  const [statusFiltro, setStatusFiltro] = React.useState<string>('');

  const statusOptions = [
    { value: '', label: 'Todos' },
    { value: 'bot', label: 'Bot' },
    { value: 'aguardando', label: 'Aguardando' },
    { value: 'em_atendimento', label: 'Ativos' },
    { value: 'finalizado', label: 'Finalizados' },
  ];

  useEffect(() => {
    carregarConversas();
    const interval = setInterval(carregarConversas, 60000);
    return () => clearInterval(interval);
  }, [statusFiltro]);

  const carregarConversas = async () => {
    try {
      setLoadingConversas(true);
      const dados = await chatApi.listarConversas(statusFiltro || undefined);
      setConversas(dados);
    } catch (error) {
      console.error('Erro ao carregar conversas:', error);
    } finally {
      setLoadingConversas(false);
    }
  };

  const conversasFiltradas = conversas.filter((conv) =>
    conv.whatsapp_number.includes(filtro) ||
    conv.ultima_mensagem?.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div
      className="w-full md:w-[300px] border-r flex flex-col h-screen pb-14 md:pb-0"
      style={{
        backgroundColor: colors.sidebarBg,
        borderColor: colors.border
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-3 border-b"
        style={{
          backgroundColor: colors.sidebarBg,
          borderColor: colors.border
        }}
      >
        {/* Search */}
        <div className="relative mb-2.5">
          <BsSearch
            className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10"
            style={{ color: colors.textSecondary }}
            size={14}
          />
          <input
            type="text"
            placeholder="Search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl focus:outline-none text-[13px]"
            style={{
              backgroundColor: theme === 'yoursystem' ? '#252840' : colors.inputBg,
              color: colors.textPrimary,
              border: 'none',
            }}
          />
        </div>

        {/* Status filter pills - scrollable */}
        <div className="flex flex-wrap gap-1.5">
          <style>{``}</style>
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFiltro(opt.value)}
              className="px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors flex-shrink-0"
              style={{
                backgroundColor: statusFiltro === opt.value
                  ? (theme === 'yoursystem' ? 'rgba(75, 123, 236, 0.2)' : 'rgba(0, 168, 132, 0.15)')
                  : (theme === 'yoursystem' ? '#252840' : '#f0f0f0'),
                color: theme === 'yoursystem'
                  ? '#ffffff'
                  : (statusFiltro === opt.value ? colors.accent : colors.textSecondary),
                border: 'none',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de conversas */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar py-1"
        style={{ backgroundColor: colors.sidebarBg }}
      >
        {loadingConversas && conversas.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div
              className="animate-spin rounded-full h-7 w-7 border-b-2"
              style={{ borderColor: colors.primary }}
            ></div>
          </div>
        ) : conversasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 px-6">
            <p className="text-[13px] text-center" style={{ color: colors.textSecondary }}>
              Nenhuma conversa encontrada
            </p>
          </div>
        ) : (
          conversasFiltradas.map((conversa) => (
            <ConversaItem
              key={conversa.whatsapp_number}
              conversa={conversa}
              selecionada={conversaSelecionada === conversa.whatsapp_number}
              onClick={() => setSelecionarConversa(conversa.whatsapp_number)}
              conversaSelecionada={conversaSelecionada}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div
        className="px-3 py-1.5 border-t"
        style={{
          backgroundColor: colors.sidebarBg,
          borderColor: colors.border
        }}
      >
        <p className="text-[11px] text-center" style={{ color: colors.textSecondary }}>
          {conversasFiltradas.length} {conversasFiltradas.length === 1 ? 'conversa' : 'conversas'}
        </p>
      </div>
    </div>
  );
};

export default Sidebar;
