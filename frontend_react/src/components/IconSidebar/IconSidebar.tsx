import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BsChatDots, BsGrid, BsPeople, BsRobot, BsFileText, BsMoonStars, BsSun, BsGear, BsCalendarCheck, BsKanban, BsMegaphone, BsPersonVcard } from 'react-icons/bs';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import logoImg from '../../assets/logo.png';
import './IconSidebar.css';

const IconSidebar: React.FC = () => {
  const { user } = useAuth();
  const { theme, colors, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const role = user?.role || 'atendente';
  const basePath = role === 'empresa' ? '/empresa' : '/atendente';

  const navItems = [
    { icon: BsChatDots, label: 'Chat', path: `${basePath}/chat`, alwaysShow: true },
    { icon: BsGrid, label: 'Dashboard', path: `${basePath}/dashboard`, alwaysShow: true },
    { icon: BsPeople, label: 'Contatos', path: '/empresa/contatos', alwaysShow: role === 'empresa' },
    { icon: BsPersonVcard, label: 'Clientes', path: '/empresa/clientes', alwaysShow: role === 'empresa' },
    { icon: BsRobot, label: 'Bot Builder', path: '/empresa/bot-builder', alwaysShow: role === 'empresa' },
    { icon: BsFileText, label: 'Templates', path: '/empresa/templates', alwaysShow: role === 'empresa' },
    { icon: BsCalendarCheck, label: 'Agenda', path: '/empresa/agenda', alwaysShow: role === 'empresa' },
    { icon: BsKanban, label: 'Funil de Vendas', path: '/empresa/kanban', alwaysShow: role === 'empresa' },
    { icon: BsMegaphone, label: 'Envio em Massa', path: '/empresa/envio-massa', alwaysShow: role === 'empresa' },
  ].filter(item => item.alwaysShow);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div
      className="icon-sidebar"
      style={{
        backgroundColor: theme === 'yoursystem' ? '#121314' : colors.iconSidebarBg,
        borderRight: `1px solid rgba(255,255,255,0.06)`,
      }}
    >
      {/* Logo */}
      <div className="icon-sidebar-logo">
        <img
          src={logoImg}
          alt="Your System"
          style={{
            width: 42,
            height: 42,
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>

      {/* Nav Icons */}
      <div className="icon-sidebar-nav">
        {navItems.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`icon-sidebar-btn ${active ? 'active' : ''}`}
              title={item.label}
              style={{
                color: active ? colors.accent : colors.textSecondary,
              }}
            >
              {active && (
                <div
                  className="icon-sidebar-active-bar"
                  style={{ backgroundColor: colors.accent }}
                />
              )}
              <Icon size={22} />
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div className="icon-sidebar-separator" />

      {/* Utility Icons */}
      <div className="icon-sidebar-utils">
        <button
          onClick={toggleTheme}
          className="icon-sidebar-btn"
          title={theme === 'yoursystem' ? 'Tema claro' : 'Tema escuro'}
          style={{ color: colors.textSecondary }}
        >
          {theme === 'yoursystem' ? <BsSun size={20} /> : <BsMoonStars size={20} />}
        </button>

        <button
          className="icon-sidebar-btn"
          title="Configuracoes"
          style={{ color: colors.textSecondary }}
        >
          <BsGear size={20} />
        </button>
      </div>

    </div>
  );
};

export default IconSidebar;
