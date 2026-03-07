import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeType = 'whatsapp' | 'yoursystem';

interface ThemeColors {
  primary: string;
  secondary: string;
  headerBg: string;
  sidebarBg: string;
  chatBg: string;
  messageSent: string;
  messageReceived: string;
  inputBg: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  accent: string;
  iconSidebarBg: string;
  // Dashboard & UI expandido
  dashboardBg: string;
  cardBg: string;
  cardShadow: string;
  hoverBg: string;
  inputBorder: string;
  inputFocusBorder: string;
  gradient: string;
  gradientButton: string;
  chartLine1: string;
  chartLine2: string;
  chartLine3: string;
  chartGrid: string;
  // Donut chart colors
  donutActive: string;
  donutWaiting: string;
  donutFinished: string;
  donutBot: string;
  donutSent: string;
  donutReceived: string;
  // Tooltip / modal
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  modalOverlay: string;
  // Status
  statusOnline: string;
  statusOffline: string;
}

const themes: Record<ThemeType, ThemeColors> = {
  whatsapp: {
    primary: '#00A884',
    secondary: '#25D366',
    headerBg: '#F0F2F5',
    sidebarBg: '#FFFFFF',
    chatBg: '#E5DDD5',
    messageSent: '#D9FDD3',
    messageReceived: '#FFFFFF',
    inputBg: '#F0F0F0',
    textPrimary: '#111B21',
    textSecondary: '#667781',
    border: '#E9EDEF',
    accent: '#00A884',
    iconSidebarBg: '#F0F2F5',
    // Dashboard
    dashboardBg: '#f5f7fa',
    cardBg: '#FFFFFF',
    cardShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    hoverBg: '#f9fafb',
    inputBorder: '#e5e7eb',
    inputFocusBorder: '#00A884',
    gradient: 'linear-gradient(135deg, #00A884 0%, #25D366 100%)',
    gradientButton: 'linear-gradient(135deg, #00A884 0%, #25D366 100%)',
    chartLine1: '#00A884',
    chartLine2: '#25D366',
    chartLine3: '#FFB800',
    chartGrid: '#E9EDEF',
    // Donut
    donutActive: '#00A884',
    donutWaiting: '#FFB800',
    donutFinished: '#667781',
    donutBot: '#E9EDEF',
    donutSent: '#25D366',
    donutReceived: '#00A884',
    // Tooltip
    tooltipBg: '#FFFFFF',
    tooltipBorder: '#E9EDEF',
    tooltipText: '#111B21',
    modalOverlay: 'rgba(0, 0, 0, 0.5)',
    // Status
    statusOnline: '#25D366',
    statusOffline: '#667781',
  },
  yoursystem: {
    primary: '#4B6EC5',
    secondary: '#5A7FD4',
    headerBg: '#202329',
    sidebarBg: '#202329',
    chatBg: '#202329',
    messageSent: '#7190EF',
    messageReceived: '#2A2F45',
    inputBg: '#202329',
    textPrimary: '#dfe1e8',
    textSecondary: '#6B7085',
    border: '#2d3148',
    accent: '#4B6EC5',
    iconSidebarBg: '#0f1119',
    // Dashboard
    dashboardBg: '#0f1119',
    cardBg: '#212534',
    cardShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
    hoverBg: 'rgba(75, 110, 197, 0.06)',
    inputBorder: 'rgba(75, 110, 197, 0.2)',
    inputFocusBorder: '#4B6EC5',
    gradient: 'linear-gradient(135deg, #4B6EC5 0%, #5A7FD4 100%)',
    gradientButton: 'linear-gradient(135deg, #4B6EC5 0%, #5A7FD4 100%)',
    chartLine1: '#4B6EC5',
    chartLine2: '#5A7FD4',
    chartLine3: '#f59e0b',
    chartGrid: '#2d3148',
    // Donut
    donutActive: '#4B6EC5',
    donutWaiting: '#f59e0b',
    donutFinished: '#6b7280',
    donutBot: '#2d3148',
    donutSent: '#5A7FD4',
    donutReceived: '#4B6EC5',
    // Tooltip
    tooltipBg: '#212534',
    tooltipBorder: '#2d3148',
    tooltipText: '#dfe1e8',
    modalOverlay: 'rgba(0, 0, 0, 0.8)',
    // Status
    statusOnline: '#4B6EC5',
    statusOffline: '#6b7280',
  },
};

interface ThemeContextType {
  theme: ThemeType;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeType>(() => {
    const saved = localStorage.getItem('chat-theme');
    return (saved as ThemeType) || 'yoursystem';
  });

  const colors = themes[theme];

  useEffect(() => {
    localStorage.setItem('chat-theme', theme);

    // Aplicar CSS variables
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', colors.primary);
    root.style.setProperty('--theme-secondary', colors.secondary);
    root.style.setProperty('--theme-header-bg', colors.headerBg);
    root.style.setProperty('--theme-sidebar-bg', colors.sidebarBg);
    root.style.setProperty('--theme-chat-bg', colors.chatBg);
    root.style.setProperty('--theme-message-sent', colors.messageSent);
    root.style.setProperty('--theme-message-received', colors.messageReceived);
    root.style.setProperty('--theme-input-bg', colors.inputBg);
    root.style.setProperty('--theme-text-primary', colors.textPrimary);
    root.style.setProperty('--theme-text-secondary', colors.textSecondary);
    root.style.setProperty('--theme-border', colors.border);
    root.style.setProperty('--theme-accent', colors.accent);
    root.style.setProperty('--theme-icon-sidebar-bg', colors.iconSidebarBg);
    // Dashboard & UI expandido
    root.style.setProperty('--theme-dashboard-bg', colors.dashboardBg);
    root.style.setProperty('--theme-card-bg', colors.cardBg);
    root.style.setProperty('--theme-card-shadow', colors.cardShadow);
    root.style.setProperty('--theme-hover-bg', colors.hoverBg);
    root.style.setProperty('--theme-input-border', colors.inputBorder);
    root.style.setProperty('--theme-input-focus-border', colors.inputFocusBorder);
    root.style.setProperty('--theme-gradient', colors.gradient);
    root.style.setProperty('--theme-gradient-button', colors.gradientButton);
    root.style.setProperty('--theme-chart-line-1', colors.chartLine1);
    root.style.setProperty('--theme-chart-line-2', colors.chartLine2);
    root.style.setProperty('--theme-chart-line-3', colors.chartLine3);
    root.style.setProperty('--theme-chart-grid', colors.chartGrid);
    root.style.setProperty('--theme-tooltip-bg', colors.tooltipBg);
    root.style.setProperty('--theme-tooltip-border', colors.tooltipBorder);
    root.style.setProperty('--theme-tooltip-text', colors.tooltipText);
    root.style.setProperty('--theme-modal-overlay', colors.modalOverlay);
    root.style.setProperty('--theme-status-online', colors.statusOnline);
    root.style.setProperty('--theme-status-offline', colors.statusOffline);
    // Aliases para compatibilidade com portfolio CSS
    root.style.setProperty('--primary-color', colors.primary);
    root.style.setProperty('--secondary-color', colors.secondary);
    root.style.setProperty('--dark-bg', colors.dashboardBg);
    root.style.setProperty('--card-bg', colors.cardBg);
    root.style.setProperty('--text-primary', colors.textPrimary);
    root.style.setProperty('--text-secondary', colors.textSecondary);
    root.style.setProperty('--gradient-2', colors.gradient);
  }, [theme, colors]);

  const toggleTheme = () => {
    setThemeState(prev => prev === 'whatsapp' ? 'yoursystem' : 'whatsapp');
  };

  const setTheme = (newTheme: ThemeType) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
