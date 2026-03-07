import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BsChatDots, BsGrid, BsPeople, BsRobot, BsFileText, BsSun, BsMoonStars } from 'react-icons/bs';
import IconSidebar from '../components/IconSidebar/IconSidebar';
import Sidebar from '../components/Sidebar/Sidebar';
import Chat from '../components/Chat/Chat';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast/Toast';
import { useChatStore } from '../store/chatStore';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const ChatPage: React.FC = () => {
  const { toasts, removeToast } = useToast();
  const { conversaSelecionada, limparConversaSelecionada, setSelecionarConversa } = useChatStore();
  const { user } = useAuth();
  const { colors, theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // Ao montar via navegação com state (ex: Kanban) ou query param ?whatsapp=
  useEffect(() => {
    const openConv = location.state?.openConversation as string | undefined;
    if (openConv) {
      setSelecionarConversa(openConv);
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }
    // Suporte a ?whatsapp=NUMBER (vindo do DashboardAtendente)
    const params = new URLSearchParams(location.search);
    const whatsapp = params.get('whatsapp');
    if (whatsapp) {
      setSelecionarConversa(whatsapp);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, []);

  const role = user?.role || 'atendente';
  const basePath = role === 'empresa' ? '/empresa' : '/atendente';

  const navItems = [
    { icon: BsChatDots, label: 'Chat', path: `${basePath}/chat`, show: true },
    { icon: BsGrid, label: 'Dashboard', path: `${basePath}/dashboard`, show: true },
    { icon: BsPeople, label: 'Contatos', path: '/empresa/contatos', show: role === 'empresa' },
    { icon: BsRobot, label: 'Bot', path: '/empresa/bot-builder', show: role === 'empresa' },
    { icon: BsFileText, label: 'Templates', path: '/empresa/templates', show: role === 'empresa' },
  ].filter(item => item.show);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="flex overflow-hidden" style={{ height: '100dvh' }}>
      {/* Icon Sidebar - desktop only (CSS hides on mobile) */}
      <IconSidebar />

      {/* Sidebar - always visible on desktop; on mobile, hidden when a conversation is open */}
      <div className={conversaSelecionada ? 'hidden md:block' : 'block'}>
        <Sidebar />
      </div>

      {/* Chat area - always visible on desktop; on mobile, only when a conversation is selected */}
      <div className={conversaSelecionada ? 'flex flex-1 flex-col min-h-0' : 'hidden md:flex flex-1 flex-col min-h-0'}>
        <Chat onVoltar={limparConversaSelecionada} />
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t"
        style={{
          backgroundColor: colors.headerBg,
          borderColor: colors.border,
          height: '56px',
        }}
      >
        {navItems.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          const isChatItem = item.path === `${basePath}/chat`;
          return (
            <button
              key={item.path}
              onClick={() => {
                // Botão do chat no mobile: se já estiver numa conversa, volta para a lista
                if (isChatItem && conversaSelecionada) {
                  limparConversaSelecionada();
                } else {
                  navigate(item.path);
                }
              }}
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all"
              style={{
                color: active ? colors.primary : colors.textSecondary,
                backgroundColor: active ? `${colors.primary}1a` : 'transparent',
              }}
            >
              <Icon size={20} />
              <span style={{ fontSize: '10px', fontWeight: active ? 600 : 400 }}>
                {/* No mobile, quando há conversa aberta o botão Chat vira "Conversas" */}
                {isChatItem && conversaSelecionada ? 'Conversas' : item.label}
              </span>
            </button>
          );
        })}

        {/* Botão de alternar tema (mobile) */}
        <button
          onClick={toggleTheme}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all"
          style={{ color: colors.textSecondary }}
          title="Alternar tema"
        >
          {theme === 'yoursystem' ? <BsSun size={20} /> : <BsMoonStars size={20} />}
          <span style={{ fontSize: '10px' }}>Tema</span>
        </button>
      </nav>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default ChatPage;
