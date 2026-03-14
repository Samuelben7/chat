import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { adminApi, whatsappProfileApi, WhatsAppProfile } from '../services/api';
import logo from '../assets/logo.png';
import './AdminPanel.css';

// ==================== TYPES ====================

interface EmpresaAdmin {
  id: number;
  nome: string;
  cnpj?: string | null;
  email: string;
  telefone?: string | null;
  ativa: boolean;
  whatsapp_conectado: boolean;
  phone_number_id?: string | null;
  waba_id?: string | null;
  criado_em?: string | null;
  // campos novos do /admin/empresas
  plano?: string;
  preco?: number;
  is_personalizado?: boolean;
  status_assinatura?: string;
  vencimento?: string | null;
  trial_expira_em?: string | null;
  limites?: Record<string, any>;
  assinatura_id?: number | null;
}

interface PlanoPersonalizadoForm {
  nome: string;
  preco_mensal: string;
  conversas_mes: string;
  ia_conversas: string;
  max_atendentes: string;
  dias_gratuitos: string;
}

const PlanoPersonalizadoModal: React.FC<{
  empresa: EmpresaAdmin;
  onClose: () => void;
  onSave: () => void;
}> = ({ empresa, onClose, onSave }) => {
  const [form, setForm] = useState<PlanoPersonalizadoForm>({
    nome: empresa.plano && empresa.is_personalizado ? empresa.plano : '',
    preco_mensal: empresa.preco ? String(empresa.preco) : '',
    conversas_mes: String(empresa.limites?.conversas_mes || 1000),
    ia_conversas: String(empresa.limites?.ia_conversas || 200),
    max_atendentes: String(empresa.limites?.max_atendentes || 3),
    dias_gratuitos: '0',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    if (!form.nome || !form.preco_mensal) { setErr('Nome e preço são obrigatórios'); return; }
    setLoading(true);
    try {
      await adminApi.definirPlanoPersonalizado(empresa.id, {
        nome: form.nome,
        preco_mensal: parseFloat(form.preco_mensal),
        limites: {
          conversas_mes: parseInt(form.conversas_mes) || 1000,
          ia_conversas: parseInt(form.ia_conversas) || 200,
          max_atendentes: parseInt(form.max_atendentes) || 3,
        },
        dias_gratuitos: parseInt(form.dias_gratuitos) || 0,
      });
      onSave();
      onClose();
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Erro ao salvar');
    }
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 14, boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: '#94a3b8', marginBottom: 4, display: 'block' };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#0f1929', border: '1px solid rgba(75,123,236,0.3)', borderRadius: 16,
        padding: 28, width: '100%', maxWidth: 480,
      }}>
        <h2 style={{ margin: '0 0 4px', color: '#fff', fontSize: 18 }}>Plano Personalizado</h2>
        <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>{empresa.nome}</p>

        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={labelStyle}>Nome do plano</label>
            <input style={inputStyle} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Enterprise, Básico..." />
          </div>
          <div>
            <label style={labelStyle}>Preço mensal (R$)</label>
            <input style={inputStyle} type="number" step="0.01" value={form.preco_mensal} onChange={e => setForm({ ...form, preco_mensal: e.target.value })} placeholder="200.00" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Conversas/mês</label>
              <input style={inputStyle} type="number" value={form.conversas_mes} onChange={e => setForm({ ...form, conversas_mes: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>IA conversas/mês</label>
              <input style={inputStyle} type="number" value={form.ia_conversas} onChange={e => setForm({ ...form, ia_conversas: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Máx. atendentes</label>
              <input style={inputStyle} type="number" value={form.max_atendentes} onChange={e => setForm({ ...form, max_atendentes: e.target.value })} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Dias gratuitos (trial)</label>
            <input style={inputStyle} type="number" value={form.dias_gratuitos} onChange={e => setForm({ ...form, dias_gratuitos: e.target.value })} placeholder="0" />
          </div>
        </div>

        {err && <p style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{err}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleSave} disabled={loading} style={{
            padding: '9px 20px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, #4B7BEC, #6C8EE6)', color: '#fff',
            cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.6 : 1,
          }}>
            {loading ? 'Salvando...' : 'Salvar Plano'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface DevAdmin {
  id: number;
  nome: string;
  email: string;
  empresa_nome: string | null;
  status: string;
  whatsapp_conectado: boolean;
  numeros_count: number;
  trial_fim: string | null;
  criado_em: string | null;
  plano: string;
  keys_ativas: number;
}

interface Pagamento {
  id: number;
  tipo_usuario: string;
  empresa_id: number | null;
  dev_id: number | null;
  valor: number;
  metodo: string;
  status: string;
  mp_payment_id: string | null;
  criado_em: string | null;
}

interface Totais {
  receita_hoje: number;
  receita_mes: number;
  receita_total: number;
  por_plano: { plano: string; pagamentos: number; valor_total: number }[];
}

interface PlanoAdmin {
  id: number;
  tipo: string;
  nome: string;
  preco_mensal: number;
  descricao: string | null;
  features: string[];
  limites: Record<string, number>;
  ativo: boolean;
  ordem: number;
}

// ==================== CONSTANTS ====================

const STATUS_COLOR: Record<string, string> = {
  CONNECTED: '#22c55e', FLAGGED: '#f59e0b', BANNED: '#ef4444',
  PENDING: '#6366f1', DISCONNECTED: '#64748b', UNKNOWN: '#64748b',
};
const QUALITY_COLOR: Record<string, string> = {
  GREEN: '#22c55e', YELLOW: '#f59e0b', RED: '#ef4444', UNKNOWN: '#64748b',
};
const NAME_STATUS_LABEL: Record<string, string> = {
  APPROVED: 'Aprovado', PENDING_REVIEW: 'Em Revisão', DECLINED: 'Recusado',
  EXPIRED: 'Expirado', AVAILABLE_WITHOUT_REVIEW: 'Disponível',
};
const DEV_STATUS_COLOR: Record<string, string> = {
  trial: '#6366f1', active: '#22c55e', overdue: '#f59e0b',
  blocked: '#ef4444', cancelled: '#64748b',
};
const PAG_STATUS_COLOR: Record<string, string> = {
  approved: '#22c55e', pending: '#f59e0b', rejected: '#ef4444',
  refunded: '#6366f1', cancelled: '#64748b',
};

type Tab = 'empresas' | 'devs' | 'pagamentos' | 'planos';

// ==================== HELPERS ====================

const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';

// ==================== MODAL PLANO ====================

const PlanoModal: React.FC<{
  plano: Partial<PlanoAdmin> | null;
  onClose: () => void;
  onSave: (dados: any) => void;
}> = ({ plano, onClose, onSave }) => {
  const [form, setForm] = useState({
    tipo: plano?.tipo || 'empresa',
    nome: plano?.nome || '',
    preco_mensal: plano?.preco_mensal ?? 0,
    descricao: plano?.descricao || '',
    features: (plano?.features || []).join('\n'),
    limites_mensagens_mes: plano?.limites?.mensagens_mes ?? 1000,
    limites_requests_min: plano?.limites?.requests_min ?? 60,
    limites_atendentes: plano?.limites?.atendentes ?? 5,
    ordem: plano?.ordem ?? 1,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setSaving(true);
    setErr('');
    try {
      const dados = {
        tipo: form.tipo,
        nome: form.nome,
        preco_mensal: Number(form.preco_mensal),
        descricao: form.descricao || null,
        features: form.features.split('\n').map(f => f.trim()).filter(Boolean),
        limites: {
          mensagens_mes: Number(form.limites_mensagens_mes),
          requests_min: Number(form.limites_requests_min),
          atendentes: Number(form.limites_atendentes),
        },
        ordem: Number(form.ordem),
      };
      await onSave(dados);
      onClose();
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Erro ao salvar plano');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#0f1629', border: '1px solid rgba(0,212,255,0.2)',
        borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '520px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <h3 style={{ color: '#fff', fontSize: '18px', margin: '0 0 24px', fontWeight: 700 }}>
          {plano?.id ? 'Editar Plano' : 'Novo Plano'}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {[
            { label: 'Tipo', key: 'tipo', type: 'select', options: ['empresa', 'dev'] },
            { label: 'Nome', key: 'nome', type: 'text' },
            { label: 'Preço/mês (R$)', key: 'preco_mensal', type: 'number' },
            { label: 'Ordem', key: 'ordem', type: 'number' },
            { label: 'Msgs/mês', key: 'limites_mensagens_mes', type: 'number' },
            { label: 'Requests/min', key: 'limites_requests_min', type: 'number' },
            { label: 'Atendentes', key: 'limites_atendentes', type: 'number' },
          ].map(({ label, key, type, options }) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ color: '#8892b0', fontSize: '12px', fontWeight: 600 }}>{label}</label>
              {type === 'select' ? (
                <select
                  value={(form as any)[key]}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '14px' }}
                >
                  {options!.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '14px' }}
                />
              )}
            </div>
          ))}

          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: '#8892b0', fontSize: '12px', fontWeight: 600 }}>
              Descrição
            </label>
            <input
              type="text"
              value={form.descricao}
              onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
              style={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '14px' }}
            />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: '#8892b0', fontSize: '12px', fontWeight: 600 }}>
              Features (uma por linha)
            </label>
            <textarea
              value={form.features}
              onChange={e => setForm(p => ({ ...p, features: e.target.value }))}
              rows={4}
              style={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '13px', resize: 'vertical' }}
            />
          </div>
        </div>

        {err && <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '12px' }}>{err}</p>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '10px 20px', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
            color: '#8892b0', cursor: 'pointer', fontSize: '14px',
          }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={saving} style={{
            padding: '10px 24px',
            background: saving ? '#333' : 'linear-gradient(135deg, #00b4d8, #7b2cbf)',
            border: 'none', borderRadius: '8px', color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 600,
          }}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== CONFIRM DELETE COMPONENT ====================

function ConfirmDeleteInput({ nomeEsperado, onConfirm, onCancel, loading }: {
  nomeEsperado: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [typed, setTyped] = useState('');
  const match = typed.trim() === nomeEsperado.trim();
  return (
    <div>
      <input
        value={typed}
        onChange={e => setTyped(e.target.value)}
        placeholder={`Digite: ${nomeEsperado}`}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8, boxSizing: 'border-box',
          border: `1px solid ${match ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.15)'}`,
          background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 14, marginBottom: 14,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={onCancel} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={!match || loading}
          style={{
            padding: '9px 20px', borderRadius: 8, border: 'none',
            background: match ? '#ef4444' : '#333', color: '#fff',
            cursor: match && !loading ? 'pointer' : 'not-allowed', fontWeight: 700,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Deletando...' : 'Confirmar Delete'}
        </button>
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('empresas');

  // --- Empresas ---
  const [empresas, setEmpresas] = useState<EmpresaAdmin[]>([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [errEmpresas, setErrEmpresas] = useState('');
  const [search, setSearch] = useState('');
  const [profiles, setProfiles] = useState<Record<number, WhatsAppProfile | 'loading' | 'error'>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<Record<number, boolean>>({});
  const [planoPersonalizadoModal, setPlanoPersonalizadoModal] = useState<EmpresaAdmin | null>(null);
  const [diasGratuitosModal, setDiasGratuitosModal] = useState<EmpresaAdmin | null>(null);
  const [diasGratuitosValor, setDiasGratuitosValor] = useState('30');
  const [diasGratuitosLoading, setDiasGratuitosLoading] = useState(false);
  const [usoEmpresas, setUsoEmpresas] = useState<Record<number, any>>({});
  const [confirmDeleteEmpresa, setConfirmDeleteEmpresa] = useState<EmpresaAdmin | null>(null);
  const [deletingEmpresa, setDeletingEmpresa] = useState(false);
  const [deleteEmpresaError, setDeleteEmpresaError] = useState('');

  // --- Devs ---
  const [devs, setDevs] = useState<DevAdmin[]>([]);
  const [loadingDevs, setLoadingDevs] = useState(false);
  const [totalDevs, setTotalDevs] = useState(0);
  const [devFilter, setDevFilter] = useState('');

  // --- Pagamentos ---
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [loadingPag, setLoadingPag] = useState(false);
  const [totais, setTotais] = useState<Totais | null>(null);
  const [pagFilter, setPagFilter] = useState('');
  const [confirmRefund, setConfirmRefund] = useState<number | null>(null);

  // --- Planos ---
  const [planos, setPlanos] = useState<PlanoAdmin[]>([]);
  const [loadingPlanos, setLoadingPlanos] = useState(false);
  const [planoModal, setPlanoModal] = useState<Partial<PlanoAdmin> | null | false>(false);

  // -------- Load functions --------

  const loadEmpresas = useCallback(async () => {
    setLoadingEmpresas(true);
    try {
      const data = await adminApi.listarEmpresasAdmin();
      setEmpresas(data);
      setErrEmpresas('');
    } catch (e: any) {
      setErrEmpresas(e.response?.data?.detail || 'Erro ao carregar empresas');
    } finally {
      setLoadingEmpresas(false);
    }
  }, []);

  const loadDevs = useCallback(async () => {
    setLoadingDevs(true);
    try {
      const data = await adminApi.listarDevs(1, devFilter || undefined);
      setDevs(data.devs || []);
      setTotalDevs(data.total || 0);
    } catch { /* */ }
    setLoadingDevs(false);
  }, [devFilter]);

  const loadPagamentos = useCallback(async () => {
    setLoadingPag(true);
    try {
      const [pag, tot] = await Promise.all([
        adminApi.listarPagamentos(1, pagFilter ? { status: pagFilter } : {}),
        adminApi.totaisPagamentos(),
      ]);
      setPagamentos(pag.pagamentos || []);
      setTotais(tot);
    } catch { /* */ }
    setLoadingPag(false);
  }, [pagFilter]);

  const loadPlanos = useCallback(async () => {
    setLoadingPlanos(true);
    try {
      const data = await adminApi.listarPlanos();
      setPlanos(data);
    } catch { /* */ }
    setLoadingPlanos(false);
  }, []);

  useEffect(() => { loadEmpresas(); }, [loadEmpresas]);
  useEffect(() => { if (activeTab === 'devs') loadDevs(); }, [activeTab, loadDevs]);
  useEffect(() => { if (activeTab === 'pagamentos') loadPagamentos(); }, [activeTab, loadPagamentos]);
  useEffect(() => { if (activeTab === 'planos') loadPlanos(); }, [activeTab, loadPlanos]);

  // -------- Empresas actions --------

  const toggleStatus = async (emp: EmpresaAdmin) => {
    const isExpanded = expanded[emp.id];
    setExpanded(prev => ({ ...prev, [emp.id]: !isExpanded }));
    if (!isExpanded) {
      loadUsoEmpresa(emp.id);
      if (!profiles[emp.id] && emp.whatsapp_conectado) {
        setProfiles(prev => ({ ...prev, [emp.id]: 'loading' }));
        try {
          const data = await whatsappProfileApi.getEmpresaProfile(emp.id);
          setProfiles(prev => ({ ...prev, [emp.id]: data }));
        } catch {
          setProfiles(prev => ({ ...prev, [emp.id]: 'error' }));
        }
      }
    }
  };

  const copyToken = async (empresaId: number, token: string) => {
    await navigator.clipboard.writeText(token);
    setCopied(prev => ({ ...prev, [empresaId]: true }));
    setTimeout(() => setCopied(prev => ({ ...prev, [empresaId]: false })), 2000);
  };

  const filtered = empresas.filter(e =>
    e.nome.toLowerCase().includes(search.toLowerCase()) ||
    e.email.toLowerCase().includes(search.toLowerCase()) ||
    (e.cnpj && e.cnpj.includes(search))
  );

  // -------- Devs actions --------

  const toggleDevStatus = async (dev: DevAdmin) => {
    try {
      if (dev.status === 'blocked') {
        await adminApi.desbloquearDev(dev.id);
      } else {
        await adminApi.bloquearDev(dev.id);
      }
      loadDevs();
    } catch { /* */ }
  };

  // -------- Pagamentos actions --------

  const handleRefund = async (id: number) => {
    try {
      await adminApi.reembolsarPagamento(id);
      setConfirmRefund(null);
      loadPagamentos();
    } catch { /* */ }
  };

  // -------- Planos actions --------

  const salvarPlano = async (dados: any) => {
    if ((planoModal as PlanoAdmin)?.id) {
      await adminApi.atualizarPlano((planoModal as PlanoAdmin).id, dados);
    } else {
      await adminApi.criarPlano(dados);
    }
    loadPlanos();
  };

  const desativarPlano = async (id: number) => {
    if (!window.confirm('Desativar este plano?')) return;
    await adminApi.deletarPlano(id);
    loadPlanos();
  };

  const loadUsoEmpresa = async (empresaId: number) => {
    try {
      const uso = await adminApi.usoEmpresa(empresaId);
      setUsoEmpresas(prev => ({ ...prev, [empresaId]: uso }));
    } catch { /* */ }
  };

  const handleDeleteEmpresa = async () => {
    if (!confirmDeleteEmpresa) return;
    setDeletingEmpresa(true);
    setDeleteEmpresaError('');
    try {
      await adminApi.deletarEmpresa(confirmDeleteEmpresa.id);
      setConfirmDeleteEmpresa(null);
      setDeleteEmpresaError('');
      loadEmpresas();
    } catch (e: any) {
      setDeleteEmpresaError(e.response?.data?.detail || 'Erro ao deletar empresa');
    }
    setDeletingEmpresa(false);
  };

  const handleConcederDias = async () => {
    if (!diasGratuitosModal) return;
    const dias = parseInt(diasGratuitosValor);
    if (!dias || dias <= 0) return;
    setDiasGratuitosLoading(true);
    try {
      await adminApi.concederDiasGratuitos(diasGratuitosModal.id, dias);
      setDiasGratuitosModal(null);
      setDiasGratuitosValor('30');
      loadEmpresas();
    } catch { /* */ }
    setDiasGratuitosLoading(false);
  };

  // -------- KPIs --------

  const totalAtivas = empresas.filter(e => e.ativa).length;
  const totalWhatsApp = empresas.filter(e => e.whatsapp_conectado).length;

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'empresas', label: 'Empresas', icon: '🏢' },
    { key: 'devs', label: 'Devs', icon: '</>' },
    { key: 'pagamentos', label: 'Pagamentos', icon: '💳' },
    { key: 'planos', label: 'Planos', icon: '📦' },
  ];

  return (
    <div className="admin-container">
      <div className="admin-orb admin-orb-1" />
      <div className="admin-orb admin-orb-2" />
      <div className="admin-orb admin-orb-3" />

      {/* Header */}
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-logo-area">
            <img src={logo} alt="YourSystem" className="admin-logo-img" />
            <div>
              <h1 className="admin-logo-text">Painel Admin</h1>
              <span className="admin-logo-sub">Gerenciamento da Plataforma</span>
            </div>
          </div>
          <div className="admin-header-actions">
            <span style={{ color: '#64748b', fontSize: '13px', marginRight: '16px' }}>
              {user?.email}
            </span>
            <button className="admin-btn-ghost admin-btn-logout" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        {/* KPIs topo */}
        <div className="admin-kpis">
          <div className="admin-kpi" style={{ borderColor: 'rgba(0, 212, 255, 0.25)' }}>
            <div className="admin-kpi-value" style={{ color: '#00d4ff' }}>{empresas.length}</div>
            <div className="admin-kpi-label">Empresas</div>
          </div>
          <div className="admin-kpi" style={{ borderColor: 'rgba(34, 197, 94, 0.25)' }}>
            <div className="admin-kpi-value" style={{ color: '#22c55e' }}>{totalAtivas}</div>
            <div className="admin-kpi-label">Ativas</div>
          </div>
          <div className="admin-kpi" style={{ borderColor: 'rgba(123, 44, 191, 0.25)' }}>
            <div className="admin-kpi-value" style={{ color: '#a855f7' }}>{totalWhatsApp}</div>
            <div className="admin-kpi-label">WhatsApp OK</div>
          </div>
          {totais && (
            <>
              <div className="admin-kpi" style={{ borderColor: 'rgba(34, 197, 94, 0.25)' }}>
                <div className="admin-kpi-value" style={{ color: '#22c55e', fontSize: '18px' }}>
                  {fmt(totais.receita_mes)}
                </div>
                <div className="admin-kpi-label">Receita este mês</div>
              </div>
              <div className="admin-kpi" style={{ borderColor: 'rgba(0, 212, 255, 0.15)' }}>
                <div className="admin-kpi-value" style={{ color: '#00d4ff', fontSize: '18px' }}>
                  {fmt(totais.receita_total)}
                </div>
                <div className="admin-kpi-label">Receita total</div>
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '4px', marginBottom: '24px',
          background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
          padding: '4px', border: '1px solid rgba(255,255,255,0.06)',
          width: 'fit-content',
        }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 20px', borderRadius: '9px', border: 'none',
                cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                background: activeTab === tab.key
                  ? 'linear-gradient(135deg, rgba(0,180,216,0.3), rgba(123,44,191,0.3))'
                  : 'transparent',
                color: activeTab === tab.key ? '#00d4ff' : '#64748b',
                borderBottom: activeTab === tab.key ? '2px solid #00d4ff' : '2px solid transparent',
                transition: 'all 0.2s ease',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* ====== TAB EMPRESAS ====== */}
        {activeTab === 'empresas' && (
          <>
            <div className="admin-search-bar">
              <input
                type="text"
                placeholder="Buscar por nome, email ou CNPJ..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="admin-search-input"
              />
              <button className="admin-btn-refresh" onClick={loadEmpresas}>Atualizar</button>
            </div>

            {errEmpresas && <div className="admin-error">{errEmpresas}</div>}
            {loadingEmpresas && <div className="admin-loading"><div className="admin-spinner" /><p>Carregando...</p></div>}

            {!loadingEmpresas && (
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>Empresa</th><th>Email</th>
                      <th>Plano</th><th>Assinatura</th><th>WhatsApp</th><th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={7} className="admin-empty">Nenhuma empresa encontrada.</td></tr>
                    ) : filtered.map(emp => (
                      <React.Fragment key={emp.id}>
                        <tr>
                          <td className="admin-td-id">#{emp.id}</td>
                          <td className="admin-td-nome">
                            <div>{emp.nome}</div>
                            {emp.cnpj && <div style={{ fontSize: 11, color: '#64748b' }}>{emp.cnpj}</div>}
                          </td>
                          <td className="admin-td-email">{emp.email}</td>
                          <td>
                            <div style={{ fontSize: 13 }}>
                              {emp.plano ? (
                                <span style={{
                                  padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                                  background: emp.is_personalizado ? 'rgba(168,85,247,0.2)' : 'rgba(0,212,255,0.15)',
                                  color: emp.is_personalizado ? '#a855f7' : '#00d4ff',
                                }}>
                                  {emp.is_personalizado ? '★ ' : ''}{emp.plano}
                                </span>
                              ) : <span style={{ color: '#64748b', fontSize: 12 }}>Sem plano</span>}
                              {emp.preco != null && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 2 }}>R$ {emp.preco?.toFixed(2).replace('.', ',')}/mês</div>}
                            </div>
                          </td>
                          <td>
                            {emp.status_assinatura ? (
                              <div>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                                  background: emp.status_assinatura === 'active' ? 'rgba(34,197,94,0.15)' : emp.status_assinatura === 'trial' ? 'rgba(99,102,241,0.15)' : 'rgba(239,68,68,0.15)',
                                  color: emp.status_assinatura === 'active' ? '#22c55e' : emp.status_assinatura === 'trial' ? '#818cf8' : '#ef4444',
                                }}>
                                  {emp.status_assinatura}
                                </span>
                                {(emp.vencimento || emp.trial_expira_em) && (
                                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                    até {fmtDate(emp.trial_expira_em || emp.vencimento)}
                                  </div>
                                )}
                              </div>
                            ) : <span style={{ color: '#64748b', fontSize: 12 }}>—</span>}
                          </td>
                          <td>
                            <span className={`admin-badge ${emp.whatsapp_conectado ? 'admin-badge-connected' : 'admin-badge-disconnected'}`}>
                              {emp.whatsapp_conectado ? 'Conectado' : 'Não conectado'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                              <button
                                className="admin-btn-status"
                                onClick={() => toggleStatus(emp)}
                              >
                                {expanded[emp.id] ? '▲' : '▼ Ver'}
                              </button>
                              <button
                                onClick={() => setPlanoPersonalizadoModal(emp)}
                                style={{
                                  padding: '5px 10px', borderRadius: 6, border: 'none',
                                  background: 'rgba(168,85,247,0.2)', color: '#a855f7',
                                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                }}
                              >
                                ★ Plano
                              </button>
                              <button
                                onClick={() => { setDiasGratuitosModal(emp); setDiasGratuitosValor('30'); }}
                                style={{
                                  padding: '5px 10px', borderRadius: 6, border: 'none',
                                  background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                }}
                              >
                                🎁 Dias
                              </button>
                              <button
                                onClick={() => setConfirmDeleteEmpresa(emp)}
                                style={{
                                  padding: '5px 10px', borderRadius: 6, border: 'none',
                                  background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                }}
                              >
                                🗑 Del
                              </button>
                            </div>
                          </td>
                        </tr>

                        {expanded[emp.id] && (
                          <tr className="admin-row-expanded">
                            <td colSpan={7}>
                              <div className="admin-profile-panel">
                                {/* Uso mensal */}
                                {usoEmpresas[emp.id] && (() => {
                                  const u = usoEmpresas[emp.id];
                                  return (
                                    <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                                      {[
                                        { label: 'Conversas/mês', usado: u.conversas_mes.usado, limite: u.conversas_mes.limite, pct: u.conversas_mes.percentual },
                                        { label: 'IA/mês', usado: u.ia_conversas.usado, limite: u.ia_conversas.limite, pct: u.ia_conversas.percentual },
                                        { label: 'Atendentes', usado: u.atendentes.ativo, limite: u.atendentes.limite, pct: null },
                                      ].map(item => (
                                        <div key={item.label} style={{
                                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                          borderRadius: 8, padding: '8px 14px', minWidth: 120,
                                        }}>
                                          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{item.label}</div>
                                          <div style={{ fontSize: 18, fontWeight: 800, color: item.pct && item.pct >= 80 ? '#f87171' : '#e2e8f0' }}>
                                            {item.usado}{item.limite ? <span style={{ fontSize: 11, color: '#64748b' }}>/{item.limite}</span> : ''}
                                          </div>
                                          {item.pct !== null && item.limite && (
                                            <div style={{ marginTop: 4, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                                              <div style={{
                                                height: 3, borderRadius: 2,
                                                width: `${Math.min(item.pct!, 100)}%`,
                                                background: item.pct! >= 90 ? '#ef4444' : item.pct! >= 80 ? '#f59e0b' : '#22c55e',
                                              }} />
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}
                                {profiles[emp.id] === 'loading' && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8' }}>
                                    <div className="admin-spinner" style={{ width: 16, height: 16 }} />
                                    Consultando Meta API...
                                  </div>
                                )}
                                {profiles[emp.id] === 'error' && (
                                  <div style={{ color: '#ef4444' }}>Erro ao consultar Meta API.</div>
                                )}
                                {profiles[emp.id] && profiles[emp.id] !== 'loading' && profiles[emp.id] !== 'error' && (() => {
                                  const p = profiles[emp.id] as WhatsAppProfile;
                                  return (
                                    <div className="admin-profile-grid">
                                      <div className="admin-profile-item">
                                        <div className="admin-profile-label">Status do Número</div>
                                        <div className="admin-profile-value" style={{ color: STATUS_COLOR[p.status || 'UNKNOWN'] }}>
                                          ● {p.status || 'N/A'}
                                        </div>
                                      </div>
                                      <div className="admin-profile-item">
                                        <div className="admin-profile-label">Número</div>
                                        <div className="admin-profile-value">{p.display_phone_number || '-'}</div>
                                      </div>
                                      <div className="admin-profile-item">
                                        <div className="admin-profile-label">Nome Verificado</div>
                                        <div className="admin-profile-value">{p.verified_name || '-'}</div>
                                      </div>
                                      <div className="admin-profile-item">
                                        <div className="admin-profile-label">Status do Nome</div>
                                        <div className="admin-profile-value" style={{
                                          color: p.name_status === 'APPROVED' ? '#22c55e' : '#f59e0b'
                                        }}>
                                          {NAME_STATUS_LABEL[p.name_status || ''] || p.name_status || '-'}
                                        </div>
                                      </div>
                                      <div className="admin-profile-item">
                                        <div className="admin-profile-label">Qualidade</div>
                                        <div className="admin-profile-value" style={{ color: QUALITY_COLOR[p.quality_rating || 'UNKNOWN'] }}>
                                          ● {p.quality_rating || 'N/A'}
                                        </div>
                                      </div>
                                      <div className="admin-profile-item">
                                        <div className="admin-profile-label">WABA ID</div>
                                        <div className="admin-profile-value admin-mono">{p.waba_id || '-'}</div>
                                      </div>
                                      {p.token_preview && (
                                        <div className="admin-profile-item admin-profile-token" style={{ gridColumn: '1 / -1' }}>
                                          <div className="admin-profile-label">Token Meta (preview)</div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <code className="admin-token-code">{p.token_preview}</code>
                                            <button className="admin-btn-copy" onClick={() => copyToken(emp.id, p.token_preview!)}>
                                              {copied[emp.id] ? '✓ Copiado' : 'Copiar'}
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ====== TAB DEVS ====== */}
        {activeTab === 'devs' && (
          <>
            <div className="admin-search-bar">
              <select
                value={devFilter}
                onChange={e => setDevFilter(e.target.value)}
                style={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px 14px', color: '#fff', fontSize: '14px' }}
              >
                <option value="">Todos os status</option>
                <option value="trial">Trial</option>
                <option value="active">Ativo</option>
                <option value="overdue">Inadimplente</option>
                <option value="blocked">Bloqueado</option>
              </select>
              <button className="admin-btn-refresh" onClick={loadDevs}>Atualizar</button>
            </div>

            {loadingDevs ? (
              <div className="admin-loading"><div className="admin-spinner" /><p>Carregando devs...</p></div>
            ) : (
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>Dev</th><th>Empresa</th><th>Status</th>
                      <th>Plano</th><th>Keys</th><th>Numeros</th><th>Custo/mes</th><th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devs.length === 0 ? (
                      <tr><td colSpan={9} className="admin-empty">Nenhum dev encontrado.</td></tr>
                    ) : devs.map(dev => (
                      <tr key={dev.id}>
                        <td className="admin-td-id">#{dev.id}</td>
                        <td className="admin-td-nome">
                          <div>{dev.nome}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{dev.email}</div>
                        </td>
                        <td style={{ color: '#94a3b8', fontSize: '13px' }}>{dev.empresa_nome || '-'}</td>
                        <td>
                          <span style={{
                            padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                            background: `${DEV_STATUS_COLOR[dev.status] || '#64748b'}20`,
                            color: DEV_STATUS_COLOR[dev.status] || '#64748b',
                            border: `1px solid ${DEV_STATUS_COLOR[dev.status] || '#64748b'}40`,
                          }}>
                            {dev.status}
                          </span>
                        </td>
                        <td style={{ color: '#94a3b8', fontSize: '13px' }}>{dev.plano}</td>
                        <td style={{ color: '#00d4ff', fontSize: '13px', textAlign: 'center' }}>{dev.keys_ativas}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                            background: (dev.numeros_count || 0) > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
                            color: (dev.numeros_count || 0) > 0 ? '#22c55e' : '#64748b',
                          }}>
                            {dev.numeros_count || 0}
                          </span>
                        </td>
                        <td style={{ color: '#22c55e', fontSize: '13px', fontWeight: 700 }}>
                          {(dev.numeros_count || 0) > 0 ? `R$ ${((dev.numeros_count || 0) * 35).toFixed(2).replace('.', ',')}` : '—'}
                        </td>
                        <td>
                          <button
                            onClick={() => toggleDevStatus(dev)}
                            style={{
                              padding: '5px 14px', borderRadius: '6px', border: 'none',
                              cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                              background: dev.status === 'blocked' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                              color: dev.status === 'blocked' ? '#22c55e' : '#ef4444',
                            }}
                          >
                            {dev.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ color: '#64748b', fontSize: '13px', marginTop: '12px', textAlign: 'right' }}>
                  Total: {totalDevs} devs
                </div>
              </div>
            )}
          </>
        )}

        {/* ====== TAB PAGAMENTOS ====== */}
        {activeTab === 'pagamentos' && (
          <>
            {/* Cards de receita */}
            {totais && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {[
                  { label: 'Receita Hoje', value: fmt(totais.receita_hoje), color: '#22c55e' },
                  { label: 'Receita este Mês', value: fmt(totais.receita_mes), color: '#00d4ff' },
                  { label: 'Receita Total', value: fmt(totais.receita_total), color: '#a855f7' },
                ].map((item, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,0.04)', border: `1px solid ${item.color}25`,
                    borderRadius: '12px', padding: '20px', textAlign: 'center',
                  }}>
                    <div style={{ color: item.color, fontSize: '24px', fontWeight: 800 }}>{item.value}</div>
                    <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>{item.label}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="admin-search-bar">
              <select
                value={pagFilter}
                onChange={e => setPagFilter(e.target.value)}
                style={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px 14px', color: '#fff', fontSize: '14px' }}
              >
                <option value="">Todos os status</option>
                <option value="approved">Aprovado</option>
                <option value="pending">Pendente</option>
                <option value="rejected">Rejeitado</option>
                <option value="refunded">Reembolsado</option>
              </select>
              <button className="admin-btn-refresh" onClick={loadPagamentos}>Atualizar</button>
            </div>

            {loadingPag ? (
              <div className="admin-loading"><div className="admin-spinner" /><p>Carregando...</p></div>
            ) : (
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>Usuário</th><th>Valor</th><th>Método</th>
                      <th>Status</th><th>Data</th><th>MP ID</th><th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagamentos.length === 0 ? (
                      <tr><td colSpan={8} className="admin-empty">Nenhum pagamento encontrado.</td></tr>
                    ) : pagamentos.map(pag => (
                      <tr key={pag.id}>
                        <td className="admin-td-id">#{pag.id}</td>
                        <td style={{ color: '#94a3b8', fontSize: '13px' }}>
                          {pag.tipo_usuario === 'empresa' ? `Empresa #${pag.empresa_id}` : `Dev #${pag.dev_id}`}
                        </td>
                        <td style={{ color: '#22c55e', fontWeight: 700 }}>{fmt(pag.valor)}</td>
                        <td>
                          <span style={{
                            padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                            background: pag.metodo === 'pix' ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.15)',
                            color: pag.metodo === 'pix' ? '#22c55e' : '#818cf8',
                          }}>
                            {pag.metodo === 'pix' ? 'PIX' : 'Cartão'}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                            background: `${PAG_STATUS_COLOR[pag.status] || '#64748b'}20`,
                            color: PAG_STATUS_COLOR[pag.status] || '#64748b',
                          }}>
                            {pag.status}
                          </span>
                        </td>
                        <td style={{ color: '#64748b', fontSize: '12px' }}>{fmtDate(pag.criado_em)}</td>
                        <td style={{ color: '#64748b', fontSize: '11px', fontFamily: 'monospace' }}>
                          {pag.mp_payment_id ? pag.mp_payment_id.substring(0, 10) + '...' : '-'}
                        </td>
                        <td>
                          {pag.status === 'approved' && (
                            confirmRefund === pag.id ? (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={() => handleRefund(pag.id)} style={{
                                  padding: '4px 10px', background: 'rgba(239,68,68,0.2)', border: 'none',
                                  borderRadius: '6px', color: '#ef4444', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                                }}>
                                  Confirmar
                                </button>
                                <button onClick={() => setConfirmRefund(null)} style={{
                                  padding: '4px 10px', background: 'transparent', border: '1px solid #333',
                                  borderRadius: '6px', color: '#64748b', cursor: 'pointer', fontSize: '11px',
                                }}>
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmRefund(pag.id)} style={{
                                padding: '5px 12px', background: 'rgba(99,102,241,0.15)',
                                border: 'none', borderRadius: '6px', color: '#818cf8',
                                cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                              }}>
                                Reembolsar
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ====== TAB PLANOS ====== */}
        {activeTab === 'planos' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
              <button
                onClick={() => setPlanoModal({})}
                style={{
                  padding: '10px 22px',
                  background: 'linear-gradient(135deg, #00b4d8, #7b2cbf)',
                  border: 'none', borderRadius: '10px', color: '#fff',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                  boxShadow: '0 4px 15px rgba(0,180,216,0.3)',
                }}
              >
                + Novo Plano
              </button>
            </div>

            {loadingPlanos ? (
              <div className="admin-loading"><div className="admin-spinner" /><p>Carregando planos...</p></div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {planos.length === 0 ? (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#64748b', padding: '40px' }}>
                    Nenhum plano cadastrado.
                  </div>
                ) : planos.map(plano => (
                  <div key={plano.id} style={{
                    background: plano.ativo ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${plano.ativo ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)'}`,
                    borderRadius: '14px', padding: '20px',
                    opacity: plano.ativo ? 1 : 0.5,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <span style={{
                          fontSize: '10px', fontWeight: 700, padding: '2px 8px',
                          borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.5px',
                          background: plano.tipo === 'empresa' ? 'rgba(99,102,241,0.2)' : 'rgba(0,212,255,0.15)',
                          color: plano.tipo === 'empresa' ? '#818cf8' : '#00d4ff',
                        }}>
                          {plano.tipo}
                        </span>
                        <h4 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: '8px 0 2px' }}>
                          {plano.nome}
                        </h4>
                        {plano.descricao && (
                          <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>{plano.descricao}</p>
                        )}
                      </div>
                      <span style={{ color: '#22c55e', fontWeight: 800, fontSize: '18px' }}>
                        R${Math.floor(plano.preco_mensal)}<span style={{ fontSize: '12px', color: '#64748b' }}>/mês</span>
                      </span>
                    </div>

                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
                      {plano.features.slice(0, 3).map((f, i) => (
                        <li key={i} style={{ color: '#94a3b8', fontSize: '12px', padding: '3px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#00d4ff' }}>✓</span> {f}
                        </li>
                      ))}
                      {plano.features.length > 3 && (
                        <li style={{ color: '#64748b', fontSize: '11px' }}>+{plano.features.length - 3} mais...</li>
                      )}
                    </ul>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setPlanoModal(plano)} style={{
                        flex: 1, padding: '8px', background: 'rgba(0,212,255,0.1)',
                        border: '1px solid rgba(0,212,255,0.2)', borderRadius: '8px',
                        color: '#00d4ff', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                      }}>
                        Editar
                      </button>
                      {plano.ativo && (
                        <button onClick={() => desativarPlano(plano.id)} style={{
                          padding: '8px 12px', background: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px',
                          color: '#ef4444', cursor: 'pointer', fontSize: '12px',
                        }}>
                          Desativar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="admin-footer">
          <p className="admin-footer-brand">YourSystem &copy; 2026 — Desenvolvido por Samuel Benjamin</p>
        </div>
      </main>

      {/* Modal de plano */}
      {planoModal !== false && (
        <PlanoModal
          plano={planoModal || null}
          onClose={() => setPlanoModal(false)}
          onSave={salvarPlano}
        />
      )}

      {/* Modal confirmar delete empresa */}
      {confirmDeleteEmpresa && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: '#0f1929', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%',
          }}>
            <h2 style={{ margin: '0 0 8px', color: '#fff', fontSize: 18 }}>⚠️ Deletar Empresa</h2>
            <p style={{ margin: '0 0 16px', color: '#94a3b8', fontSize: 14 }}>
              Você está prestes a deletar permanentemente a empresa <strong style={{ color: '#fff' }}>{confirmDeleteEmpresa.nome}</strong> e todos os seus dados (atendentes, conversas, pagamentos). Esta ação é irreversível.
            </p>
            <p style={{ margin: '0 0 20px', color: '#f87171', fontSize: 13, fontWeight: 600 }}>
              Digite o nome da empresa para confirmar: <em>{confirmDeleteEmpresa.nome}</em>
            </p>
            {deleteEmpresaError && (
              <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
                ❌ {deleteEmpresaError}
              </p>
            )}
            <ConfirmDeleteInput
              nomeEsperado={confirmDeleteEmpresa.nome}
              onConfirm={handleDeleteEmpresa}
              onCancel={() => { setConfirmDeleteEmpresa(null); setDeleteEmpresaError(''); }}
              loading={deletingEmpresa}
            />
          </div>
        </div>
      )}

      {/* Modal plano personalizado por empresa */}
      {planoPersonalizadoModal && (
        <PlanoPersonalizadoModal
          empresa={planoPersonalizadoModal}
          onClose={() => setPlanoPersonalizadoModal(null)}
          onSave={loadEmpresas}
        />
      )}

      {/* Modal dias gratuitos */}
      {diasGratuitosModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: '#0f1929', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 16,
            padding: 28, width: '100%', maxWidth: 360,
          }}>
            <h2 style={{ margin: '0 0 4px', color: '#fff', fontSize: 18 }}>🎁 Dias Gratuitos</h2>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>{diasGratuitosModal.nome}</p>
            <label style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, display: 'block' }}>
              Quantos dias gratuitos conceder?
            </label>
            <input
              type="number"
              value={diasGratuitosValor}
              onChange={e => setDiasGratuitosValor(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.05)',
                color: '#fff', fontSize: 16, boxSizing: 'border-box',
              }}
            />
            <p style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
              A assinatura ativa será extendida por {diasGratuitosValor || '0'} dias.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setDiasGratuitosModal(null)}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConcederDias}
                disabled={diasGratuitosLoading}
                style={{
                  padding: '9px 20px', borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff',
                  cursor: 'pointer', fontWeight: 600, opacity: diasGratuitosLoading ? 0.6 : 1,
                }}
              >
                {diasGratuitosLoading ? 'Concedendo...' : 'Conceder Dias'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
