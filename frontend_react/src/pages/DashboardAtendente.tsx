import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast/Toast';
import { FilaAtendimento } from '../components/Atendente/FilaAtendimento';
import { MeusChats } from '../components/Atendente/MeusChats';
import { EquipeOnline } from '../components/Atendente/EquipeOnline';
import { PerfilAtendente } from '../components/Atendente/PerfilAtendente';
import api from '../services/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Metricas {
  minhas_conversas_ativas: number;
  conversas_na_fila: number;
  tempo_medio_resposta_minutos: number;
  total_mensagens_enviadas_hoje: number;
  total_conversas_assumidas_hoje: number;
}

interface ConversaAtiva {
  whatsapp_number: string;
  cliente_nome: string;
  status: string;
  atribuido_em: string | null;
  ultima_mensagem: string | null;
  ultima_mensagem_timestamp: string | null;
  mensagens_nao_lidas: number;
}

// ─── Temas ────────────────────────────────────────────────────────────────────

type Theme = 'dark' | 'light';

const themes = {
  dark: {
    bg: 'linear-gradient(145deg, #0c0a14 0%, #110d1e 40%, #0e1118 100%)',
    bgSolid: '#0c0a14',
    navBg: 'rgba(12,10,20,0.82)',
    navBorder: 'rgba(139,92,246,0.15)',
    glass: 'rgba(255,255,255,0.045)',
    glassBorder: 'rgba(255,255,255,0.08)',
    glassShadow: '0 4px 30px rgba(0,0,0,0.35)',
    text: '#f0eeff',
    textSec: '#9e97c4',
    textMuted: '#6b6590',
    violet: '#9d71fa',
    amber: '#f4a94e',
    emerald: '#34d399',
    red: '#f87171',
    orb1: 'rgba(139,92,246,0.14)',
    orb2: 'rgba(244,169,78,0.08)',
    shimmer: 'rgba(139,92,246,0.06)',
    scrollThumb: 'rgba(139,92,246,0.3)',
    toggleBg: 'rgba(139,92,246,0.1)',
    subBg: 'transparent',
    subText: '#f0eeff',
    subTextSec: '#6b6590',
    subBorder: 'rgba(255,255,255,0.07)',
    subHover: 'rgba(139,92,246,0.08)',
    subGrad: 'linear-gradient(135deg, #9d71fa, #f4a94e)',
    subFiltroBtn: 'rgba(255,255,255,0.04)',
    subFiltroBtnText: '#9e97c4',
    subFiltroBtnBorder: 'rgba(255,255,255,0.07)',
    avatarBg: 'linear-gradient(135deg, #7c3aed, #9d71fa)',
    badgeBg: 'rgba(139,92,246,0.25)',
    badgeText: '#c4b0ff',
  },
  light: {
    bg: 'linear-gradient(145deg, #f5f0ff 0%, #fff8f0 50%, #f0f7ff 100%)',
    bgSolid: '#f5f0ff',
    navBg: 'rgba(248,245,255,0.88)',
    navBorder: 'rgba(139,92,246,0.15)',
    glass: 'rgba(255,255,255,0.78)',
    glassBorder: 'rgba(139,92,246,0.14)',
    glassShadow: '0 4px 30px rgba(100,60,200,0.08)',
    text: '#111111',
    textSec: '#374151',
    textMuted: '#6b7280',
    violet: '#7c3aed',
    amber: '#d97706',
    emerald: '#059669',
    red: '#dc2626',
    orb1: 'rgba(124,58,237,0.10)',
    orb2: 'rgba(244,169,78,0.08)',
    shimmer: 'rgba(124,58,237,0.05)',
    scrollThumb: 'rgba(124,58,237,0.25)',
    toggleBg: 'rgba(124,58,237,0.08)',
    subBg: 'transparent',
    subText: '#111111',
    subTextSec: '#374151',
    subBorder: 'rgba(139,92,246,0.12)',
    subHover: 'rgba(124,58,237,0.06)',
    subGrad: 'linear-gradient(135deg, #7c3aed, #d97706)',
    subFiltroBtn: 'rgba(255,255,255,0.9)',
    subFiltroBtnText: '#5b4f8a',
    subFiltroBtnBorder: 'rgba(139,92,246,0.18)',
    avatarBg: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
    badgeBg: 'rgba(124,58,237,0.12)',
    badgeText: '#7c3aed',
  },
};

// ─── CSS global injetado ───────────────────────────────────────────────────────

const makeCSS = (t: typeof themes.dark) => `
@keyframes atndIn   { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
@keyframes atndOrb  { 0%,100%{transform:translate(0,0)scale(1);} 40%{transform:translate(18px,-14px)scale(1.04);} 70%{transform:translate(-10px,8px)scale(0.97);} }
@keyframes atndShim { 0%{background-position:-200% 0;} 100%{background-position:200% 0;} }
@keyframes atndPop  { from{transform:scale(0.85);opacity:0;} to{transform:scale(1);opacity:1;} }

html, body { background: ${t.bgSolid} !important; }
.atnd-page  { animation: atndIn 0.4s ease; }
.atnd-kpi   { transition: transform 0.18s, box-shadow 0.18s; cursor:default; }
.atnd-kpi:hover { transform: translateY(-4px); box-shadow: 0 12px 36px rgba(139,92,246,0.18) !important; }
.atnd-loading {
  background: linear-gradient(90deg, transparent, ${t.shimmer}, transparent);
  background-size: 200% 100%;
  animation: atndShim 1.6s infinite;
}
.atnd-scroll::-webkit-scrollbar       { width: 3px; }
.atnd-scroll::-webkit-scrollbar-track { background: transparent; }
.atnd-scroll::-webkit-scrollbar-thumb { background: ${t.scrollThumb}; border-radius: 2px; }

/* ─── Sub-componentes: reset global ─────────────────────────────────────── */
.fila-container, .meus-chats-container, .equipe-container {
  background: ${t.subBg} !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  border: none !important;
}

/* ─── Cabeçalhos dos sub-componentes ────────────────────────────────────── */
.fila-header, .meus-chats-header, .equipe-header {
  padding: 16px 20px !important;
  border-bottom: 1px solid ${t.subBorder} !important;
  background: transparent !important;
}
.fila-header h3, .meus-chats-header h3, .equipe-header h3 {
  color: ${t.subText} !important;
  font-size: 14px !important;
  font-weight: 700 !important;
  letter-spacing: 0.4px !important;
  text-transform: uppercase !important;
}

/* ─── Badges de contagem (sem gradiente azul!) ───────────────────────────── */
.fila-count, .equipe-count {
  background: ${t.badgeBg} !important;
  color: ${t.badgeText} !important;
  border-radius: 20px !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  padding: 3px 10px !important;
  letter-spacing: 0.3px !important;
}
.chats-count {
  background: ${t.badgeBg} !important;
  color: ${t.badgeText} !important;
  border-radius: 20px !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  padding: 3px 10px !important;
}

/* ─── Filtros ────────────────────────────────────────────────────────────── */
.fila-filtros {
  padding: 10px 20px !important;
  border-bottom: 1px solid ${t.subBorder} !important;
  gap: 6px !important;
  display: flex !important;
}
.filtro-btn {
  background: ${t.subFiltroBtn} !important;
  color: ${t.subFiltroBtnText} !important;
  border: 1px solid ${t.subFiltroBtnBorder} !important;
  border-radius: 20px !important;
  padding: 5px 12px !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  transition: all 0.15s !important;
}
.filtro-btn.active {
  background: ${t.subGrad} !important;
  color: #fff !important;
  border-color: transparent !important;
  box-shadow: 0 2px 12px rgba(139,92,246,0.25) !important;
}

/* ─── Cards da fila ──────────────────────────────────────────────────────── */
.fila-lista { padding: 10px 12px !important; display: flex !important; flex-direction: column !important; gap: 8px !important; }
.conversa-card {
  border: 1px solid ${t.subBorder} !important;
  border-radius: 12px !important;
  background: rgba(139,92,246,0.04) !important;
  padding: 12px 14px !important;
  transition: all 0.15s !important;
  cursor: pointer !important;
}
.conversa-card:hover {
  background: ${t.subHover} !important;
  border-color: rgba(139,92,246,0.25) !important;
  transform: translateX(2px) !important;
}
.conversa-nome  { color: ${t.subText}    !important; font-size: 14px !important; font-weight: 600 !important; }
.conversa-whatsapp { color: ${t.subTextSec} !important; font-size: 12px !important; }
.conversa-tempo span { color: ${t.subTextSec} !important; font-size: 12px !important; }
.conversa-ultima-msg .msg-texto  { color: ${t.subTextSec} !important; font-size: 12px !important; }
.conversa-ultima-msg .msg-horario { color: ${t.subTextSec} !important; font-size: 11px !important; }
.conversa-footer { margin-top: 8px !important; display: flex !important; align-items: center !important; justify-content: space-between !important; }

/* ─── Botão Assumir ──────────────────────────────────────────────────────── */
.btn-assumir {
  background: ${t.subGrad} !important;
  color: #fff !important;
  border: none !important;
  border-radius: 20px !important;
  padding: 5px 14px !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  cursor: pointer !important;
  letter-spacing: 0.3px !important;
  box-shadow: 0 2px 10px rgba(139,92,246,0.25) !important;
  transition: opacity 0.15s !important;
}
.btn-assumir:disabled { opacity: 0.5 !important; cursor: not-allowed !important; }

/* ─── Lista de chats ─────────────────────────────────────────────────────── */
.chats-lista { padding: 0 !important; }
.chat-item {
  padding: 12px 20px !important;
  border-bottom: 1px solid ${t.subBorder} !important;
  transition: background 0.15s !important;
  cursor: pointer !important;
}
.chat-item:hover { background: ${t.subHover} !important; }
.chat-nome    { color: ${t.subText}    !important; font-size: 14px !important; font-weight: 600 !important; }
.chat-horario { color: ${t.subTextSec} !important; font-size: 11px !important; }
.preview-texto { color: ${t.subTextSec} !important; font-size: 12px !important; }
.chat-badge {
  background: #ef4444 !important;
  color: #fff !important;
  border-radius: 10px !important;
  font-size: 10px !important;
  font-weight: 700 !important;
  padding: 2px 7px !important;
}

/* ─── Avatar placeholder: sem azul ──────────────────────────────────────── */
.avatar-image { background: ${t.avatarBg} !important; }
.chat-avatar  { background: ${t.avatarBg} !important; }

/* ─── Equipe ─────────────────────────────────────────────────────────────── */
.equipe-container { margin-top: 0 !important; }
.equipe-lista { padding: 8px 12px !important; display: flex !important; flex-direction: column !important; gap: 4px !important; }
.membro-item {
  padding: 8px 10px !important;
  border-radius: 10px !important;
  transition: background 0.15s !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
}
.membro-item:hover { background: ${t.subHover} !important; }
.membro-nome   { color: ${t.subText}    !important; font-size: 13px !important; font-weight: 600 !important; }
.membro-status { color: ${t.subTextSec} !important; font-size: 11px !important; }
.chats-count-equipe { color: ${t.subTextSec} !important; }

/* ─── Estados vazios ─────────────────────────────────────────────────────── */
.fila-empty, .meus-chats-empty {
  display: flex !important; flex-direction: column !important;
  align-items: center !important; justify-content: center !important;
  padding: 40px 20px !important; gap: 8px !important;
}
.fila-empty p, .meus-chats-empty p { color: ${t.subText} !important; font-size: 14px !important; font-weight: 600 !important; margin: 0 !important; }
.empty-subtitle, .fila-empty span, .meus-chats-empty span { color: ${t.subTextSec} !important; font-size: 12px !important; }
.fila-loading, .meus-chats-loading, .equipe-loading {
  display: flex !important; align-items: center !important; justify-content: center !important;
  padding: 32px !important; color: ${t.subTextSec} !important; font-size: 13px !important;
}
`;

// ─── Componente Principal ─────────────────────────────────────────────────────

export const DashboardAtendente: React.FC = () => {
  const { user, logout, token } = useAuth();
  const { toasts, showToast, removeToast } = useToast();
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [meusChats, setMeusChats] = useState<ConversaAtiva[]>([]);
  const [loading, setLoading] = useState(true);
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [perfilFoto, setPerfilFoto] = useState<string | null>(null);
  const [perfilNome, setPerfilNome] = useState<string>('');
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('atnd-theme') as Theme) || 'dark'
  );

  const T = themes[theme];

  // Inject/update global CSS whenever theme changes
  useEffect(() => {
    const id = 'atnd-theme-css';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = makeCSS(T);
  }, [theme]); // eslint-disable-line

  useEffect(() => {
    localStorage.setItem('atnd-theme', theme);
  }, [theme]);

  // Carregar foto + nome do perfil
  useEffect(() => {
    api.get('/atendente/perfil')
      .then(r => {
        if (r.data.foto_url) setPerfilFoto(r.data.foto_url);
        if (r.data.nome_exibicao) setPerfilNome(r.data.nome_exibicao);
      })
      .catch(() => {});
  }, [perfilOpen]);

  const carregarDados = useCallback(async () => {
    try {
      setLoading(true);
      const [mRes, cRes] = await Promise.all([
        api.get('/atendente/metricas'),
        api.get('/atendente/meus-chats'),
      ]);
      setMetricas(mRes.data);
      setMeusChats(cRes.data);
    } catch (e) {
      console.error('Erro ao carregar dashboard:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleWsMessage = useCallback((msg: any) => {
    switch (msg.event) {
      case 'connected':       showToast('Conectado em tempo real 🟢', 'success'); break;
      case 'nova_mensagem':   carregarDados(); showToast(`Nova mensagem de ${msg.data?.whatsapp || 'cliente'}`, 'info'); break;
      case 'conversa_assumida':  carregarDados(); showToast(`${msg.data?.atendente_nome} assumiu conversa`, 'info'); break;
      case 'conversa_transferida': carregarDados(); break;
      case 'metricas_atualizadas': if (msg.data?.metricas) setMetricas(msg.data.metricas); break;
      case 'atendente_online':  showToast(`${msg.data?.nome} ficou online 🟢`, 'success'); break;
      case 'atendente_offline': showToast(`${msg.data?.nome} ficou offline`, 'warning'); break;
    }
  }, [carregarDados, showToast]);

  const { isConnected } = useWebSocket(token, {
    onMessage: handleWsMessage,
    onConnect: () => {},
    onDisconnect: () => {},
    onError: () => {},
    autoReconnect: true,
    reconnectInterval: 3000,
  });

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const goToChat = (whatsappNumber: string) => {
    window.location.href = `/atendente/chat?whatsapp=${whatsappNumber}`;
  };

  // ─── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = metricas ? [
    { label: 'Meus Atendimentos', value: metricas.minhas_conversas_ativas,                    sub: 'conversas ativas',     icon: '💬', color: T.violet  },
    { label: 'Fila de Espera',    value: metricas.conversas_na_fila,                           sub: 'aguardando',           icon: '⏱️', color: T.amber   },
    { label: 'Tempo Médio',       value: `${metricas.tempo_medio_resposta_minutos.toFixed(1)}min`, sub: 'de resposta',      icon: '⚡', color: T.emerald },
    { label: 'Mensagens Hoje',    value: metricas.total_mensagens_enviadas_hoje,                sub: `${metricas.total_conversas_assumidas_hoje} assumidas`, icon: '📨', color: T.amber },
  ] : [];

  // ─── Glass card style helper ───────────────────────────────────────────────

  const glassCard: React.CSSProperties = {
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    background: T.glass,
    border: `1px solid ${T.glassBorder}`,
    borderRadius: 16,
    boxShadow: T.glassShadow,
  };

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, padding: '16px 24px' }}>
        <div style={{ height: 56, borderRadius: 14, ...glassCard, marginBottom: 14 }} className="atnd-loading" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="atnd-loading" style={{ height: 96, borderRadius: 14, background: T.glass }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="atnd-loading" style={{ height: 440, borderRadius: 16, background: T.glass }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="atnd-loading" style={{ height: 250, borderRadius: 16, background: T.glass }} />
            <div className="atnd-loading" style={{ height: 170, borderRadius: 16, background: T.glass }} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      color: T.text,
      fontFamily: "'Inter', 'Segoe UI', -apple-system, sans-serif",
      position: 'relative',
    }}>

      {/* ─── Background orbs ─────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle, ${T.orb1} 0%, transparent 70%)`, animation: 'atndOrb 12s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: 560, height: 560, borderRadius: '50%', background: `radial-gradient(circle, ${T.orb2} 0%, transparent 70%)`, animation: 'atndOrb 15s ease-in-out infinite reverse' }} />
      </div>

      <div className="atnd-page" style={{ position: 'relative', zIndex: 1 }}>

        {/* ─── Navbar ──────────────────────────────────────────────────── */}
        <nav style={{
          position: 'sticky', top: 0, zIndex: 50,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          background: T.navBg,
          borderBottom: `1px solid ${T.navBorder}`,
          padding: '10px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Esquerda: avatar + nome */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {perfilFoto ? (
              <img src={perfilFoto} alt="avatar" style={{
                width: 38, height: 38, borderRadius: '50%', objectFit: 'cover',
                border: `2px solid ${T.violet}55`,
                boxShadow: `0 0 14px ${T.violet}40`,
              }} />
            ) : (
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: T.avatarBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 800, color: '#fff',
                boxShadow: `0 0 14px ${T.violet}40`,
              }}>
                {(perfilNome || user?.email || 'A')[0].toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{perfilNome || 'Atendente'}</div>
              <div style={{ fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                Portal do Atendente
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 10, padding: '1px 8px', borderRadius: 8, fontWeight: 700,
                  background: isConnected ? `${T.emerald}20` : `${T.red}20`,
                  border: `1px solid ${isConnected ? T.emerald : T.red}44`,
                  color: isConnected ? T.emerald : T.red,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: isConnected ? T.emerald : T.red }} />
                  {isConnected ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Direita: botões */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              style={{ background: T.toggleBg, border: `1px solid ${T.navBorder}`, borderRadius: 10, padding: '7px 11px', cursor: 'pointer', fontSize: 15 }}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button onClick={() => setPerfilOpen(true)} style={{
              background: `${T.violet}18`, border: `1px solid ${T.violet}30`,
              borderRadius: 20, padding: '7px 18px', cursor: 'pointer',
              color: T.violet, fontWeight: 700, fontSize: 12, letterSpacing: 0.3,
            }}>
              👤 Perfil
            </button>
            <button onClick={() => { window.location.href = '/atendente/chat'; }} style={{
              background: T.subGrad, border: 'none',
              borderRadius: 20, padding: '7px 18px', cursor: 'pointer',
              color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: 0.3,
              boxShadow: `0 2px 14px ${T.violet}40`,
            }}>
              💬 Abrir Chat
            </button>
            <button onClick={logout} style={{
              background: `${T.red}12`, border: `1px solid ${T.red}30`,
              borderRadius: 20, padding: '7px 18px', cursor: 'pointer',
              color: T.red, fontWeight: 700, fontSize: 12, letterSpacing: 0.3,
            }}>
              Sair
            </button>
          </div>
        </nav>

        {/* ─── Conteúdo ────────────────────────────────────────────────── */}
        <div style={{ padding: '18px 24px' }}>

          {/* ─── KPI Cards ───────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            {kpis.map((kpi, i) => (
              <div key={i} className="atnd-kpi" style={{
                ...glassCard,
                borderColor: `${kpi.color}30`,
                padding: '20px 22px',
                position: 'relative',
                overflow: 'hidden',
              }}>
                {/* glow accent */}
                <div style={{
                  position: 'absolute', top: -20, right: -20,
                  width: 80, height: 80, borderRadius: '50%',
                  background: `radial-gradient(circle, ${kpi.color}20 0%, transparent 70%)`,
                  pointerEvents: 'none',
                }} />
                <div style={{
                  width: 40, height: 40, borderRadius: 12, marginBottom: 12,
                  background: `${kpi.color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                  border: `1px solid ${kpi.color}25`,
                }}>
                  {kpi.icon}
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: kpi.color, lineHeight: 1, letterSpacing: -0.5 }}>
                  {kpi.value}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginTop: 6, letterSpacing: 0.2 }}>
                  {kpi.label}
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                  {kpi.sub}
                </div>
              </div>
            ))}
          </div>

          {/* ─── Grid principal ──────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

            {/* Fila de Atendimento */}
            <div style={{ ...glassCard, overflow: 'hidden', minHeight: 440 }}>
              <FilaAtendimento
                onAssumirConversa={carregarDados}
                onNavigateToChat={goToChat}
              />
            </div>

            {/* Coluna direita */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Meus Atendimentos */}
              <div style={{ ...glassCard, overflow: 'hidden', flex: 1 }}>
                <MeusChats
                  conversas={meusChats}
                  onSelecionarConversa={goToChat}
                  loading={false}
                />
              </div>
              {/* Equipe Online */}
              <div style={{ ...glassCard, overflow: 'hidden' }}>
                <EquipeOnline />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ─── Modal Perfil ────────────────────────────────────────────────── */}
      <PerfilAtendente isOpen={perfilOpen} onClose={() => setPerfilOpen(false)} />

      {/* ─── Toasts ──────────────────────────────────────────────────────── */}
      <div className="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </div>
  );
};
