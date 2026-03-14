import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api, { chatApi, whatsappProfileApi, WhatsAppProfile, atendentesApi, usoApi } from '../services/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Metricas {
  total_conversas: number;
  conversas_ativas: number;
  atendentes_online: number;
  total_atendentes: number;
  taxa_resposta_media: number;
  mensagens_enviadas: number;
  mensagens_recebidas: number;
}

interface MetricasCrm {
  total_leads: number;
  leads_por_etapa: Record<string, number>;
  valor_pipeline: number;
  valor_fechado: number;
  leads_novos_mes: number;
  taxa_conversao: number;
  ticket_medio: number;
  top_tags: { nome: string; total: number }[];
}

interface Atendente {
  id: number;
  nome_exibicao: string;
  email: string;
  status: string;
  total_chats_ativos: number;
  foto_url?: string;
  pode_atender?: boolean;
}

interface Aniversariante {
  id: number;
  nome: string;
  tipo: 'cliente' | 'atendente';
  data_nascimento: string;
  dia_mes: number;
  whatsapp?: string;
}

interface SatisfacaoAtendente {
  id: number;
  nome: string;
  foto_url?: string;
  media: number;
  total: number;
  distribuicao: Record<number, number>;
}

interface MetricasSatisfacao {
  total_avaliacoes: number;
  media_geral: number;
  distribuicao: Record<number, number>;
  por_atendente: SatisfacaoAtendente[];
  empresa: { total: number; media: number };
}

interface GraficoItem {
  label: string;
  conversas: number;
  mensagens: number;
}

// ─── Design System — Space ────────────────────────────────────────────────────

const C = {
  bg: '#0a0a0f',
  text: '#f4f4f5',
  textSec: '#a1a1aa',
  textMuted: '#71717a',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  blue: '#3b82f6',
  pink: '#ec4899',
  border: 'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.12)',
};

const g: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

const ETAPAS = [
  { id: 'novo_lead',         label: 'Novo Lead',         cor: C.violet  },
  { id: 'pediu_orcamento',   label: 'Pediu Orçamento',   cor: C.amber   },
  { id: 'orcamento_enviado', label: 'Orçamento Enviado', cor: C.blue    },
  { id: 'negociacao',        label: 'Negociação',        cor: C.cyan    },
  { id: 'fechado',           label: 'Fechado',           cor: C.emerald },
  { id: 'perdido',           label: 'Perdido',           cor: C.red     },
];

const SCORE_COR = ['', C.red, '#f97316', C.amber, C.emerald, C.violet];
const SCORE_EMO = ['', '😞', '😕', '😐', '😊', '⭐'];
const SCORE_LBL = ['', 'Muito Ruim', 'Ruim', 'Regular', 'Bom', 'Excelente'];

const CSS = `
@keyframes dashFadeIn {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes dashCount {
  from { opacity: 0; transform: scale(0.8); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes orbFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%       { transform: translate(30px, -20px) scale(1.05); }
  66%       { transform: translate(-20px, 10px) scale(0.95); }
}
.dash-page { animation: dashFadeIn 0.5s ease; }
.dash-kpi  { transition: transform 0.2s ease, box-shadow 0.2s ease; }
.dash-kpi:hover { transform: translateY(-4px); box-shadow: 0 16px 40px rgba(139,92,246,0.15) !important; }
.dash-nav-card { transition: transform 0.2s ease, box-shadow 0.2s ease; cursor: pointer; }
.dash-nav-card:hover { transform: translateY(-4px); box-shadow: 0 16px 40px rgba(139,92,246,0.15) !important; border-color: rgba(139,92,246,0.35) !important; }
.dash-agent-card { transition: transform 0.2s ease, box-shadow 0.2s ease; flex-shrink: 0; }
.dash-agent-card:hover { transform: translateY(-4px); box-shadow: 0 16px 40px rgba(139,92,246,0.15) !important; }
.dash-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
.dash-scroll::-webkit-scrollbar-track { background: transparent; }
.dash-scroll::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.4); border-radius: 2px; }
.dash-loading {
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
.dash-count { animation: dashCount 0.5s ease; }
.dash-periodo-btn { transition: all 0.2s; cursor: pointer; border: none; border-radius: 8px; padding: 6px 14px; font-size: 12px; font-weight: 600; }
@keyframes chartRise {
  from { opacity: 0; transform: translateY(28px); }
  to   { opacity: 1; transform: translateY(0); }
}
.dash-chart { animation: chartRise 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both; }
`;

// ─── Componente Principal ─────────────────────────────────────────────────────

export const DashboardEmpresa: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [metricasCrm, setMetricasCrm] = useState<MetricasCrm | null>(null);
  const [atendentes, setAtendentes] = useState<Atendente[]>([]);
  const [deletandoAtendenteId, setDeletandoAtendenteId] = useState<number | null>(null);
  const [aniversariantes, setAniversariantes] = useState<Aniversariante[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('semana');
  const [whatsappConectado, setWhatsappConectado] = useState(true);
  const [whatsappProfile, setWhatsappProfile] = useState<WhatsAppProfile | null>(null);
  const [showCriarAtendente, setShowCriarAtendente] = useState(false);
  const [criarForm, setCriarForm] = useState({ nome: '', email: '' });
  const [criarLoading, setCriarLoading] = useState(false);
  const [criarErro, setCriarErro] = useState('');
  const [protocoloAtivo, setProtocoloAtivo] = useState(false);
  const [cascataAtivo, setCascataAtivo] = useState(false);
  const [showConfigEncerramento, setShowConfigEncerramento] = useState(false);
  const [configEncerramento, setConfigEncerramento] = useState({
    mensagem_encerramento: '',
    pesquisa_satisfacao_ativa: false,
  });
  const [configSaving, setConfigSaving] = useState(false);
  const [satisfacao, setSatisfacao] = useState<MetricasSatisfacao | null>(null);
  const [graficoData, setGraficoData] = useState<GraficoItem[]>([]);
  const [usoMensal, setUsoMensal] = useState<any>(null);
  const [statusAcesso, setStatusAcesso] = useState<any>(null);
  const [csvDataInicio, setCsvDataInicio] = useState('');
  const [csvDataFim, setCsvDataFim] = useState('');

  // Inject CSS
  useEffect(() => {
    const id = 'dash-space-styles';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
  }, []);

  // Checar status protocolo, cascata, uso mensal e acesso
  useEffect(() => {
    api.get('/chat/protocolo/status')
      .then(res => setProtocoloAtivo(res.data.protocolo_ativo))
      .catch(() => {});
    api.get('/chat/cascata/status')
      .then(res => setCascataAtivo(res.data.cascata_ativo))
      .catch(() => {});
    usoApi.usoMensal().then(setUsoMensal).catch(() => {});
    usoApi.statusAcesso().then(sa => {
      setStatusAcesso(sa);
      if (sa && !sa.pode_acessar) {
        navigate('/empresa/pagamento');
      }
    }).catch(() => {});
  }, [navigate]);

  // Carregar config encerramento
  useEffect(() => {
    chatApi.getConfigEncerramento()
      .then(data => setConfigEncerramento(data))
      .catch(() => {});
  }, []);

  const salvarConfigEncerramento = async () => {
    setConfigSaving(true);
    try {
      const res = await chatApi.updateConfigEncerramento(configEncerramento);
      setConfigEncerramento({
        mensagem_encerramento: res.mensagem_encerramento,
        pesquisa_satisfacao_ativa: res.pesquisa_satisfacao_ativa,
      });
      setShowConfigEncerramento(false);
    } catch (err) {
      console.error('Erro ao salvar config:', err);
    } finally {
      setConfigSaving(false);
    }
  };

  const toggleProtocolo = async () => {
    try {
      const res = await api.post('/chat/protocolo/toggle');
      setProtocoloAtivo(res.data.protocolo_ativo);
    } catch {}
  };

  const toggleCascata = async () => {
    try {
      const res = await api.post('/chat/cascata/toggle');
      setCascataAtivo(res.data.cascata_ativo);
    } catch {}
  };

  // Checar status WhatsApp e buscar perfil se conectado
  useEffect(() => {
    api.get('/auth/empresa/whatsapp-status')
      .then(res => {
        setWhatsappConectado(res.data.conectado);
        if (res.data.conectado) {
          whatsappProfileApi.getMyProfile()
            .then(profile => setWhatsappProfile(profile))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [metRes, crmRes, atenRes, anivRes, satRes, grafRes] = await Promise.all([
          api.get(`/empresa/metricas?periodo=${periodo}`).catch(() => ({ data: null })),
          api.get('/empresa/metricas-crm').catch(() => ({ data: null })),
          api.get('/empresa/atendentes').catch(() => ({ data: [] })),
          api.get('/empresa/aniversarios').catch(() => ({ data: [] })),
          api.get('/empresa/metricas-satisfacao').catch(() => ({ data: null })),
          api.get(`/empresa/grafico-atendimentos?periodo=${periodo}`).catch(() => ({ data: { labels: [], valores: [] } })),
        ]);
        setMetricas(metRes.data);
        setMetricasCrm(crmRes.data);
        setAtendentes(atenRes.data || []);
        setAniversariantes(anivRes.data || []);
        setSatisfacao(satRes.data);

        // Formatar dados do gráfico com dados reais de abertas vs finalizadas
        if (grafRes.data?.labels?.length) {
          const formatted: GraficoItem[] = grafRes.data.labels.map((label: string, i: number) => ({
            label,
            conversas: grafRes.data.valores[i] || 0,
            finalizadas: grafRes.data.valores_finalizadas?.[i] || 0,
          }));
          setGraficoData(formatted);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [periodo]);

  const deletarAtendente = async (a: Atendente) => {
    if (!window.confirm(`Remover "${a.nome_exibicao}"? Atendimentos ativos voltam para a fila.`)) return;
    try {
      setDeletandoAtendenteId(a.id);
      await atendentesApi.deletar(a.id);
      setAtendentes(prev => prev.filter(x => x.id !== a.id));
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Erro ao remover atendente');
    } finally {
      setDeletandoAtendenteId(null);
    }
  };

  const criarAtendente = async () => {
    if (!criarForm.nome.trim() || !criarForm.email.trim()) return;
    setCriarLoading(true);
    setCriarErro('');
    try {
      await api.post('/auth/empresa/criar-atendente', {
        nome_exibicao: criarForm.nome.trim(),
        email: criarForm.email.trim(),
      });
      setCriarForm({ nome: '', email: '' });
      setShowCriarAtendente(false);
      const res = await api.get('/empresa/atendentes').catch(() => ({ data: [] }));
      setAtendentes(res.data || []);
    } catch (err: any) {
      setCriarErro(err.response?.data?.detail || 'Erro ao criar atendente');
    } finally {
      setCriarLoading(false);
    }
  };

  const fmt   = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 0 });
  const fmtR$ = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  // ─── Loading Skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, padding: '24px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="dash-loading" style={{ height: 100, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="dash-loading" style={{ height: 100, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          <div className="dash-loading" style={{ height: 300, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }} />
          <div className="dash-loading" style={{ height: 300, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }} />
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif", position: 'relative' }}>

      {/* ─── Background Orbs ──────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: '-10%', left: '-5%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
          animation: 'orbFloat 8s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', bottom: '-15%', right: '-5%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)',
          animation: 'orbFloat 10s ease-in-out infinite reverse',
        }} />
        <div style={{
          position: 'absolute', top: '40%', right: '20%',
          width: 300, height: 300, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)',
          animation: 'orbFloat 12s ease-in-out infinite',
        }} />
      </div>

      {/* ─── Page ─────────────────────────────────────────────────────────── */}
      <div className="dash-page" style={{ position: 'relative', zIndex: 1 }}>

        {/* ─── Sticky Header ────────────────────────────────────────────── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          backdropFilter: 'blur(20px)',
          background: 'rgba(10,10,15,0.85)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '14px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <h1 style={{
              fontSize: 20, fontWeight: 800, margin: 0,
              background: 'linear-gradient(135deg, #f4f4f5, #a1a1aa)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>Dashboard</h1>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>
              Bem-vindo, {user?.email?.split('@')[0]}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Período */}
            {['dia', 'semana', 'mes'].map(p => (
              <button key={p} className="dash-periodo-btn" onClick={() => setPeriodo(p)} style={{
                background: periodo === p ? 'linear-gradient(to right, #8b5cf6, #06b6d4)' : 'rgba(255,255,255,0.05)',
                color: periodo === p ? '#fff' : C.textMuted,
                border: `1px solid ${periodo === p ? 'transparent' : C.border}`,
              }}>
                {p === 'dia' ? 'Hoje' : p === 'semana' ? 'Semana' : 'Mês'}
              </button>
            ))}

            <div style={{ width: 1, height: 22, background: C.border, margin: '0 4px' }} />

            {/* Toggle Protocolo */}
            <button
              onClick={toggleProtocolo}
              title={protocoloAtivo ? 'Protocolo ativado — clique para desativar' : 'Protocolo desativado — clique para ativar'}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: protocoloAtivo ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${protocoloAtivo ? 'rgba(16,185,129,0.3)' : C.border}`,
                borderRadius: 10, padding: '7px 14px', cursor: 'pointer',
                color: protocoloAtivo ? C.emerald : C.textMuted, fontSize: 12, fontWeight: 600,
              }}
            >
              <span style={{
                width: 28, height: 16, borderRadius: 8, flexShrink: 0,
                background: protocoloAtivo ? C.emerald : 'rgba(255,255,255,0.15)',
                position: 'relative', transition: 'background 0.2s',
              }}>
                <span style={{
                  position: 'absolute', top: 2, left: protocoloAtivo ? 14 : 2,
                  width: 12, height: 12, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s',
                }} />
              </span>
              Protocolo
            </button>

            <div style={{ width: 1, height: 22, background: C.border, margin: '0 4px' }} />

            {/* Toggle Cascata */}
            <button
              onClick={toggleCascata}
              title={cascataAtivo ? 'Cascata ativada — leads distribuídos automaticamente. Clique para desativar' : 'Cascata desativada — clique para ativar distribuição automática de leads'}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: cascataAtivo ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${cascataAtivo ? 'rgba(168,85,247,0.3)' : C.border}`,
                borderRadius: 10, padding: '7px 14px', cursor: 'pointer',
                color: cascataAtivo ? '#a855f7' : C.textMuted, fontSize: 12, fontWeight: 600,
              }}
            >
              <span style={{
                width: 28, height: 16, borderRadius: 8, flexShrink: 0,
                background: cascataAtivo ? '#a855f7' : 'rgba(255,255,255,0.15)',
                position: 'relative', transition: 'background 0.2s',
              }}>
                <span style={{
                  position: 'absolute', top: 2, left: cascataAtivo ? 14 : 2,
                  width: 12, height: 12, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s',
                }} />
              </span>
              Cascata
            </button>

            <div style={{ width: 1, height: 22, background: C.border, margin: '0 4px' }} />

            <button
              onClick={logout}
              style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 10, padding: '7px 16px', cursor: 'pointer',
                color: C.red, fontWeight: 600, fontSize: 12,
              }}
            >
              Sair
            </button>
          </div>
        </div>

        {/* ─── Content ──────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 28px' }}>

          {/* ─── Banner WhatsApp não configurado ───────────────────────── */}
          {!whatsappConectado && (
            <div style={{
              ...g,
              background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.05))',
              border: '1px solid rgba(245,158,11,0.25)',
              padding: '16px 24px', marginBottom: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>&#9888;</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.amber }}>WhatsApp nao configurado</div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>Conecte seu WhatsApp Business para comecar a atender clientes.</div>
                </div>
              </div>
              <button
                onClick={() => navigate('/empresa/configurar-whatsapp')}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  border: 'none', borderRadius: 10, padding: '10px 20px',
                  color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  transition: 'transform 0.2s', flexShrink: 0,
                }}
                onMouseOver={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseOut={e => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                Configurar Agora
              </button>
            </div>
          )}

          {/* ─── Card Status WhatsApp (conectado) ──────────────────────── */}
          {whatsappConectado && whatsappProfile && (
            <div style={{
              ...g,
              background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))',
              border: '1px solid rgba(16,185,129,0.2)',
              padding: '14px 24px', marginBottom: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.1))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
                }}>📱</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.emerald }}>WhatsApp Business Conectado</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                    {whatsappProfile.display_phone_number || whatsappProfile.phone_number_id}
                    {whatsappProfile.verified_name && ` · ${whatsappProfile.verified_name}`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {[
                  {
                    label: 'Status',
                    value: whatsappProfile.status || '—',
                    color: whatsappProfile.status === 'CONNECTED' ? C.emerald : whatsappProfile.status === 'FLAGGED' ? C.amber : whatsappProfile.status === 'BANNED' ? C.red : C.textMuted,
                  },
                  {
                    label: 'Nome',
                    value: whatsappProfile.name_status === 'APPROVED' ? 'Aprovado' : whatsappProfile.name_status === 'PENDING_REVIEW' ? 'Em Revisão' : whatsappProfile.name_status === 'DECLINED' ? 'Recusado' : whatsappProfile.name_status || '—',
                    color: whatsappProfile.name_status === 'APPROVED' ? C.emerald : whatsappProfile.name_status === 'DECLINED' ? C.red : C.amber,
                  },
                  {
                    label: 'Qualidade',
                    value: whatsappProfile.quality_rating || '—',
                    color: whatsappProfile.quality_rating === 'GREEN' ? C.emerald : whatsappProfile.quality_rating === 'YELLOW' ? C.amber : whatsappProfile.quality_rating === 'RED' ? C.red : C.textMuted,
                  },
                ].map(item => (
                  <div key={item.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>{item.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Banner de status de acesso / pagamento pendente ──────── */}
          {statusAcesso && statusAcesso.motivo === 'pagamento_pendente' && (
            <div style={{
              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)',
              borderRadius: 12, padding: '12px 20px', marginBottom: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                ⚠️ Pagamento atrasado há {statusAcesso.dias_atraso} dias. Regularize para evitar bloqueio.
              </span>
              <button
                onClick={() => navigate('/empresa/pagamento')}
                style={{ padding: '6px 16px', background: '#f59e0b', border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
              >
                Pagar agora
              </button>
            </div>
          )}

          {/* ─── Banner de uso mensal ──────────────────────────────────── */}
          {usoMensal && (() => {
            const conv = usoMensal.conversas_mes;
            const ia = usoMensal.ia_conversas;
            const atd = usoMensal.atendentes;
            const alertaConv = conv.percentual !== null && conv.percentual >= 80;
            const alertaIa = ia.percentual !== null && ia.percentual >= 80;
            if (!alertaConv && !alertaIa) return null;
            return (
              <div style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 12, padding: '12px 20px', marginBottom: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ color: '#f87171', fontWeight: 600, fontSize: 13 }}>
                  🚨 Limite próximo do teto:
                  {alertaConv && <span style={{ marginLeft: 12 }}>Conversas {conv.usado}/{conv.limite} ({conv.percentual}%)</span>}
                  {alertaIa && <span style={{ marginLeft: 12 }}>IA {ia.usado}/{ia.limite} ({ia.percentual}%)</span>}
                </div>
                <button
                  onClick={() => navigate('/empresa/pagamento')}
                  style={{ padding: '6px 16px', background: '#ef4444', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                >
                  Ver plano
                </button>
              </div>
            );
          })()}

          {/* ─── Uso mensal compacto ──────────────────────────────────── */}
          {usoMensal && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Conversas/mês', usado: usoMensal.conversas_mes.usado, limite: usoMensal.conversas_mes.limite, pct: usoMensal.conversas_mes.percentual },
                { label: 'IA/mês', usado: usoMensal.ia_conversas.usado, limite: usoMensal.ia_conversas.limite, pct: usoMensal.ia_conversas.percentual },
                { label: 'Atendentes', usado: usoMensal.atendentes.ativo, limite: usoMensal.atendentes.limite, pct: null },
              ].map(item => (
                <div key={item.label} style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10, padding: '10px 16px', flex: 1, minWidth: 140,
                }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: item.pct && item.pct >= 80 ? '#f87171' : '#e2e8f0' }}>
                    {item.usado}{item.limite ? <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>/{item.limite}</span> : ''}
                  </div>
                  {item.pct !== null && item.limite && (
                    <div style={{ marginTop: 6, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                      <div style={{
                        height: 4, borderRadius: 2,
                        width: `${Math.min(item.pct, 100)}%`,
                        background: item.pct >= 90 ? '#ef4444' : item.pct >= 80 ? '#f59e0b' : '#22c55e',
                      }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ─── KPIs Row 1: Atendimento ───────────────────────────────── */}
          {metricas && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
              {[
                { label: 'Total Conversas', value: fmt(metricas.total_conversas), sub: `${metricas.conversas_ativas} ativas`,        icon: '💬', color: C.violet  },
                { label: 'Atendentes',      value: `${metricas.atendentes_online}/${metricas.total_atendentes}`, sub: 'online agora', icon: '👥', color: C.emerald },
                { label: 'Tempo Resposta',  value: `${metricas.taxa_resposta_media.toFixed(1)}min`,              sub: 'tempo médio',  icon: '⚡', color: C.amber   },
              ].map((kpi, i) => (
                <div key={i} className="dash-kpi" style={{
                  ...g,
                  background: `linear-gradient(135deg, ${kpi.color}10 0%, ${kpi.color}05 100%)`,
                  border: `1px solid ${kpi.color}25`,
                  padding: '18px 20px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>{kpi.label}</span>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `linear-gradient(135deg, ${kpi.color}25, ${kpi.color}10)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    }}>{kpi.icon}</div>
                  </div>
                  <div className="dash-count" style={{ fontSize: 28, fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{kpi.sub}</div>
                </div>
              ))}
            </div>
          )}

          {/* ─── KPIs Row 2: CRM ──────────────────────────────────────── */}
          {metricasCrm && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
              {[
                { label: 'Total Leads',     value: fmt(metricasCrm.total_leads),      sub: `${metricasCrm.leads_novos_mes} novos este mês`,    icon: '🎯', color: C.cyan    },
                { label: 'Pipeline',        value: fmtR$(metricasCrm.valor_pipeline),  sub: 'valor em negociação',                              icon: '💰', color: C.amber   },
                { label: 'Receita Fechada', value: fmtR$(metricasCrm.valor_fechado),   sub: `ticket: ${fmtR$(metricasCrm.ticket_medio)}`,       icon: '✅', color: C.emerald },
              ].map((kpi, i) => (
                <div key={i} className="dash-kpi" style={{
                  ...g,
                  background: `linear-gradient(135deg, ${kpi.color}10 0%, ${kpi.color}05 100%)`,
                  border: `1px solid ${kpi.color}25`,
                  padding: '18px 20px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>{kpi.label}</span>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `linear-gradient(135deg, ${kpi.color}25, ${kpi.color}10)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    }}>{kpi.icon}</div>
                  </div>
                  <div className="dash-count" style={{ fontSize: 28, fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{kpi.sub}</div>
                </div>
              ))}
            </div>
          )}

          {/* ─── Gráfico Mensagens & Conversas ───────────────────────── */}
          {graficoData.length > 0 && (
            <div className="dash-chart" style={{ ...g, padding: '24px 24px 16px', marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
              {/* Glow bg */}
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '1rem', opacity: 0.4,
                background: 'linear-gradient(135deg, rgba(6,182,212,0.06) 0%, rgba(139,92,246,0.06) 100%)',
                pointerEvents: 'none',
              }} />

              <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 28, borderRadius: 8,
                        background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(139,92,246,0.2))',
                        fontSize: 14,
                      }}>📈</span>
                      Conversas &amp; Conversão
                    </h3>
                    <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 0 0' }}>
                      {periodo === 'dia' ? 'Últimas 24h' : periodo === 'semana' ? 'Últimos 7 dias' : 'Últimos 30 dias'}
                      {metricasCrm && (
                        <span style={{ marginLeft: 8, color: C.emerald, fontWeight: 700 }}>
                          · {metricasCrm.taxa_conversao}% conversão
                        </span>
                      )}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.cyan }} />
                      <span style={{ color: C.textSec }}>Abertas</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.emerald }} />
                      <span style={{ color: C.textSec }}>Finalizadas</span>
                    </div>
                  </div>
                </div>

                {/* Chart */}
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={graficoData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradConv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={C.cyan}    stopOpacity={0.25} />
                          <stop offset="95%" stopColor={C.cyan}    stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradFin" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={C.emerald} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={C.emerald} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        dataKey="label"
                        stroke={C.textMuted}
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        stroke={C.textMuted}
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(10,10,15,0.95)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 10,
                          backdropFilter: 'blur(40px)',
                          color: C.text,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: C.textSec, fontWeight: 600, marginBottom: 4 }}
                        itemStyle={{ color: C.text }}
                      />
                      <Area
                        type="monotone"
                        dataKey="conversas"
                        name="Abertas"
                        stroke={C.cyan}
                        strokeWidth={2}
                        fill="url(#gradConv)"
                        dot={false}
                        activeDot={{ r: 4, fill: C.cyan, stroke: '#0e7490', strokeWidth: 2 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="finalizadas"
                        name="Finalizadas"
                        stroke={C.emerald}
                        strokeWidth={2}
                        fill="url(#gradFin)"
                        dot={false}
                        activeDot={{ r: 4, fill: C.emerald, stroke: '#059669', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ─── Main Grid 2/3 + 1/3 ─────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>

            {/* Funil de Vendas */}
            {metricasCrm && (
              <div style={{ ...g, padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: C.text }}>Funil de Vendas</h3>
                    <div style={{ fontSize: 12, color: C.textMuted }}>Distribuição por etapa</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="date"
                      value={csvDataInicio}
                      onChange={e => setCsvDataInicio(e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: '6px 10px', color: C.textSec, fontSize: 12, cursor: 'pointer',
                      }}
                      title="Data início"
                    />
                    <input
                      type="date"
                      value={csvDataFim}
                      onChange={e => setCsvDataFim(e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: '6px 10px', color: C.textSec, fontSize: 12, cursor: 'pointer',
                      }}
                      title="Data fim"
                    />
                    <button
                      onClick={async () => {
                        try {
                          const token = localStorage.getItem('@WhatsApp:token') || '';
                          const apiBase = process.env.REACT_APP_API_URL || 'https://api.yoursystem.dev.br/api/v1';
                          const params = new URLSearchParams();
                          if (csvDataInicio) params.append('data_inicio', csvDataInicio);
                          if (csvDataFim) params.append('data_fim', csvDataFim);
                          const url = `${apiBase}/empresa/exportar-leads-csv${params.toString() ? '?' + params.toString() : ''}`;
                          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                          const blob = await res.blob();
                          const blobUrl = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = blobUrl;
                          a.download = `leads${csvDataInicio ? '_' + csvDataInicio : ''}${csvDataFim ? '_' + csvDataFim : ''}.csv`;
                          a.click();
                          URL.revokeObjectURL(blobUrl);
                        } catch {}
                      }}
                      style={{
                        background: 'rgba(34,197,94,0.08)', border: `1px solid rgba(34,197,94,0.25)`,
                        borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                        color: '#22c55e', fontSize: 12, fontWeight: 600,
                      }}
                    >
                      ↓ Exportar CSV
                    </button>
                    <button
                      onClick={() => navigate('/empresa/kanban')}
                      style={{
                        background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                        color: C.textSec, fontSize: 12, fontWeight: 600,
                      }}
                    >
                      Ver Kanban →
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {ETAPAS.map((etapa) => {
                    const count = metricasCrm.leads_por_etapa[etapa.id] || 0;
                    const maxCount = Math.max(...Object.values(metricasCrm.leads_por_etapa), 1);
                    const pct = (count / maxCount) * 100;
                    return (
                      <div key={etapa.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 130, fontSize: 12, color: C.textSec, textAlign: 'right', flexShrink: 0 }}>
                          {etapa.label}
                        </div>
                        <div style={{ flex: 1, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 8,
                            width: `${Math.max(pct, 3)}%`,
                            background: `linear-gradient(90deg, ${etapa.cor}60, ${etapa.cor})`,
                            transition: 'width 0.8s ease',
                            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 10,
                          }}>
                            {count > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                                {count}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ width: 28, fontSize: 12, fontWeight: 700, color: etapa.cor, textAlign: 'center' }}>
                          {count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Coluna lateral: Atendentes + Aniversários */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Atendentes */}
              <div style={{ ...g, padding: 20, flex: 1 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px 0', color: C.text }}>Atendentes</h3>
                <div className="dash-scroll" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {atendentes.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', padding: 20 }}>Nenhum atendente</div>
                  ) : atendentes.map(a => (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      <div style={{ position: 'relative' }}>
                        {a.foto_url ? (
                          <img src={a.foto_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).nextElementSibling as HTMLElement).style.removeProperty('display'); }}
                          />
                        ) : null}
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                          display: a.foto_url ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#fff',
                        }}>
                          {a.nome_exibicao.substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{
                          position: 'absolute', bottom: -1, right: -1,
                          width: 10, height: 10, borderRadius: '50%',
                          background: a.status === 'online' ? C.emerald : a.status === 'ausente' ? C.amber : C.textMuted,
                          border: '2px solid #0a0a0f',
                        }} />
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.nome_exibicao}
                        </div>
                        <div style={{ fontSize: 10, color: C.textMuted }}>{a.total_chats_ativos} chats ativos</div>
                      </div>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
                        background: a.status === 'online' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                        color: a.status === 'online' ? C.emerald : C.textMuted,
                        border: `1px solid ${a.status === 'online' ? 'rgba(16,185,129,0.3)' : 'transparent'}`,
                      }}>
                        {a.status}
                      </span>
                      <button
                        onClick={() => deletarAtendente(a)}
                        disabled={deletandoAtendenteId === a.id}
                        title="Remover atendente"
                        style={{
                          width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: 'rgba(239,68,68,0.15)', color: C.red,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, flexShrink: 0,
                          transition: 'background 0.2s',
                          opacity: deletandoAtendenteId === a.id ? 0.5 : 1,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.3)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                      >
                        {deletandoAtendenteId === a.id ? '…' : '🗑'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Aniversários */}
              <div style={{ ...g, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px 0', color: C.text }}>
                  🎂 Aniversários do Mês
                </h3>
                <div className="dash-scroll" style={{ maxHeight: 160, overflowY: 'auto' }}>
                  {aniversariantes.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', padding: 20 }}>Nenhum aniversariante</div>
                  ) : aniversariantes.slice(0, 8).map(a => (
                    <div key={`${a.tipo}-${a.id}`} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: a.tipo === 'cliente' ? 'rgba(6,182,212,0.15)' : 'rgba(236,72,153,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                      }}>🎂</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{a.nome}</div>
                      </div>
                      <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>
                        {a.dia_mes}/{new Date().getMonth() + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Satisfação dos Clientes ───────────────────────────────────── */}
          {satisfacao && satisfacao.total_avaliacoes > 0 && (() => {
            const maxDist = Math.max(...Object.values(satisfacao.distribuicao), 1);
            const mediaRnd = Math.round(satisfacao.media_geral);
            const mediaColor = SCORE_COR[mediaRnd] || C.violet;

            return (
              <div style={{ ...g, padding: 24, marginBottom: 20 }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: C.text }}>Satisfação dos Clientes</h3>
                    <div style={{ fontSize: 12, color: C.textMuted }}>{satisfacao.total_avaliacoes} avaliações recebidas</div>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: `${mediaColor}12`,
                    border: `1px solid ${mediaColor}30`,
                    borderRadius: 14, padding: '12px 20px',
                  }}>
                    <span style={{ fontSize: 30 }}>{SCORE_EMO[mediaRnd] || '⭐'}</span>
                    <div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: mediaColor, lineHeight: 1 }}>
                        {satisfacao.media_geral.toFixed(1)}
                      </div>
                      <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        Média Geral
                      </div>
                    </div>
                  </div>
                </div>

                {/* Distribuição de notas */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Distribuição
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[5, 4, 3, 2, 1].map(nota => {
                      const count = satisfacao.distribuicao[nota] || 0;
                      const pct = (count / maxDist) * 100;
                      return (
                        <div key={nota} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 90, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <span style={{ fontSize: 14 }}>{SCORE_EMO[nota]}</span>
                            <span style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>{SCORE_LBL[nota]}</span>
                          </div>
                          <div style={{ flex: 1, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 6,
                              width: `${Math.max(pct, count > 0 ? 4 : 0)}%`,
                              background: `linear-gradient(90deg, ${SCORE_COR[nota]}60, ${SCORE_COR[nota]})`,
                              transition: 'width 0.8s ease',
                            }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: SCORE_COR[nota], width: 28, textAlign: 'right' }}>
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Por Atendente — Horizontal Scroll Cards */}
                {(satisfacao.por_atendente.length > 0 || satisfacao.empresa.total > 0) && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      Por Atendente
                    </div>
                    <div
                      className="dash-scroll"
                      style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}
                    >
                      {/* Card: Empresa (atendimento direto) */}
                      {satisfacao.empresa.total > 0 && (
                        <div className="dash-agent-card" style={{
                          ...g,
                          background: `linear-gradient(135deg, ${C.violet}12 0%, ${C.violet}06 100%)`,
                          border: `1px solid ${C.violet}25`,
                          borderRadius: '0.875rem',
                          padding: '16px 18px', width: 150, textAlign: 'center',
                        }}>
                          <div style={{
                            width: 44, height: 44, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 20, margin: '0 auto 10px',
                          }}>🏢</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>Empresa</div>
                          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 8 }}>{satisfacao.empresa.total} avaliações</div>
                          <div style={{
                            fontSize: 26, fontWeight: 800,
                            color: SCORE_COR[Math.round(satisfacao.empresa.media)] || C.violet,
                          }}>
                            {satisfacao.empresa.media.toFixed(1)}
                          </div>
                          <div style={{ fontSize: 16, marginTop: 4 }}>
                            {SCORE_EMO[Math.round(satisfacao.empresa.media)]}
                          </div>
                          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                            {SCORE_LBL[Math.round(satisfacao.empresa.media)]}
                          </div>
                        </div>
                      )}

                      {/* Cards dos Atendentes */}
                      {satisfacao.por_atendente.map(atd => {
                        const rnd = Math.round(atd.media);
                        const cor = SCORE_COR[rnd] || C.violet;
                        return (
                          <div key={atd.id} className="dash-agent-card" style={{
                            ...g,
                            background: `linear-gradient(135deg, ${cor}10 0%, ${cor}05 100%)`,
                            border: `1px solid ${cor}22`,
                            borderRadius: '0.875rem',
                            padding: '16px 18px', width: 150, textAlign: 'center',
                          }}>
                            {atd.foto_url ? (
                              <img src={atd.foto_url} alt="" style={{
                                width: 44, height: 44, borderRadius: '50%',
                                objectFit: 'cover', margin: '0 auto 10px', display: 'block',
                                border: `2px solid ${cor}40`,
                              }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).nextElementSibling as HTMLElement).style.removeProperty('display'); }} />
                            ) : null}
                            <div style={{
                              width: 44, height: 44, borderRadius: '50%',
                              background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                              display: atd.foto_url ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 14, fontWeight: 700, color: '#fff',
                              margin: '0 auto 10px',
                              border: `2px solid ${cor}40`,
                            }}>
                              {atd.nome.substring(0, 2).toUpperCase()}
                            </div>
                            <div style={{
                              fontSize: 12, fontWeight: 700, color: C.text,
                              marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>{atd.nome}</div>
                            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 8 }}>{atd.total} avaliações</div>
                            <div style={{ fontSize: 26, fontWeight: 800, color: cor, lineHeight: 1 }}>
                              {atd.media.toFixed(1)}
                            </div>
                            <div style={{ fontSize: 16, marginTop: 4 }}>{SCORE_EMO[rnd]}</div>
                            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{SCORE_LBL[rnd]}</div>
                          </div>
                        );
                      })}

                      {satisfacao.por_atendente.length === 0 && satisfacao.empresa.total === 0 && (
                        <div style={{ fontSize: 12, color: C.textMuted, padding: '20px 0' }}>
                          Nenhuma avaliação ainda
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ─── Navigation Cards ────────────────────────────────────────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12, marginBottom: 20,
          }}>
            {[
              { icon: '💬', label: 'Conversas',     desc: 'Chat em tempo real',       path: '/empresa/chat',                   color: C.violet   },
              { icon: '📋', label: 'Templates',     desc: 'Mensagens modelo',          path: '/empresa/templates',              color: C.amber    },
              { icon: '👥', label: 'Contatos',      desc: 'Gestão de contatos',        path: '/empresa/contatos',               color: C.emerald  },
              { icon: '🪪', label: 'Clientes',      desc: 'Dados e campos custom',     path: '/empresa/clientes',               color: C.pink     },
              { icon: '🤖', label: 'Bot Builder',   desc: 'Fluxo do bot',              path: '/empresa/bot-builder',            color: C.cyan     },
              { icon: '✨', label: 'Agente IA',     desc: 'Atendimento com IA',        path: '/empresa/ia-config',              color: '#a855f7'  },
              { icon: '📅', label: 'Agenda',        desc: 'Calendário de slots',       path: '/empresa/agenda',                 color: C.violet   },
              { icon: '📋', label: 'Agendamentos',  desc: 'Acompanhar e marcar presença', path: '/empresa/agendamentos',          color: '#06b6d4'  },
              { icon: '🗂️', label: 'Setores',       desc: 'Departamentos e serviços',  path: '/empresa/setores',                color: '#8b5cf6'  },
              { icon: '🎯', label: 'Funil CRM',     desc: 'Kanban de vendas',          path: '/empresa/kanban',                 color: C.blue     },
              { icon: '📢', label: 'Envio em Massa',desc: 'Mensagens e templates',     path: '/empresa/envio-massa',            color: C.pink     },
              { icon: '📱', label: 'Perfil Meta',   desc: 'Foto, nome e categoria',    path: '/empresa/perfil-whatsapp',        color: '#25D366'  },
              { icon: '⚙️', label: 'Encerramento',  desc: 'Mensagem e pesquisa',       path: '__config_encerramento__',         color: C.textSec  },
              { icon: '📊', label: 'Rastreamento',  desc: 'Meta Pixel e Google Ads',   path: '/empresa/tracking',               color: '#f59e0b'  },
              { icon: '➕', label: 'Novo Atendente',desc: 'Cadastrar atendente',       path: '__criar_atendente__',             color: C.emerald  },
            ].map(item => (
              <div
                key={item.path}
                className="dash-nav-card"
                onClick={() => {
                  if (item.path === '__criar_atendente__') setShowCriarAtendente(true);
                  else if (item.path === '__config_encerramento__') setShowConfigEncerramento(true);
                  else navigate(item.path);
                }}
                style={{
                  ...g,
                  background: `linear-gradient(135deg, ${item.color}10 0%, ${item.color}05 100%)`,
                  border: `1px solid ${item.color}20`,
                  padding: '16px 18px',
                }}
              >
                <span style={{ fontSize: 26, display: 'block', marginBottom: 8 }}>{item.icon}</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>{item.desc}</div>
              </div>
            ))}
          </div>

          {/* ─── Top Tags ──────────────────────────────────────────────────── */}
          {metricasCrm && metricasCrm.top_tags.length > 0 && (
            <div style={{ ...g, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px 0', color: C.text }}>Tags mais usadas</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {metricasCrm.top_tags.map((tag, i) => {
                  const tagColors = [C.violet, C.emerald, C.amber, C.cyan, C.pink];
                  const cor = tagColors[i % tagColors.length];
                  return (
                    <div key={tag.nome} style={{
                      background: `${cor}15`, border: `1px solid ${cor}30`,
                      borderRadius: 10, padding: '8px 16px',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: cor }}>{tag.nome}</span>
                      <span style={{
                        background: `${cor}25`, color: cor,
                        borderRadius: 6, padding: '2px 8px',
                        fontSize: 11, fontWeight: 700,
                      }}>{tag.total}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>{/* /content */}
      </div>{/* /page */}

      {/* ─── Modal Config Encerramento ──────────────────────────────────── */}
      {showConfigEncerramento && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={() => setShowConfigEncerramento(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)',
              backdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '1.25rem', padding: 32, width: '100%', maxWidth: 480,
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 6px 0' }}>Configurar Encerramento</h2>
            <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 24px 0' }}>
              Defina a mensagem enviada ao cliente quando o atendimento for encerrado.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  Mensagem de Encerramento
                </label>
                <textarea
                  value={configEncerramento.mensagem_encerramento}
                  onChange={e => setConfigEncerramento(c => ({ ...c, mensagem_encerramento: e.target.value }))}
                  rows={4}
                  style={{
                    width: '100%', marginTop: 6, padding: '10px 14px',
                    background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
                    borderRadius: 10, color: C.text, fontSize: 14, outline: 'none',
                    boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12,
                border: `1px solid ${C.border}`,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Pesquisa de Satisfação</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                    Enviar pesquisa de 1 a 5 após encerramento
                  </div>
                </div>
                <button
                  onClick={() => setConfigEncerramento(c => ({ ...c, pesquisa_satisfacao_ativa: !c.pesquisa_satisfacao_ativa }))}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', flexShrink: 0,
                    background: configEncerramento.pesquisa_satisfacao_ativa ? C.emerald : 'rgba(255,255,255,0.15)',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3,
                    left: configEncerramento.pesquisa_satisfacao_ativa ? 23 : 3,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#fff', transition: 'left 0.2s',
                  }} />
                </button>
              </div>

              {configEncerramento.pesquisa_satisfacao_ativa && (
                <div style={{
                  padding: '12px 16px', background: 'rgba(139,92,246,0.08)', borderRadius: 10,
                  border: '1px solid rgba(139,92,246,0.2)', fontSize: 12, color: C.textSec,
                }}>
                  Após a mensagem de encerramento, o cliente receberá:
                  <br /><br />
                  <em style={{ color: C.textMuted }}>
                    "Como você avalia nosso atendimento?<br />
                    1 - Muito ruim | 2 - Ruim | 3 - Regular | 4 - Bom | 5 - Excelente"
                  </em>
                  <br /><br />
                  A nota será salva no atendimento.
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  onClick={() => setShowConfigEncerramento(false)}
                  style={{
                    flex: 1, padding: '11px 0', borderRadius: 10,
                    border: `1px solid ${C.border}`, background: 'transparent',
                    color: C.textSec, fontWeight: 600, cursor: 'pointer', fontSize: 14,
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarConfigEncerramento}
                  disabled={configSaving}
                  style={{
                    flex: 2, padding: '11px 0', borderRadius: 10, border: 'none',
                    background: configSaving ? 'rgba(255,255,255,0.1)' : 'linear-gradient(to right, #8b5cf6, #06b6d4)',
                    color: '#fff', fontWeight: 700, fontSize: 14, cursor: configSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {configSaving ? 'Salvando...' : 'Salvar Configuração'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Criar Atendente ────────────────────────────────────────── */}
      {showCriarAtendente && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={() => setShowCriarAtendente(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)',
              backdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '1.25rem', padding: 32, width: '100%', maxWidth: 400,
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 6px 0' }}>Novo Atendente</h2>
            <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 24px 0' }}>
              A senha temporária será: primeiras 4 letras do nome + 2026
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Nome de Exibição', key: 'nome', type: 'text', placeholder: 'Ex: João Silva' },
                { label: 'Email',             key: 'email', type: 'email', placeholder: 'joao@empresa.com' },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={criarForm[field.key as keyof typeof criarForm]}
                    onChange={e => setCriarForm(f => ({ ...f, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={{
                      width: '100%', marginTop: 6, padding: '10px 14px',
                      background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
                      borderRadius: 10, color: C.text, fontSize: 14, outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}

              {criarErro && (
                <div style={{ fontSize: 12, color: C.red, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
                  {criarErro}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  onClick={() => { setShowCriarAtendente(false); setCriarErro(''); setCriarForm({ nome: '', email: '' }); }}
                  style={{
                    flex: 1, padding: '11px 0', borderRadius: 10,
                    border: `1px solid ${C.border}`, background: 'transparent',
                    color: C.textSec, fontWeight: 600, cursor: 'pointer', fontSize: 14,
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={criarAtendente}
                  disabled={criarLoading || !criarForm.nome || !criarForm.email}
                  style={{
                    flex: 2, padding: '11px 0', borderRadius: 10, border: 'none',
                    background: criarLoading ? 'rgba(255,255,255,0.1)' : 'linear-gradient(to right, #10b981, #06b6d4)',
                    color: '#fff', fontWeight: 700, fontSize: 14, cursor: criarLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {criarLoading ? 'Criando...' : 'Criar Atendente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
