import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggle from '../components/ThemeToggle/ThemeToggle';
import api from '../services/api';

// ─── Animations ───────────────────────────────────────────────────────────────

const CSS_ANIM = `
@keyframes procFadeIn {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes procSlideIn {
  from { opacity: 0; transform: translateX(40px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes procModalIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes procSpin {
  to { transform: rotate(360deg); }
}
@keyframes procPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes timelineDot {
  from { transform: scale(0); }
  to   { transform: scale(1); }
}
.proc-page       { animation: procFadeIn 0.4s ease; }
.proc-drawer     { animation: procSlideIn 0.25s ease; }
.proc-modal      { animation: procModalIn 0.22s ease; }
.proc-spin       { animation: procSpin 0.8s linear infinite; }
.proc-row:hover  { transform: translateX(2px); }
.proc-row        { transition: background 0.15s, transform 0.15s; }
.proc-btn        { transition: all 0.15s ease; }
.proc-btn:hover  { transform: translateY(-1px); }
.proc-tab        { transition: all 0.15s ease; }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Parte {
  nome: string;
  tipo: string;
}

interface Processo {
  id: number;
  numero_cnj: string;
  tribunal: string;
  segmento: string;
  classe?: string;
  assunto?: string;
  status_atual?: string;
  cliente_id?: number;
  notificar_cliente: boolean;
  ativo: boolean;
  ultima_verificacao?: string;
  ultima_movimentacao_data?: string;
  criado_em?: string;
  partes?: Parte[];
  orgao_julgador?: string;
  movimentacoes?: Movimentacao[];
}

interface Movimentacao {
  id: number;
  data_movimentacao: string;
  descricao: string;
  resumo_ia?: string;
  codigo_nacional?: number;
  notificado_cliente: boolean;
  notificado_em?: string;
  criado_em: string;
}

interface Cliente {
  id: number;
  nome_completo: string;
  whatsapp_number: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatarNumCNJ(numero: string): string {
  // 0001234-12.2023.8.26.0100 — já está formatado
  return numero;
}

function formatarData(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatarDataHora(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const SEGMENTO_INFO: Record<string, { label: string; cor: string; emoji: string }> = {
  estadual:         { label: 'Estadual',     cor: '#3b82f6', emoji: '🏛️' },
  federal:          { label: 'Federal',      cor: '#6366f1', emoji: '⚖️' },
  trabalhista:      { label: 'Trabalhista',  cor: '#f59e0b', emoji: '👷' },
  eleitoral:        { label: 'Eleitoral',    cor: '#10b981', emoji: '🗳️' },
  stf:              { label: 'STF',          cor: '#8b5cf6', emoji: '🏛️' },
  stj:              { label: 'STJ',          cor: '#8b5cf6', emoji: '⚖️' },
  militar_federal:  { label: 'Militar Fed.', cor: '#ef4444', emoji: '🎖️' },
  militar_estadual: { label: 'Militar Est.', cor: '#ef4444', emoji: '🎖️' },
};

function SegmentoBadge({ segmento, dark }: { segmento: string; dark: boolean }) {
  const info = SEGMENTO_INFO[segmento] || { label: segmento, cor: '#6b7280', emoji: '⚖️' };
  return (
    <span style={{
      background: `${info.cor}20`,
      color: info.cor,
      border: `1px solid ${info.cor}40`,
      borderRadius: 6,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: 'nowrap' as const,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
    }}>
      {info.emoji} {info.label}
    </span>
  );
}

function TribunalBadge({ tribunal, dark }: { tribunal: string; dark: boolean }) {
  return (
    <span style={{
      background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
      color: dark ? '#94a3b8' : '#374151',
      border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
      borderRadius: 6,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.05em',
      textTransform: 'uppercase' as const,
    }}>
      {tribunal}
    </span>
  );
}

// ─── ProcessosPage ────────────────────────────────────────────────────────────

const ProcessosPage: React.FC = () => {
  const { theme, colors } = useTheme();
  const dark = theme === 'yoursystem';

  // Paleta adaptada ao tema
  const bg      = dark ? '#0b0f1a' : colors.dashboardBg;
  const surface = dark ? '#111827' : '#ffffff';
  const card    = dark ? '#1a2035' : '#ffffff';
  const border  = dark ? 'rgba(255,255,255,0.07)' : '#e5e7eb';
  const text    = dark ? '#f1f5f9' : '#111827';
  const textSec = dark ? '#94a3b8' : '#6b7280';
  const textMut = dark ? '#64748b' : '#9ca3af';
  const accent  = dark ? '#4B6EC5' : '#2563eb';
  const accentHover = dark ? '#5a7fd4' : '#1d4ed8';

  const GLASS: React.CSSProperties = {
    background: dark
      ? 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)'
      : '#ffffff',
    border: `1px solid ${border}`,
    borderRadius: '1rem',
    boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.25)' : '0 1px 4px rgba(0,0,0,0.08)',
  };

  // ─── State ─────────────────────────────────────────────────────────────────
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const [selecionado, setSelecionado] = useState<Processo | null>(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [abaDetalhe, setAbaDetalhe] = useState<'movimentacoes' | 'dados'>('movimentacoes');

  const [modalCadastro, setModalCadastro] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);

  // Form cadastro
  const [fNumeroCNJ, setFNumeroCNJ] = useState('');
  const [fClienteId, setFClienteId] = useState<number | null>(null);
  const [fNotificar, setFNotificar] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erroCadastro, setErroCadastro] = useState('');

  // Verificar agora
  const [verificando, setVerificando] = useState<number | null>(null);

  // ─── Carregar dados ────────────────────────────────────────────────────────
  const carregar = useCallback(async (novoOffset = 0) => {
    setLoading(true);
    try {
      const { data } = await api.get('/processos/', { params: { limit: LIMIT, offset: novoOffset } });
      setProcessos(data.items);
      setTotal(data.total);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  const carregarClientes = useCallback(async () => {
    try {
      const { data } = await api.get('/clientes/', { params: { limit: 200 } });
      setClientes(data.items);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { carregar(0); }, [carregar]);
  useEffect(() => { if (modalCadastro) carregarClientes(); }, [modalCadastro, carregarClientes]);

  const abrirDetalhe = async (proc: Processo) => {
    setSelecionado(proc);
    setAbaDetalhe('movimentacoes');
    setLoadingDetalhe(true);
    try {
      const { data } = await api.get<Processo>(`/processos/${proc.id}`);
      setSelecionado(data);
    } catch { /* ignore */ } finally {
      setLoadingDetalhe(false);
    }
  };

  // ─── Cadastrar ─────────────────────────────────────────────────────────────
  const cadastrar = async () => {
    if (!fNumeroCNJ.trim()) { setErroCadastro('Informe o número do processo'); return; }
    setSalvando(true);
    setErroCadastro('');
    try {
      await api.post('/processos/', {
        numero_cnj: fNumeroCNJ.trim(),
        cliente_id: fClienteId || null,
        notificar_cliente: fNotificar,
      });
      setModalCadastro(false);
      setFNumeroCNJ('');
      setFClienteId(null);
      setFNotificar(true);
      carregar(0);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Erro ao cadastrar processo';
      setErroCadastro(msg);
    } finally {
      setSalvando(false);
    }
  };

  // ─── Verificar agora ───────────────────────────────────────────────────────
  const verificarAgora = async (proc: Processo) => {
    setVerificando(proc.id);
    try {
      await api.post(`/processos/${proc.id}/verificar-agora`);
      setTimeout(() => {
        if (selecionado?.id === proc.id) abrirDetalhe(proc);
        carregar(offset);
      }, 2500);
    } catch { /* ignore */ } finally {
      setTimeout(() => setVerificando(null), 2500);
    }
  };

  // ─── Toggle ativo ──────────────────────────────────────────────────────────
  const toggleAtivo = async (proc: Processo) => {
    try {
      await api.put(`/processos/${proc.id}`, { ativo: !proc.ativo });
      setProcessos(ps => ps.map(p => p.id === proc.id ? { ...p, ativo: !p.ativo } : p));
      if (selecionado?.id === proc.id) setSelecionado(s => s ? { ...s, ativo: !s.ativo } : s);
    } catch { /* ignore */ }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: dark ? 'rgba(255,255,255,0.05)' : '#f9fafb',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : '#d1d5db'}`,
    borderRadius: 8,
    padding: '10px 14px',
    color: text,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  return (
    <>
      <style>{CSS_ANIM}</style>

      <div className="proc-page" style={{
        display: 'flex',
        height: '100vh',
        background: bg,
        color: text,
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        overflow: 'hidden',
      }}>

        {/* ── Painel Principal ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}>

          {/* Header */}
          <div style={{
            padding: '20px 28px 16px',
            borderBottom: `1px solid ${border}`,
            background: dark ? 'rgba(11,15,26,0.95)' : '#ffffff',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `linear-gradient(135deg, ${accent}, ${accentHover})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>⚖️</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>
                  Processos Judiciais
                </div>
                <div style={{ fontSize: 12, color: textSec }}>
                  {total} processo{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ThemeToggle />
              <button
                className="proc-btn"
                onClick={() => { setErroCadastro(''); setModalCadastro(true); }}
                style={{
                  background: `linear-gradient(135deg, ${accent}, ${accentHover})`,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: `0 4px 16px ${accent}40`,
                }}
              >
                <span style={{ fontSize: 16 }}>+</span> Cadastrar Processo
              </button>
            </div>
          </div>

          {/* Lista de Processos */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{
                    ...GLASS,
                    height: 90,
                    background: dark ? 'rgba(255,255,255,0.03)' : '#f3f4f6',
                    animation: 'procPulse 1.5s ease infinite',
                  }} />
                ))}
              </div>
            ) : processos.length === 0 ? (
              <EmptyState dark={dark} accent={accent} onCadastrar={() => setModalCadastro(true)} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {processos.map(proc => (
                  <ProcessoCard
                    key={proc.id}
                    proc={proc}
                    dark={dark}
                    accent={accent}
                    surface={surface}
                    card={card}
                    border={border}
                    text={text}
                    textSec={textSec}
                    textMut={textMut}
                    GLASS={GLASS}
                    selecionado={selecionado?.id === proc.id}
                    verificando={verificando === proc.id}
                    onClick={() => abrirDetalhe(proc)}
                    onVerificar={() => verificarAgora(proc)}
                    onToggleAtivo={() => toggleAtivo(proc)}
                  />
                ))}
              </div>
            )}

            {/* Paginação */}
            {total > LIMIT && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
                <button
                  onClick={() => { const no = Math.max(0, offset - LIMIT); setOffset(no); carregar(no); }}
                  disabled={offset === 0}
                  style={{
                    background: dark ? 'rgba(255,255,255,0.06)' : '#f3f4f6',
                    border: `1px solid ${border}`,
                    borderRadius: 8, padding: '8px 16px',
                    color: offset === 0 ? textMut : text,
                    cursor: offset === 0 ? 'not-allowed' : 'pointer', fontSize: 13,
                  }}
                >← Anterior</button>
                <span style={{ padding: '8px 16px', fontSize: 13, color: textSec }}>
                  {Math.floor(offset / LIMIT) + 1} / {Math.ceil(total / LIMIT)}
                </span>
                <button
                  onClick={() => { const no = offset + LIMIT; setOffset(no); carregar(no); }}
                  disabled={offset + LIMIT >= total}
                  style={{
                    background: dark ? 'rgba(255,255,255,0.06)' : '#f3f4f6',
                    border: `1px solid ${border}`,
                    borderRadius: 8, padding: '8px 16px',
                    color: offset + LIMIT >= total ? textMut : text,
                    cursor: offset + LIMIT >= total ? 'not-allowed' : 'pointer', fontSize: 13,
                  }}
                >Próxima →</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Drawer Detalhe ── */}
        {selecionado && (
          <DrawerDetalhe
            proc={selecionado}
            dark={dark}
            accent={accent}
            accentHover={accentHover}
            surface={surface}
            border={border}
            text={text}
            textSec={textSec}
            textMut={textMut}
            GLASS={GLASS}
            loading={loadingDetalhe}
            aba={abaDetalhe}
            onAba={setAbaDetalhe}
            onClose={() => setSelecionado(null)}
            onVerificar={() => verificarAgora(selecionado)}
            verificando={verificando === selecionado.id}
          />
        )}
      </div>

      {/* ── Modal Cadastro ── */}
      {modalCadastro && (
        <ModalCadastro
          dark={dark}
          accent={accent}
          surface={surface}
          border={border}
          text={text}
          textSec={textSec}
          textMut={textMut}
          inputStyle={inputStyle}
          clientes={clientes}
          fNumeroCNJ={fNumeroCNJ}
          setFNumeroCNJ={setFNumeroCNJ}
          fClienteId={fClienteId}
          setFClienteId={setFClienteId}
          fNotificar={fNotificar}
          setFNotificar={setFNotificar}
          salvando={salvando}
          erro={erroCadastro}
          onSalvar={cadastrar}
          onClose={() => setModalCadastro(false)}
        />
      )}
    </>
  );
};

// ─── ProcessoCard ─────────────────────────────────────────────────────────────

const ProcessoCard: React.FC<{
  proc: Processo;
  dark: boolean;
  accent: string;
  surface: string;
  card: string;
  border: string;
  text: string;
  textSec: string;
  textMut: string;
  GLASS: React.CSSProperties;
  selecionado: boolean;
  verificando: boolean;
  onClick: () => void;
  onVerificar: () => void;
  onToggleAtivo: () => void;
}> = ({ proc, dark, accent, surface, card, border, text, textSec, textMut, GLASS, selecionado, verificando, onClick, onVerificar, onToggleAtivo }) => {

  return (
    <div
      className="proc-row"
      style={{
        ...GLASS,
        padding: '16px 20px',
        cursor: 'pointer',
        border: selecionado ? `1px solid ${accent}60` : `1px solid ${border}`,
        background: selecionado
          ? (dark ? `${accent}12` : `${accent}08`)
          : (dark ? 'rgba(26,32,53,0.8)' : '#ffffff'),
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
      onClick={onClick}
    >
      {/* Ícone segmento */}
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: dark ? 'rgba(255,255,255,0.05)' : '#f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
      }}>
        {SEGMENTO_INFO[proc.segmento]?.emoji || '⚖️'}
      </div>

      {/* Info principal */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: text, fontFamily: 'monospace', letterSpacing: '0.02em' }}>
            {formatarNumCNJ(proc.numero_cnj)}
          </span>
          <TribunalBadge tribunal={proc.tribunal} dark={dark} />
          <SegmentoBadge segmento={proc.segmento} dark={dark} />
          {!proc.ativo && (
            <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', border: '1px solid #6b728040', borderRadius: 4, padding: '1px 6px' }}>
              INATIVO
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const }}>
          {proc.classe && (
            <span style={{ fontSize: 12, color: textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 220 }}>
              {proc.classe}
            </span>
          )}
          {proc.status_atual && (
            <span style={{ fontSize: 11, color: textMut }}>
              Status: <span style={{ color: textSec }}>{proc.status_atual}</span>
            </span>
          )}
        </div>
      </div>

      {/* Última movimentação */}
      <div style={{ textAlign: 'right' as const, flexShrink: 0, display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 6 }}>
        {proc.ultima_movimentacao_data && (
          <div style={{ fontSize: 11, color: textSec }}>
            <span style={{ color: textMut }}>Últ. mov.</span><br />
            {formatarData(proc.ultima_movimentacao_data)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Btn verificar */}
          <button
            className="proc-btn"
            onClick={e => { e.stopPropagation(); onVerificar(); }}
            disabled={verificando}
            title="Verificar agora no DataJud"
            style={{
              background: dark ? 'rgba(255,255,255,0.06)' : '#f3f4f6',
              border: `1px solid ${border}`,
              borderRadius: 7, padding: '5px 10px',
              color: textSec, cursor: verificando ? 'wait' : 'pointer',
              fontSize: 14, display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {verificando
              ? <span className="proc-spin" style={{ display: 'inline-block', fontSize: 12 }}>⟳</span>
              : '🔄'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Drawer Detalhe ───────────────────────────────────────────────────────────

const DrawerDetalhe: React.FC<{
  proc: Processo;
  dark: boolean;
  accent: string;
  accentHover: string;
  surface: string;
  border: string;
  text: string;
  textSec: string;
  textMut: string;
  GLASS: React.CSSProperties;
  loading: boolean;
  aba: 'movimentacoes' | 'dados';
  onAba: (a: 'movimentacoes' | 'dados') => void;
  onClose: () => void;
  onVerificar: () => void;
  verificando: boolean;
}> = ({ proc, dark, accent, accentHover, surface, border, text, textSec, textMut, GLASS, loading, aba, onAba, onClose, onVerificar, verificando }) => {

  const bg = dark ? '#111827' : '#f9fafb';

  return (
    <div className="proc-drawer" style={{
      width: 420,
      flexShrink: 0,
      borderLeft: `1px solid ${border}`,
      background: bg,
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
    }}>
      {/* Header do drawer */}
      <div style={{
        padding: '18px 20px',
        borderBottom: `1px solid ${border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', color: text, letterSpacing: '0.02em', marginBottom: 6 }}>
              {formatarNumCNJ(proc.numero_cnj)}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
              <TribunalBadge tribunal={proc.tribunal} dark={dark} />
              <SegmentoBadge segmento={proc.segmento} dark={dark} />
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: textSec, cursor: 'pointer',
              fontSize: 20, lineHeight: 1, padding: 4, borderRadius: 6,
              flexShrink: 0,
            }}
          >✕</button>
        </div>

        {proc.classe && (
          <div style={{ fontSize: 12, color: textSec }}>
            <span style={{ color: textMut }}>Classe: </span>{proc.classe}
          </div>
        )}
        {proc.assunto && (
          <div style={{ fontSize: 12, color: textSec }}>
            <span style={{ color: textMut }}>Assunto: </span>{proc.assunto}
          </div>
        )}
        {proc.orgao_julgador && (
          <div style={{ fontSize: 12, color: textSec }}>
            <span style={{ color: textMut }}>Órgão: </span>{proc.orgao_julgador}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            className="proc-btn"
            onClick={onVerificar}
            disabled={verificando}
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accentHover})`,
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 14px', fontSize: 12, fontWeight: 600,
              cursor: verificando ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: `0 2px 8px ${accent}40`,
            }}
          >
            {verificando
              ? <><span className="proc-spin" style={{ display: 'inline-block' }}>⟳</span> Verificando...</>
              : '🔄 Verificar no DataJud'}
          </button>
        </div>
      </div>

      {/* Abas */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${border}`,
        flexShrink: 0,
      }}>
        {(['movimentacoes', 'dados'] as const).map(a => (
          <button
            key={a}
            className="proc-tab"
            onClick={() => onAba(a)}
            style={{
              flex: 1, padding: '12px 8px', border: 'none',
              background: 'none', cursor: 'pointer',
              color: aba === a ? accent : textSec,
              fontWeight: aba === a ? 600 : 400,
              fontSize: 13,
              borderBottom: `2px solid ${aba === a ? accent : 'transparent'}`,
            }}
          >
            {a === 'movimentacoes' ? '📋 Movimentações' : '📁 Dados'}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {loading ? (
          <div style={{ textAlign: 'center' as const, color: textMut, padding: 40 }}>
            <span className="proc-spin" style={{ display: 'inline-block', fontSize: 24 }}>⟳</span>
            <div style={{ marginTop: 8, fontSize: 13 }}>Carregando...</div>
          </div>
        ) : aba === 'movimentacoes' ? (
          <TimelineMovimentacoes
            movimentacoes={proc.movimentacoes || []}
            dark={dark}
            accent={accent}
            text={text}
            textSec={textSec}
            textMut={textMut}
            border={border}
          />
        ) : (
          <DadosProcesso
            proc={proc}
            dark={dark}
            accent={accent}
            text={text}
            textSec={textSec}
            textMut={textMut}
            border={border}
          />
        )}
      </div>
    </div>
  );
};

// ─── Timeline Movimentações ───────────────────────────────────────────────────

const TimelineMovimentacoes: React.FC<{
  movimentacoes: Movimentacao[];
  dark: boolean;
  accent: string;
  text: string;
  textSec: string;
  textMut: string;
  border: string;
}> = ({ movimentacoes, dark, accent, text, textSec, textMut, border }) => {

  if (movimentacoes.length === 0) {
    return (
      <div style={{ textAlign: 'center' as const, color: textMut, padding: '40px 0' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: textSec }}>Nenhuma movimentação</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          Clique em "Verificar no DataJud" para buscar atualizações
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' as const }}>
      {/* Linha vertical da timeline */}
      <div style={{
        position: 'absolute' as const,
        left: 11, top: 20, bottom: 20,
        width: 2,
        background: dark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
        borderRadius: 1,
      }} />

      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20 }}>
        {movimentacoes.map((mov, i) => (
          <div key={mov.id} style={{ display: 'flex', gap: 16 }}>
            {/* Dot da timeline */}
            <div style={{
              width: 24, flexShrink: 0,
              display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: i === 0 ? accent : (dark ? 'rgba(255,255,255,0.2)' : '#d1d5db'),
                border: `2px solid ${i === 0 ? accent : (dark ? 'rgba(255,255,255,0.1)' : '#e5e7eb')}`,
                marginTop: 4,
                boxShadow: i === 0 ? `0 0 8px ${accent}80` : 'none',
                animation: 'timelineDot 0.3s ease',
                flexShrink: 0,
              }} />
            </div>

            {/* Conteúdo */}
            <div style={{
              flex: 1,
              background: dark ? 'rgba(255,255,255,0.03)' : '#f9fafb',
              border: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : '#e5e7eb'}`,
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 0,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: accent, fontWeight: 600 }}>
                  {formatarData(mov.data_movimentacao)}
                </span>
                {mov.notificado_cliente && (
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: '#10b981',
                    background: '#10b98118',
                    border: '1px solid #10b98130',
                    borderRadius: 4, padding: '1px 6px',
                  }}>✓ Notificado</span>
                )}
              </div>

              {/* Resumo IA */}
              {mov.resumo_ia && mov.resumo_ia !== mov.descricao && (
                <div style={{
                  fontSize: 13, color: text, lineHeight: 1.5,
                  marginBottom: 8, fontWeight: 500,
                }}>
                  {mov.resumo_ia}
                </div>
              )}

              {/* Descrição original */}
              <div style={{
                fontSize: 11,
                color: textMut,
                padding: '6px 10px',
                background: dark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.04)',
                borderRadius: 6,
                borderLeft: `2px solid ${dark ? 'rgba(255,255,255,0.1)' : '#d1d5db'}`,
                fontStyle: 'italic',
                lineHeight: 1.4,
              }}>
                Original: {mov.descricao}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Dados do Processo ────────────────────────────────────────────────────────

const DadosProcesso: React.FC<{
  proc: Processo;
  dark: boolean;
  accent: string;
  text: string;
  textSec: string;
  textMut: string;
  border: string;
}> = ({ proc, dark, accent, text, textSec, textMut, border }) => {

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '10px 0',
    borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : '#f3f4f6'}`,
    gap: 12,
  };

  const Campo = ({ label, valor }: { label: string; valor?: string | null }) => (
    <div style={rowStyle}>
      <span style={{ fontSize: 12, color: textMut, minWidth: 100 }}>{label}</span>
      <span style={{ fontSize: 12, color: valor ? text : textMut, textAlign: 'right' as const, flex: 1, wordBreak: 'break-word' as const }}>
        {valor || '—'}
      </span>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: textMut, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 12 }}>
        IDENTIFICAÇÃO
      </div>

      <Campo label="Número CNJ" valor={proc.numero_cnj} />
      <Campo label="Tribunal" valor={proc.tribunal?.toUpperCase()} />
      <Campo label="Segmento" valor={SEGMENTO_INFO[proc.segmento]?.label || proc.segmento} />
      <Campo label="Classe" valor={proc.classe} />
      <Campo label="Assunto" valor={proc.assunto} />
      <Campo label="Órgão Julgador" valor={proc.orgao_julgador} />
      <Campo label="Status" valor={proc.status_atual} />

      {proc.partes && proc.partes.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: textMut, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginTop: 20, marginBottom: 12 }}>
            PARTES
          </div>
          {proc.partes.map((p, i) => (
            <div key={i} style={rowStyle}>
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: p.tipo === 'ativo' || p.tipo === 'autor' ? '#3b82f6'
                     : p.tipo === 'passivo' || p.tipo === 'reu' ? '#ef4444'
                     : textMut,
                textTransform: 'capitalize' as const,
                minWidth: 70,
              }}>
                {p.tipo}
              </span>
              <span style={{ fontSize: 12, color: text, textAlign: 'right' as const, flex: 1 }}>{p.nome}</span>
            </div>
          ))}
        </>
      )}

      <div style={{ fontSize: 11, fontWeight: 600, color: textMut, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginTop: 20, marginBottom: 12 }}>
        MONITORAMENTO
      </div>
      <Campo label="Notificar cliente" valor={proc.notificar_cliente ? '✓ Sim' : '✗ Não'} />
      <Campo label="Última verificação" valor={formatarDataHora(proc.ultima_verificacao)} />
      <Campo label="Última movimentação" valor={formatarData(proc.ultima_movimentacao_data)} />
      <Campo label="Cadastrado em" valor={formatarData(proc.criado_em)} />
      <Campo label="Status" valor={proc.ativo ? '✓ Ativo' : '✗ Inativo'} />
    </div>
  );
};

// ─── Empty State ──────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ dark: boolean; accent: string; onCadastrar: () => void }> = ({ dark, accent, onCadastrar }) => (
  <div style={{ textAlign: 'center' as const, padding: '60px 0', maxWidth: 380, margin: '0 auto' }}>
    <div style={{
      width: 80, height: 80, borderRadius: 20,
      background: `${accent}18`,
      border: `2px solid ${accent}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 36, margin: '0 auto 20px',
    }}>⚖️</div>
    <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: dark ? '#f1f5f9' : '#111827' }}>
      Nenhum processo cadastrado
    </div>
    <div style={{ fontSize: 14, color: dark ? '#94a3b8' : '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
      Cadastre um processo pelo número CNJ e o sistema irá monitorar
      automaticamente as movimentações e notificar seus clientes.
    </div>
    <button
      className="proc-btn"
      onClick={onCadastrar}
      style={{
        background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
        color: '#fff', border: 'none', borderRadius: 10,
        padding: '12px 24px', fontSize: 14, fontWeight: 600,
        cursor: 'pointer', boxShadow: `0 4px 16px ${accent}40`,
      }}
    >
      + Cadastrar primeiro processo
    </button>
  </div>
);

// ─── Modal Cadastro ───────────────────────────────────────────────────────────

const ModalCadastro: React.FC<{
  dark: boolean;
  accent: string;
  surface: string;
  border: string;
  text: string;
  textSec: string;
  textMut: string;
  inputStyle: React.CSSProperties;
  clientes: Cliente[];
  fNumeroCNJ: string;
  setFNumeroCNJ: (v: string) => void;
  fClienteId: number | null;
  setFClienteId: (v: number | null) => void;
  fNotificar: boolean;
  setFNotificar: (v: boolean) => void;
  salvando: boolean;
  erro: string;
  onSalvar: () => void;
  onClose: () => void;
}> = ({
  dark, accent, surface, border, text, textSec, textMut, inputStyle,
  clientes, fNumeroCNJ, setFNumeroCNJ, fClienteId, setFClienteId,
  fNotificar, setFNotificar, salvando, erro, onSalvar, onClose,
}) => {

  const handleNumero = (v: string) => {
    // Auto-formata enquanto digita: 0000000-00.0000.0.00.0000
    const digits = v.replace(/\D/g, '');
    let formatted = digits;
    if (digits.length > 7)  formatted = digits.slice(0,7) + '-' + digits.slice(7);
    if (digits.length > 9)  formatted = formatted.slice(0,10) + '.' + digits.slice(9);
    if (digits.length > 13) formatted = formatted.slice(0,15) + '.' + digits.slice(13);
    if (digits.length > 14) formatted = formatted.slice(0,17) + '.' + digits.slice(14);
    if (digits.length > 16) formatted = formatted.slice(0,20) + '.' + digits.slice(16);
    setFNumeroCNJ(formatted.slice(0, 25));
  };

  return (
    <div style={{
      position: 'fixed' as const, inset: 0,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div className="proc-modal" style={{
        background: surface,
        border: `1px solid ${border}`,
        borderRadius: 16,
        padding: 28,
        width: '100%',
        maxWidth: 500,
        boxShadow: dark ? '0 24px 80px rgba(0,0,0,0.6)' : '0 8px 40px rgba(0,0,0,0.2)',
      }}>
        {/* Header modal */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: text }}>Cadastrar Processo</div>
            <div style={{ fontSize: 12, color: textSec, marginTop: 2 }}>
              O tribunal é identificado automaticamente pelo número CNJ
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: textSec, cursor: 'pointer', fontSize: 20, padding: 4 }}>✕</button>
        </div>

        {/* Número CNJ */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: textMut, fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Número CNJ *
          </label>
          <input
            type="text"
            placeholder="0000000-00.0000.0.00.0000"
            value={fNumeroCNJ}
            onChange={e => handleNumero(e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 15, letterSpacing: '0.05em' }}
          />
          <div style={{ fontSize: 11, color: textMut, marginTop: 4 }}>
            Formato: NNNNNNN-DD.AAAA.J.TT.OOOO (ex: 0001234-12.2023.8.26.0100)
          </div>
        </div>

        {/* Cliente */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: textMut, fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Vincular a cliente (opcional)
          </label>
          <select
            value={fClienteId ?? ''}
            onChange={e => setFClienteId(e.target.value ? parseInt(e.target.value) : null)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">— Nenhum cliente —</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>
                {c.nome_completo} ({c.whatsapp_number})
              </option>
            ))}
          </select>
        </div>

        {/* Notificar */}
        <div style={{
          marginBottom: 20,
          padding: '12px 14px',
          background: dark ? 'rgba(255,255,255,0.03)' : '#f9fafb',
          border: `1px solid ${border}`,
          borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: text }}>Notificar cliente via WhatsApp</div>
            <div style={{ fontSize: 11, color: textMut }}>Envia resumo das movimentações automaticamente</div>
          </div>
          <div
            onClick={() => setFNotificar(!fNotificar)}
            style={{
              width: 40, height: 22, borderRadius: 11,
              background: fNotificar ? accent : (dark ? 'rgba(255,255,255,0.12)' : '#d1d5db'),
              cursor: 'pointer', position: 'relative' as const, transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: '50%', background: '#fff',
              position: 'absolute' as const, top: 3, left: fNotificar ? 21 : 3,
              transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }} />
          </div>
        </div>

        {/* Erro */}
        {erro && (
          <div style={{
            background: '#ef444420', border: '1px solid #ef444440',
            borderRadius: 8, padding: '10px 14px',
            color: '#ef4444', fontSize: 13, marginBottom: 16,
          }}>
            ⚠️ {erro}
          </div>
        )}

        {/* Info DataJud */}
        <div style={{
          background: `${accent}10`, border: `1px solid ${accent}25`,
          borderRadius: 8, padding: '10px 14px', marginBottom: 20,
          fontSize: 12, color: textSec, lineHeight: 1.5,
        }}>
          💡 Após cadastrar, o sistema consultará o DataJud automaticamente e importará
          as movimentações existentes.
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: `1px solid ${border}`,
              borderRadius: 9, padding: '10px 20px', color: textSec,
              cursor: 'pointer', fontSize: 14,
            }}
          >Cancelar</button>
          <button
            onClick={onSalvar}
            disabled={salvando || !fNumeroCNJ.trim()}
            style={{
              background: salvando || !fNumeroCNJ.trim()
                ? (dark ? 'rgba(255,255,255,0.1)' : '#e5e7eb')
                : `linear-gradient(135deg, ${accent}, ${accent}cc)`,
              color: salvando || !fNumeroCNJ.trim() ? textMut : '#fff',
              border: 'none', borderRadius: 9, padding: '10px 24px',
              fontSize: 14, fontWeight: 600,
              cursor: salvando || !fNumeroCNJ.trim() ? 'not-allowed' : 'pointer',
              boxShadow: salvando || !fNumeroCNJ.trim() ? 'none' : `0 4px 14px ${accent}40`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {salvando
              ? <><span className="proc-spin" style={{ display: 'inline-block' }}>⟳</span> Cadastrando...</>
              : '⚖️ Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProcessosPage;
