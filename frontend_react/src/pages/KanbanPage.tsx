import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useChatStore } from '../store/chatStore';
import api from '../services/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Tag {
  id: number;
  nome: string;
  cor: string;
  emoji?: string;
  total_clientes?: number;
}

interface Card {
  id: number;
  nome: string;
  whatsapp_number: string;
  email?: string;
  funil_etapa: string;
  valor_estimado?: number;
  responsavel_id?: number;
  responsavel_nome?: string;
  resumo_conversa?: string;
  preferencias?: string;
  observacoes_crm?: string;
  foto_url?: string;
  crm_arquivado?: boolean;
  tags: Tag[];
}

interface Etapa {
  id: string;
  label: string;
  cor: string;
}

interface Responsavel {
  id: number;
  nome: string;
  foto_url?: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const EMOJIS = ['🔥', '💰', '❄️', '📅', '🤖', '📢', '✅', '🔴', '⭐', '🎯', '💎', '🚀'];
const CORES = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#3b82f6', '#14b8a6', '#f97316'];

const C = {
  bg: '#0b0f1a',
  surface: '#111827',
  card: '#1a2035',
  cardHover: '#1e2642',
  border: 'rgba(255,255,255,0.07)',
  borderLight: 'rgba(255,255,255,0.12)',
  text: '#f1f5f9',
  textSec: '#94a3b8',
  textMuted: '#64748b',
  accent: '#6366f1',
  accentGlow: 'rgba(99,102,241,0.25)',
  green: '#22c55e',
  red: '#ef4444',
  overlay: 'rgba(0,0,0,0.75)',
};

// ─── Estilos CSS injetados ────────────────────────────────────────────────────

const KANBAN_CSS = `
@keyframes kanbanFadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes kanbanSlideUp {
  from { opacity: 0; transform: translateY(30px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
  50% { box-shadow: 0 0 20px 4px rgba(99,102,241,0.15); }
}
.kanban-page { animation: kanbanFadeIn 0.4s ease; }
.kanban-col { transition: all 0.25s ease; }
.kanban-col:hover { transform: translateY(-2px); }
.kanban-card-item {
  transition: all 0.2s ease;
  cursor: grab;
}
.kanban-card-item:hover {
  transform: translateY(-3px) scale(1.01);
  box-shadow: 0 12px 30px rgba(0,0,0,0.4);
}
.kanban-card-item:active { cursor: grabbing; }
.kanban-modal { animation: kanbanSlideUp 0.3s ease; }
.kanban-stat-card {
  transition: all 0.2s ease;
}
.kanban-stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}
.kanban-col-dragover {
  background: rgba(99,102,241,0.06) !important;
  border-color: rgba(99,102,241,0.4) !important;
  box-shadow: inset 0 0 30px rgba(99,102,241,0.05);
}
.kanban-loading {
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
.kanban-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
.kanban-scroll::-webkit-scrollbar-track { background: transparent; }
.kanban-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
.kanban-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
.kanban-board-wrapper {
  position: relative;
}
.kanban-board-wrapper::after {
  content: '';
  position: absolute;
  top: 0; right: 0; bottom: 0; width: 60px;
  background: linear-gradient(90deg, transparent, #0b0f1a);
  pointer-events: none;
  z-index: 3;
}
select option { background: #111827; color: #f1f5f9; }
`;

// ─── Componente Card ──────────────────────────────────────────────────────────

const KanbanCardItem: React.FC<{
  card: Card;
  onDragStart: (e: React.DragEvent, cardId: number, fromEtapa: string) => void;
  onClick: (card: Card) => void;
}> = ({ card, onDragStart, onClick }) => {
  const initials = card.nome?.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card.id, card.funil_etapa)}
      onClick={() => onClick(card)}
      className="kanban-card-item"
      style={{
        background: `linear-gradient(135deg, ${C.card} 0%, ${C.surface} 100%)`,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
      }}
    >
      {/* Header: avatar + nome */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        {card.foto_url ? (
          <img src={card.foto_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: `linear-gradient(135deg, ${C.accent} 0%, #a855f7 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>
            {initials}
          </div>
        )}
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {card.nome}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted }}>
            {card.whatsapp_number}
          </div>
        </div>
      </div>

      {/* Tags */}
      {card.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {card.tags.slice(0, 3).map(tag => (
            <span key={tag.id} style={{
              background: tag.cor + '20',
              color: tag.cor,
              borderRadius: 6,
              fontSize: 10,
              padding: '2px 7px',
              fontWeight: 600,
              border: `1px solid ${tag.cor}40`,
              letterSpacing: 0.3,
            }}>
              {tag.emoji && `${tag.emoji} `}{tag.nome}
            </span>
          ))}
          {card.tags.length > 3 && (
            <span style={{ fontSize: 10, color: C.textMuted, padding: '2px 5px' }}>+{card.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer: valor + responsável */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {card.valor_estimado ? (
          <span style={{
            fontSize: 12, fontWeight: 700,
            background: `linear-gradient(90deg, ${C.green}, #4ade80)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            R$ {card.valor_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        ) : <span />}
        {card.responsavel_nome && (
          <span style={{
            fontSize: 10, color: C.textSec,
            background: 'rgba(255,255,255,0.05)',
            padding: '2px 8px', borderRadius: 6,
            border: `1px solid ${C.border}`,
          }}>
            {card.responsavel_nome.split(' ')[0]}
          </span>
        )}
      </div>
    </div>
  );
};

// ─── Componente Principal ─────────────────────────────────────────────────────

const KanbanPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setSelecionarConversa } = useChatStore();
  const isEmpresa = user?.role === 'empresa';

  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [colunas, setColunas] = useState<Record<string, Card[]>>({});
  const [tags, setTags] = useState<Tag[]>([]);
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [loading, setLoading] = useState(true);

  const [filtroResponsavel, setFiltroResponsavel] = useState<number | ''>('');
  const [filtroTag, setFiltroTag] = useState<number | ''>('');
  const [mostrarArquivados, setMostrarArquivados] = useState(false);

  const dragCard = useRef<{ id: number; fromEtapa: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const [cardSelecionado, setCardSelecionado] = useState<Card | null>(null);
  const [showTagManager, setShowTagManager] = useState(false);
  const [formCrm, setFormCrm] = useState<Partial<Card>>({});
  const [salvando, setSalvando] = useState(false);

  const [novaTag, setNovaTag] = useState({ nome: '', cor: '#6366f1', emoji: '' });
  const [criadoTag, setCriadoTag] = useState(false);

  // IA
  const [analisandoIA, setAnalisandoIA] = useState(false);
  const [sugestaoIA, setSugestaoIA] = useState<{
    resumo_conversa: string;
    funil_etapa: string;
    preferencias: string;
    observacoes_crm: string;
    valor_estimado: number | null;
    mensagens_analisadas: number;
  } | null>(null);

  // Inject CSS
  useEffect(() => {
    const id = 'kanban-styles';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = KANBAN_CSS;
      document.head.appendChild(style);
    }
  }, []);

  // ─── Carregamento ────────────────────────────────────────────────────────────

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { arquivados: mostrarArquivados };
      if (filtroResponsavel) params.responsavel_id = filtroResponsavel;
      if (filtroTag) params.tag_id = filtroTag;

      const [funil, tagsRes, respRes] = await Promise.all([
        api.get('/crm/funil', { params }),
        api.get('/crm/tags'),
        api.get('/crm/responsaveis'),
      ]);

      setEtapas(funil.data.etapas);
      setColunas(funil.data.colunas);
      setTags(tagsRes.data);
      setResponsaveis(respRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filtroResponsavel, filtroTag, mostrarArquivados]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── Drag & Drop ──────────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, cardId: number, fromEtapa: string) => {
    dragCard.current = { id: cardId, fromEtapa };
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, etapaId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(etapaId);
  };

  const handleDrop = async (e: React.DragEvent, toEtapa: string) => {
    e.preventDefault();
    setDragOver(null);
    if (!dragCard.current || dragCard.current.fromEtapa === toEtapa) return;

    const { id, fromEtapa } = dragCard.current;
    dragCard.current = null;

    setColunas(prev => {
      const card = prev[fromEtapa]?.find(c => c.id === id);
      if (!card) return prev;
      return {
        ...prev,
        [fromEtapa]: prev[fromEtapa].filter(c => c.id !== id),
        [toEtapa]: [{ ...card, funil_etapa: toEtapa }, ...(prev[toEtapa] || [])],
      };
    });

    try {
      await api.patch(`/crm/clientes/${id}/etapa`, { funil_etapa: toEtapa });
    } catch {
      carregar();
    }
  };

  // ─── Modal CRM ────────────────────────────────────────────────────────────────

  const abrirCard = (card: Card) => {
    setCardSelecionado(card);
    setFormCrm({
      nome: card.nome,
      email: card.email,
      funil_etapa: card.funil_etapa,
      valor_estimado: card.valor_estimado,
      responsavel_id: card.responsavel_id,
      resumo_conversa: card.resumo_conversa,
      preferencias: card.preferencias,
      observacoes_crm: card.observacoes_crm,
    });
  };

  const salvarCrm = async () => {
    if (!cardSelecionado) return;
    setSalvando(true);
    try {
      const res = await api.put(`/crm/clientes/${cardSelecionado.id}`, {
        ...formCrm,
        nome_completo: formCrm.nome,
      });
      const atualizado = res.data;
      setColunas(prev => {
        const novas = { ...prev };
        for (const et of Object.keys(novas)) {
          novas[et] = novas[et].filter(c => c.id !== atualizado.id);
        }
        novas[atualizado.funil_etapa] = [atualizado, ...(novas[atualizado.funil_etapa] || [])];
        return novas;
      });
      setCardSelecionado(atualizado);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const adicionarTag = async (tagId: number) => {
    if (!cardSelecionado) return;
    try {
      await api.post(`/crm/clientes/${cardSelecionado.id}/tags/${tagId}`);
      carregar();
      const res = await api.get(`/crm/clientes/${cardSelecionado.id}`);
      setCardSelecionado(res.data);
    } catch {}
  };

  const removerTag = async (tagId: number) => {
    if (!cardSelecionado) return;
    try {
      await api.delete(`/crm/clientes/${cardSelecionado.id}/tags/${tagId}`);
      carregar();
      const res = await api.get(`/crm/clientes/${cardSelecionado.id}`);
      setCardSelecionado(res.data);
    } catch {}
  };

  const criarTag = async () => {
    if (!novaTag.nome.trim()) return;
    try {
      await api.post('/crm/tags', novaTag);
      setNovaTag({ nome: '', cor: '#6366f1', emoji: '' });
      setCriadoTag(true);
      setTimeout(() => setCriadoTag(false), 2000);
      const res = await api.get('/crm/tags');
      setTags(res.data);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Erro ao criar tag');
    }
  };

  const analisarComIA = async () => {
    if (!cardSelecionado) return;
    setAnalisandoIA(true);
    setSugestaoIA(null);
    try {
      const res = await api.post(`/crm/clientes/${cardSelecionado.id}/analisar-ia`);
      setSugestaoIA({ ...res.data.sugestao, mensagens_analisadas: res.data.mensagens_analisadas });
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro na análise de IA');
    } finally {
      setAnalisandoIA(false);
    }
  };

  const aplicarSugestaoIA = () => {
    if (!sugestaoIA) return;
    setFormCrm(p => ({
      ...p,
      resumo_conversa: sugestaoIA.resumo_conversa || p.resumo_conversa,
      preferencias: sugestaoIA.preferencias || p.preferencias,
      observacoes_crm: sugestaoIA.observacoes_crm || p.observacoes_crm,
      funil_etapa: sugestaoIA.funil_etapa || p.funil_etapa,
      ...(sugestaoIA.valor_estimado ? { valor_estimado: sugestaoIA.valor_estimado } : {}),
    }));
    setSugestaoIA(null);
  };

  const deletarTag = async (tagId: number) => {
    if (!window.confirm('Remover esta tag de todos os clientes?')) return;
    try {
      await api.delete(`/crm/tags/${tagId}`);
      const res = await api.get('/crm/tags');
      setTags(res.data);
    } catch {}
  };

  // ─── Totais ───────────────────────────────────────────────────────────────────

  const totalLeads = Object.values(colunas).reduce((s, arr) => s + arr.length, 0);
  const totalValor = Object.values(colunas).flat().reduce((s, c) => s + (c.valor_estimado || 0), 0);
  const totalFechados = colunas['fechado']?.length || 0;
  const valorFechado = colunas['fechado']?.reduce((s, c) => s + (c.valor_estimado || 0), 0) || 0;

  // ─── Input Style ──────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${C.borderLight}`,
    borderRadius: 8,
    padding: '9px 12px',
    color: C.text,
    fontSize: 13,
    width: '100%',
    outline: 'none',
    transition: 'border 0.2s',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: C.textMuted,
    marginBottom: 4,
    display: 'block',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  };

  const btnPrimary: React.CSSProperties = {
    background: `linear-gradient(135deg, ${C.accent} 0%, #8b5cf6 100%)`,
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '10px 20px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    transition: 'all 0.2s',
    boxShadow: `0 4px 15px ${C.accentGlow}`,
  };

  const btnGhost: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    color: C.textSec,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: '9px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    transition: 'all 0.2s',
  };

  // ─── Modal Lead ─────────────────────────────────────────────────────────────

  const renderModalCard = () => {
    if (!cardSelecionado) return null;
    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: C.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(8px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) setCardSelecionado(null); }}
      >
        <div className="kanban-modal" style={{
          background: `linear-gradient(180deg, ${C.surface} 0%, ${C.bg} 100%)`,
          borderRadius: 20,
          padding: 0,
          width: '100%',
          maxWidth: 920,
          maxHeight: '92vh',
          border: `1px solid ${C.border}`,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg, ${C.accent}22 0%, rgba(168,85,247,0.1) 100%)`,
            padding: '20px 24px',
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{
                  width: 46, height: 46, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${C.accent} 0%, #a855f7 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700, color: '#fff',
                  boxShadow: `0 4px 15px ${C.accentGlow}`, flexShrink: 0,
                }}>
                  {cardSelecionado.nome?.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{cardSelecionado.nome}</div>
                  <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{cardSelecionado.whatsapp_number}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => {
                  const num = cardSelecionado.whatsapp_number;
                  setCardSelecionado(null);
                  navigate('/empresa/chat', { state: { openConversation: num } });
                }} style={{ ...btnGhost, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }} title="Abrir conversa no chat">
                  <span style={{ fontSize: 15 }}>💬</span>
                  <span style={{ fontSize: 12 }}>Abrir chat</span>
                </button>
                <button onClick={() => setCardSelecionado(null)} style={{ ...btnGhost, padding: '8px 12px' }}>
                  <span style={{ fontSize: 14 }}>✕</span>
                </button>
              </div>
            </div>
          </div>

          {/* Body — duas colunas */}
          <div className="kanban-scroll" style={{ display: 'flex', flex: 1, overflow: 'auto', minHeight: 0 }}>

            {/* ── Coluna Esquerda: Controle ── */}
            <div style={{
              flex: '0 0 340px', padding: '20px 20px 20px 24px',
              borderRight: `1px solid ${C.border}`,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
                🎛 Controle
              </div>

              {/* Tags */}
              <div>
                <label style={labelStyle}>Tags</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                  {cardSelecionado.tags.map(tag => (
                    <span key={tag.id} onClick={() => removerTag(tag.id)} title="Clique para remover"
                      style={{
                        background: tag.cor + '18', color: tag.cor,
                        border: `1px solid ${tag.cor}40`, borderRadius: 8,
                        fontSize: 11, padding: '3px 9px', fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                        transition: 'all 0.15s',
                      }}>
                      {tag.emoji && tag.emoji} {tag.nome} <span style={{ opacity: 0.5, fontSize: 9 }}>×</span>
                    </span>
                  ))}
                  <select
                    style={{ ...inputStyle, width: 'auto', fontSize: 11, padding: '3px 8px', background: C.card }}
                    value="" onChange={e => { if (e.target.value) adicionarTag(Number(e.target.value)); }}
                  >
                    <option value="">+ Tag</option>
                    {tags.filter(t => !cardSelecionado.tags.find(ct => ct.id === t.id)).map(t => (
                      <option key={t.id} value={t.id}>{t.emoji && `${t.emoji} `}{t.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Nome */}
              <div>
                <label style={labelStyle}>Nome completo</label>
                <input style={inputStyle} value={formCrm.nome || ''} onChange={e => setFormCrm(p => ({ ...p, nome: e.target.value }))} />
              </div>

              {/* Email */}
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} value={formCrm.email || ''} onChange={e => setFormCrm(p => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" />
              </div>

              {/* Etapa */}
              <div>
                <label style={labelStyle}>Etapa do funil</label>
                <select style={inputStyle} value={formCrm.funil_etapa || 'novo_lead'} onChange={e => setFormCrm(p => ({ ...p, funil_etapa: e.target.value }))}>
                  {etapas.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                </select>
              </div>

              {/* Valor */}
              <div>
                <label style={labelStyle}>Valor estimado (R$)</label>
                <input style={inputStyle} type="number" min="0" step="0.01"
                  value={formCrm.valor_estimado || ''}
                  onChange={e => setFormCrm(p => ({ ...p, valor_estimado: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="0,00" />
              </div>

              {/* Responsável */}
              <div>
                <label style={labelStyle}>Responsável</label>
                <select style={inputStyle} value={formCrm.responsavel_id || ''} onChange={e => setFormCrm(p => ({ ...p, responsavel_id: e.target.value ? Number(e.target.value) : undefined }))}>
                  <option value="">Nenhum</option>
                  {responsaveis.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              </div>

              {/* Botões */}
              <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={salvarCrm} disabled={salvando} style={{ ...btnPrimary, width: '100%', opacity: salvando ? 0.7 : 1 }}>
                  {salvando ? 'Salvando...' : '✓ Salvar alterações'}
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={async () => {
                    try {
                      await api.patch(`/crm/clientes/${cardSelecionado.id}/arquivar`);
                      setCardSelecionado(null);
                      carregar();
                    } catch (e) { console.error(e); }
                  }} style={{
                    ...btnGhost,
                    flex: 1,
                    color: cardSelecionado.crm_arquivado ? C.green : C.textMuted,
                    borderColor: cardSelecionado.crm_arquivado ? `${C.green}40` : undefined,
                  }}>
                    {cardSelecionado.crm_arquivado ? '📂 Desarquivar' : '📦 Arquivar'}
                  </button>
                  <button onClick={() => setCardSelecionado(null)} style={{ ...btnGhost, flex: 1 }}>Cancelar</button>
                </div>
              </div>
            </div>

            {/* ── Coluna Direita: Visão ── */}
            <div style={{ flex: 1, padding: '20px 24px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
                👁 Visão
              </div>

              <div>
                <label style={labelStyle}>Resumo da conversa</label>
                <textarea
                  className="kanban-scroll"
                  style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
                  value={formCrm.resumo_conversa || ''}
                  onChange={e => setFormCrm(p => ({ ...p, resumo_conversa: e.target.value }))}
                  placeholder="Resumo do que foi conversado..." />
              </div>

              <div>
                <label style={labelStyle}>Preferências</label>
                <textarea
                  className="kanban-scroll"
                  style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
                  value={formCrm.preferencias || ''}
                  onChange={e => setFormCrm(p => ({ ...p, preferencias: e.target.value }))}
                  placeholder="Preferências, necessidades do cliente..." />
              </div>

              <div>
                <label style={labelStyle}>Observações CRM</label>
                <textarea
                  className="kanban-scroll"
                  style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
                  value={formCrm.observacoes_crm || ''}
                  onChange={e => setFormCrm(p => ({ ...p, observacoes_crm: e.target.value }))}
                  placeholder="Notas internas, próximos passos..." />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Modal Tags ─────────────────────────────────────────────────────────────

  const renderModalTags = () => {
    if (!showTagManager) return null;
    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: C.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(8px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) setShowTagManager(false); }}
      >
        <div className="kanban-modal kanban-scroll" style={{
          background: `linear-gradient(180deg, ${C.surface} 0%, ${C.bg} 100%)`,
          borderRadius: 20, padding: 28, width: '100%', maxWidth: 480,
          maxHeight: '85vh', overflowY: 'auto',
          border: `1px solid ${C.border}`,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
            <div>
              <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Gerenciar Tags</span>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Organize seus leads com tags personalizadas</div>
            </div>
            <button onClick={() => setShowTagManager(false)} style={{ ...btnGhost, padding: '6px 10px' }}>✕</button>
          </div>

          {/* Nova tag */}
          <div style={{
            background: `linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(168,85,247,0.04) 100%)`,
            borderRadius: 14, padding: 18, marginBottom: 22,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14 }}>Criar nova tag</div>
            <div style={{ marginBottom: 12 }}>
              <input style={inputStyle} value={novaTag.nome} onChange={e => setNovaTag(p => ({ ...p, nome: e.target.value }))} placeholder="Nome da tag..." maxLength={50} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Cor</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {CORES.map(cor => (
                    <div key={cor} onClick={() => setNovaTag(p => ({ ...p, cor }))}
                      style={{
                        width: 26, height: 26, borderRadius: '50%', backgroundColor: cor, cursor: 'pointer',
                        border: novaTag.cor === cor ? '3px solid #fff' : '2px solid transparent',
                        transition: 'all 0.15s', boxShadow: novaTag.cor === cor ? `0 0 12px ${cor}60` : 'none',
                      }} />
                  ))}
                  {/* Color picker livre */}
                  <label title="Escolher qualquer cor" style={{ cursor: 'pointer', position: 'relative' }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                      background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                      border: !CORES.includes(novaTag.cor) ? '3px solid #fff' : '2px solid transparent',
                      boxShadow: !CORES.includes(novaTag.cor) ? `0 0 12px ${novaTag.cor}80` : 'none',
                      transition: 'all 0.15s',
                    }} />
                    <input
                      type="color"
                      value={novaTag.cor}
                      onChange={e => setNovaTag(p => ({ ...p, cor: e.target.value }))}
                      style={{ position: 'absolute', opacity: 0, width: 1, height: 1, top: 0, left: 0 }}
                    />
                  </label>
                  {/* Preview da cor selecionada */}
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', backgroundColor: novaTag.cor,
                    border: '2px solid rgba(255,255,255,0.3)',
                    boxShadow: `0 0 10px ${novaTag.cor}60`,
                    flexShrink: 0,
                  }} title={novaTag.cor} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Emoji</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {EMOJIS.map(em => (
                    <span key={em} onClick={() => setNovaTag(p => ({ ...p, emoji: p.emoji === em ? '' : em }))}
                      style={{
                        fontSize: 17, cursor: 'pointer',
                        opacity: novaTag.emoji === em ? 1 : 0.4,
                        transform: novaTag.emoji === em ? 'scale(1.2)' : 'scale(1)',
                        transition: 'all 0.15s',
                      }}>
                      {em}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {novaTag.nome && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ ...labelStyle, marginBottom: 6 }}>Preview</label>
                <span style={{
                  background: novaTag.cor + '18', color: novaTag.cor,
                  border: `1px solid ${novaTag.cor}40`, borderRadius: 8,
                  fontSize: 13, padding: '5px 14px', fontWeight: 600,
                }}>
                  {novaTag.emoji && `${novaTag.emoji} `}{novaTag.nome}
                </span>
              </div>
            )}
            <button onClick={criarTag} style={btnPrimary}>
              {criadoTag ? '✓ Tag criada!' : '+ Criar tag'}
            </button>
          </div>

          {/* Tags existentes */}
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Tags existentes ({tags.length})</div>
          {tags.length === 0 && <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>Nenhuma tag criada ainda</div>}
          {tags.map(tag => (
            <div key={tag.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: 'rgba(255,255,255,0.02)',
              borderRadius: 10, marginBottom: 6, border: `1px solid ${C.border}`,
              transition: 'background 0.15s',
            }}>
              <span style={{
                background: tag.cor + '18', color: tag.cor,
                border: `1px solid ${tag.cor}40`, borderRadius: 8,
                fontSize: 12, padding: '4px 12px', fontWeight: 600,
              }}>
                {tag.emoji && `${tag.emoji} `}{tag.nome}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: C.textMuted }}>{tag.total_clientes || 0} leads</span>
                {isEmpresa && (
                  <button onClick={() => deletarTag(tag.id)} style={{
                    background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.2)`,
                    color: C.red, cursor: 'pointer', fontSize: 12, borderRadius: 6,
                    padding: '4px 8px', transition: 'all 0.15s',
                  }}>Remover</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="kanban-page" style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{
        padding: '20px 28px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate(-1)} style={{ ...btnGhost, padding: '8px 12px', fontSize: 16 }}>
            <span>←</span>
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, background: `linear-gradient(135deg, ${C.text} 0%, ${C.textSec} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Funil de Vendas
            </h1>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
              Gerencie seus leads com drag & drop
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ ...inputStyle, width: 'auto', padding: '7px 12px' }} value={filtroResponsavel} onChange={e => setFiltroResponsavel(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todos responsáveis</option>
            {responsaveis.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
          <select style={{ ...inputStyle, width: 'auto', padding: '7px 12px' }} value={filtroTag} onChange={e => setFiltroTag(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todas tags</option>
            {tags.map(t => <option key={t.id} value={t.id}>{t.emoji && `${t.emoji} `}{t.nome}</option>)}
          </select>
          <button onClick={() => setShowTagManager(true)} style={btnGhost}>Tags</button>
          <button
            onClick={() => setMostrarArquivados(!mostrarArquivados)}
            style={{
              ...btnGhost,
              background: mostrarArquivados ? `${C.accent}20` : undefined,
              borderColor: mostrarArquivados ? `${C.accent}60` : undefined,
              color: mostrarArquivados ? C.accent : C.textSec,
            }}
          >
            {mostrarArquivados ? 'Ativos' : 'Arquivados'}
          </button>
          <button onClick={carregar} style={{ ...btnGhost, padding: '8px 12px' }}>↻</button>
        </div>
      </div>

      {/* Stats bar */}
      {!loading && (
        <div style={{ padding: '16px 28px 8px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Leads', value: totalLeads.toString(), sub: 'no funil', color: C.accent, icon: '📊' },
            { label: 'Pipeline', value: `R$ ${totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, sub: 'valor total', color: '#f59e0b', icon: '💰' },
            { label: 'Fechados', value: totalFechados.toString(), sub: `R$ ${valorFechado.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, color: C.green, icon: '✅' },
            { label: 'Conversão', value: totalLeads > 0 ? `${Math.round((totalFechados / totalLeads) * 100)}%` : '0%', sub: 'taxa de fechamento', color: '#a855f7', icon: '📈' },
          ].map((stat, i) => (
            <div key={i} className="kanban-stat-card" style={{
              background: `linear-gradient(135deg, ${stat.color}08 0%, ${stat.color}04 100%)`,
              border: `1px solid ${stat.color}25`,
              borderRadius: 12, padding: '12px 18px', flex: '1 1 180px', minWidth: 160,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>{stat.label}</span>
                <span style={{ fontSize: 16 }}>{stat.icon}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div style={{ padding: '28px', display: 'flex', gap: 14 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="kanban-loading" style={{
              width: 260, minHeight: 400, borderRadius: 14,
              background: C.surface, border: `1px solid ${C.border}`,
            }} />
          ))}
        </div>
      ) : (
        <>
        <div className="kanban-board-wrapper" style={{ position: 'relative' }}>
        <div className="kanban-scroll" style={{
          display: 'flex', gap: 14, padding: '14px 28px 28px',
          overflowX: 'auto', height: 'calc(100vh - 230px)',
        }}>
          {etapas.map(etapa => {
            const cards = colunas[etapa.id] || [];
            const isDragOver = dragOver === etapa.id;
            const colValor = cards.reduce((s, c) => s + (c.valor_estimado || 0), 0);
            return (
              <div
                key={etapa.id}
                className={`kanban-col ${isDragOver ? 'kanban-col-dragover' : ''}`}
                style={{
                  minWidth: 270, width: 270, flexShrink: 0,
                  background: C.surface,
                  borderRadius: 14,
                  border: `1px solid ${isDragOver ? `${etapa.cor}60` : C.border}`,
                  display: 'flex', flexDirection: 'column',
                  height: '100%', maxHeight: '100%',
                }}
                onDragOver={(e) => handleDragOver(e, etapa.id)}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => handleDrop(e, etapa.id)}
              >
                {/* Column header */}
                <div style={{
                  padding: '14px 16px 12px',
                  borderBottom: `2px solid ${etapa.cor}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        backgroundColor: etapa.cor,
                        boxShadow: `0 0 8px ${etapa.cor}80`,
                      }} />
                      <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{etapa.label}</span>
                    </div>
                    <div style={{
                      background: etapa.cor + '22', color: etapa.cor,
                      borderRadius: 8, minWidth: 28, height: 24,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700,
                    }}>
                      {cards.length}
                    </div>
                  </div>
                  {colValor > 0 && (
                    <div style={{ fontSize: 11, color: C.textMuted }}>
                      R$ {colValor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                    </div>
                  )}
                </div>

                {/* Cards container */}
                <div className="kanban-scroll" style={{ padding: 10, flexGrow: 1, overflowY: 'auto', minHeight: 80 }}>
                  {cards.length === 0 && (
                    <div style={{
                      textAlign: 'center', color: C.textMuted, fontSize: 12,
                      padding: '30px 10px', opacity: isDragOver ? 1 : 0.4,
                      border: `2px dashed ${isDragOver ? etapa.cor + '60' : C.border}`,
                      borderRadius: 10, transition: 'all 0.2s',
                    }}>
                      {isDragOver ? 'Solte aqui' : 'Sem leads'}
                    </div>
                  )}
                  {cards.map(card => (
                    <KanbanCardItem
                      key={card.id}
                      card={card}
                      onDragStart={handleDragStart}
                      onClick={abrirCard}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        </div>{/* kanban-board-wrapper */}
        </>
      )}

      {/* Modais */}
      {renderModalCard()}
      {renderModalTags()}
    </div>
  );
};

export default KanbanPage;
