import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';

// ─── Design System ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a0f',
  text: '#f4f4f5',
  textSec: '#a1a1aa',
  textMuted: '#71717a',
  border: 'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.12)',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
};

const GLASS: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

const CSS_ANIM = `
@keyframes clientesFadeIn {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes drawerSlide {
  from { opacity: 0; transform: translateX(32px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes modalFade {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: scale(1); }
}
.clientes-page  { animation: clientesFadeIn 0.4s ease; }
.clientes-drawer { animation: drawerSlide 0.25s ease; }
.clientes-modal  { animation: modalFade 0.2s ease; }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClienteResumo {
  id: number;
  nome_completo: string;
  whatsapp_number: string;
  email?: string;
  cidade?: string;
  estado?: string;
  funil_etapa: string;
  atualizado_em_crm?: string;
  foto_url?: string;
}

interface CampoCustomDef {
  id: number;
  nome: string;
  slug: string;
  tipo: string;
  opcoes?: string[];
  obrigatorio: boolean;
  ativo: boolean;
  ordem: number;
}

interface CampoCustomValor extends CampoCustomDef {
  campo_id: number;
  valor?: string;
}

interface ClienteDetalhe {
  id: number;
  nome_completo: string;
  whatsapp_number: string;
  email?: string;
  cpf?: string;
  data_nascimento?: string;
  telefone_secundario?: string;
  cidade?: string;
  estado?: string;
  bairro?: string;
  endereco_residencial?: string;
  cep?: string;
  complemento?: string;
  pais?: string;
  foto_url?: string;
  profissao?: string;
  empresa_cliente?: string;
  chave_pix?: string;
  funil_etapa: string;
  valor_estimado?: number;
  observacoes_crm?: string;
  resumo_conversa?: string;
  campos_custom: CampoCustomValor[];
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ETAPAS_FUNIL: Record<string, { label: string; cor: string }> = {
  novo_lead:         { label: 'Novo Lead',         cor: '#6366f1' },
  pediu_orcamento:   { label: 'Pediu Orçamento',   cor: '#f59e0b' },
  orcamento_enviado: { label: 'Orçamento Enviado',  cor: '#3b82f6' },
  negociacao:        { label: 'Negociação',         cor: '#8b5cf6' },
  fechado:           { label: 'Fechado',            cor: '#22c55e' },
  perdido:           { label: 'Perdido',            cor: '#ef4444' },
};

const TIPOS_CAMPO = ['texto', 'numero', 'data', 'opcoes', 'booleano'];

// ─── Subcomponents ────────────────────────────────────────────────────────────

const EtapaBadge: React.FC<{ etapa: string }> = ({ etapa }) => {
  const info = ETAPAS_FUNIL[etapa] || { label: etapa, cor: '#71717a' };
  return (
    <span style={{
      background: `${info.cor}22`,
      color: info.cor,
      border: `1px solid ${info.cor}44`,
      borderRadius: 6,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {info.label}
    </span>
  );
};

const InputField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  textarea?: boolean;
}> = ({ label, value, onChange, type = 'text', textarea }) => {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: '8px 12px',
    color: C.text,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    resize: 'vertical' as const,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>{label}</label>
      {textarea ? (
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          rows={3}
          style={inputStyle}
        />
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
    </div>
  );
};

// ─── Modal Gerenciar Campos ────────────────────────────────────────────────────

interface ModalCamposProps {
  campos: CampoCustomDef[];
  onClose: () => void;
  onRefresh: () => void;
}

const ModalGerenciarCampos: React.FC<ModalCamposProps> = ({ campos, onClose, onRefresh }) => {
  const [loading, setLoading] = useState(false);
  const [formNome, setFormNome] = useState('');
  const [formTipo, setFormTipo] = useState('texto');
  const [formOpcoesStr, setFormOpcoesStr] = useState('');
  const [formObrigatorio, setFormObrigatorio] = useState(false);
  const [formOrdem, setFormOrdem] = useState(0);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [erro, setErro] = useState('');

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: '8px 12px',
    color: C.text,
    fontSize: 14,
    outline: 'none',
  };

  const resetForm = () => {
    setFormNome('');
    setFormTipo('texto');
    setFormOpcoesStr('');
    setFormObrigatorio(false);
    setFormOrdem(0);
    setEditandoId(null);
    setErro('');
  };

  const iniciarEdicao = (c: CampoCustomDef) => {
    setEditandoId(c.id);
    setFormNome(c.nome);
    setFormTipo(c.tipo);
    setFormOpcoesStr(c.opcoes ? c.opcoes.join('\n') : '');
    setFormObrigatorio(c.obrigatorio);
    setFormOrdem(c.ordem);
    setErro('');
  };

  const salvar = async () => {
    if (!formNome.trim()) { setErro('Nome é obrigatório'); return; }
    setLoading(true);
    setErro('');
    try {
      const payload: Record<string, unknown> = {
        nome: formNome.trim(),
        tipo: formTipo,
        obrigatorio: formObrigatorio,
        ordem: formOrdem,
        opcoes: formTipo === 'opcoes' && formOpcoesStr.trim()
          ? formOpcoesStr.split('\n').map(s => s.trim()).filter(Boolean)
          : null,
      };
      if (editandoId) {
        await api.put(`/clientes/campos-custom/${editandoId}`, payload);
      } else {
        await api.post('/clientes/campos-custom/', payload);
      }
      resetForm();
      onRefresh();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setErro(err.response?.data?.detail || 'Erro ao salvar campo');
    } finally {
      setLoading(false);
    }
  };

  const deletar = async (id: number) => {
    if (!window.confirm('Remover este campo? Todos os valores serão perdidos.')) return;
    try {
      await api.delete(`/clientes/campos-custom/${id}`);
      onRefresh();
    } catch {
      alert('Erro ao remover campo');
    }
  };

  const toggleAtivo = async (campo: CampoCustomDef) => {
    try {
      await api.put(`/clientes/campos-custom/${campo.id}`, { ativo: !campo.ativo });
      onRefresh();
    } catch {
      alert('Erro ao alterar status');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="clientes-modal" style={{
        ...GLASS,
        width: '100%', maxWidth: 620,
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: C.text, fontWeight: 700 }}>Gerenciar Campos</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: C.textMuted }}>
              Crie e gerencie campos customizados para seus clientes
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.08)', border: 'none',
            borderRadius: 8, color: C.textSec, cursor: 'pointer',
            width: 36, height: 36, fontSize: 18, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        <div style={{ overflow: 'auto', flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Formulário */}
          <div style={{
            background: 'rgba(139,92,246,0.06)',
            border: `1px solid rgba(139,92,246,0.2)`,
            borderRadius: 12, padding: 20,
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, color: C.violet, fontWeight: 600 }}>
              {editandoId ? 'Editar Campo' : 'Novo Campo'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, color: C.textMuted }}>Nome do campo *</label>
                <input
                  value={formNome}
                  onChange={e => setFormNome(e.target.value)}
                  placeholder="Ex: Data de contrato"
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, color: C.textMuted }}>Tipo</label>
                <select
                  value={formTipo}
                  onChange={e => setFormTipo(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {TIPOS_CAMPO.map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, color: C.textMuted }}>Ordem</label>
                <input
                  type="number"
                  value={formOrdem}
                  onChange={e => setFormOrdem(Number(e.target.value))}
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              {formTipo === 'opcoes' && (
                <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 12, color: C.textMuted }}>Opções (uma por linha)</label>
                  <textarea
                    value={formOpcoesStr}
                    onChange={e => setFormOpcoesStr(e.target.value)}
                    rows={3}
                    placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                    style={{ ...inputStyle, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              )}
              <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="obrigatorio"
                  checked={formObrigatorio}
                  onChange={e => setFormObrigatorio(e.target.checked)}
                  style={{ accentColor: C.violet, width: 16, height: 16, cursor: 'pointer' }}
                />
                <label htmlFor="obrigatorio" style={{ fontSize: 13, color: C.textSec, cursor: 'pointer' }}>
                  Campo obrigatório
                </label>
              </div>
            </div>
            {erro && (
              <p style={{ margin: '12px 0 0', fontSize: 13, color: C.red }}>{erro}</p>
            )}
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button
                onClick={salvar}
                disabled={loading}
                style={{
                  background: C.violet, color: '#fff', border: 'none',
                  borderRadius: 8, padding: '9px 20px', fontSize: 14,
                  fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Criar campo'}
              </button>
              {editandoId && (
                <button
                  onClick={resetForm}
                  style={{
                    background: 'rgba(255,255,255,0.08)', color: C.textSec,
                    border: 'none', borderRadius: 8, padding: '9px 16px',
                    fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {/* Lista de campos existentes */}
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, color: C.textSec, fontWeight: 600 }}>
              Campos existentes ({campos.length})
            </h3>
            {campos.length === 0 ? (
              <p style={{ color: C.textMuted, fontSize: 13 }}>Nenhum campo criado ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {campos.map(campo => (
                  <div key={campo.id} style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    opacity: campo.ativo ? 1 : 0.5,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{campo.nome}</span>
                        <span style={{
                          background: 'rgba(139,92,246,0.15)', color: C.violet,
                          borderRadius: 4, padding: '1px 6px', fontSize: 11,
                        }}>{campo.tipo}</span>
                        {campo.obrigatorio && (
                          <span style={{
                            background: 'rgba(239,68,68,0.15)', color: C.red,
                            borderRadius: 4, padding: '1px 6px', fontSize: 11,
                          }}>obrigatório</span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: C.textMuted }}>slug: {campo.slug} · ordem: {campo.ordem}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => toggleAtivo(campo)}
                        title={campo.ativo ? 'Desativar' : 'Ativar'}
                        style={{
                          background: campo.ativo ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)',
                          color: campo.ativo ? C.emerald : C.textMuted,
                          border: 'none', borderRadius: 6, width: 32, height: 32,
                          cursor: 'pointer', fontSize: 14, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {campo.ativo ? '●' : '○'}
                      </button>
                      <button
                        onClick={() => iniciarEdicao(campo)}
                        title="Editar"
                        style={{
                          background: 'rgba(6,182,212,0.12)', color: C.cyan,
                          border: 'none', borderRadius: 6, width: 32, height: 32,
                          cursor: 'pointer', fontSize: 14, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deletar(campo.id)}
                        title="Remover"
                        style={{
                          background: 'rgba(239,68,68,0.12)', color: C.red,
                          border: 'none', borderRadius: 6, width: 32, height: 32,
                          cursor: 'pointer', fontSize: 14, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Drawer Cliente ────────────────────────────────────────────────────────────

interface DrawerClienteProps {
  clienteId: number;
  onClose: () => void;
  onSaved: () => void;
}

const DrawerCliente: React.FC<DrawerClienteProps> = ({ clienteId, onClose, onSaved }) => {
  const [cliente, setCliente] = useState<ClienteDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editado, setEditado] = useState<Record<string, string>>({});
  const [valoresCustom, setValoresCustom] = useState<Record<number, string>>({});
  const [salvandoCustom, setSalvandoCustom] = useState<Record<number, boolean>>({});
  const [aba, setAba] = useState<'basico' | 'profissional' | 'crm' | 'custom'>('basico');

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const { data } = await api.get<ClienteDetalhe>(`/clientes/${clienteId}`);
        setCliente(data);
        const mapa: Record<number, string> = {};
        data.campos_custom.forEach(c => { if (c.valor != null) mapa[c.campo_id] = c.valor; });
        setValoresCustom(mapa);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [clienteId]);

  const val = (campo: keyof ClienteDetalhe): string => {
    if (campo in editado) return editado[campo as string] ?? '';
    const v = cliente?.[campo];
    return v != null ? String(v) : '';
  };

  const set = (campo: string, valor: string) => {
    setEditado(prev => ({ ...prev, [campo]: valor }));
  };

  const salvarBasico = async () => {
    if (!cliente) return;
    setSaving(true);
    try {
      await api.put(`/clientes/${cliente.id}`, editado);
      setEditado({});
      onSaved();
    } catch {
      alert('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const salvarCampoCustom = async (campoId: number) => {
    if (!cliente) return;
    setSalvandoCustom(prev => ({ ...prev, [campoId]: true }));
    try {
      await api.put(`/clientes/${cliente.id}/valores-custom/${campoId}`, {
        valor: valoresCustom[campoId] ?? null,
      });
    } catch {
      alert('Erro ao salvar campo');
    } finally {
      setSalvandoCustom(prev => ({ ...prev, [campoId]: false }));
    }
  };

  const temEdicoes = Object.keys(editado).length > 0;

  const abas: { key: typeof aba; label: string }[] = [
    { key: 'basico', label: 'Dados Básicos' },
    { key: 'profissional', label: 'Profissional' },
    { key: 'crm', label: 'CRM' },
    { key: 'custom', label: `Campos (${cliente?.campos_custom.length ?? 0})` },
  ];

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: '8px 12px',
    color: C.text,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const renderCampoCustom = (campo: CampoCustomValor) => {
    const currentVal = valoresCustom[campo.campo_id] ?? '';
    const onChange = (v: string) => setValoresCustom(prev => ({ ...prev, [campo.campo_id]: v }));
    const isSaving = salvandoCustom[campo.campo_id] || false;

    let input: React.ReactNode;
    if (campo.tipo === 'booleano') {
      input = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <input
            type="checkbox"
            id={`custom-${campo.campo_id}`}
            checked={currentVal === 'true'}
            onChange={e => onChange(e.target.checked ? 'true' : 'false')}
            style={{ accentColor: C.violet, width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor={`custom-${campo.campo_id}`} style={{ fontSize: 14, color: C.textSec, cursor: 'pointer' }}>
            {currentVal === 'true' ? 'Sim' : 'Não'}
          </label>
        </div>
      );
    } else if (campo.tipo === 'opcoes' && campo.opcoes) {
      input = (
        <select
          value={currentVal}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">-- selecione --</option>
          {campo.opcoes.map(op => <option key={op} value={op}>{op}</option>)}
        </select>
      );
    } else if (campo.tipo === 'data') {
      input = <input type="date" value={currentVal} onChange={e => onChange(e.target.value)} style={inputStyle} />;
    } else if (campo.tipo === 'numero') {
      input = <input type="number" value={currentVal} onChange={e => onChange(e.target.value)} style={inputStyle} />;
    } else {
      input = <input type="text" value={currentVal} onChange={e => onChange(e.target.value)} style={inputStyle} />;
    }

    return (
      <div key={campo.campo_id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>
          {campo.nome}
          {campo.obrigatorio && <span style={{ color: C.red }}> *</span>}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>{input}</div>
          <button
            onClick={() => salvarCampoCustom(campo.campo_id)}
            disabled={isSaving}
            style={{
              background: C.emerald, color: '#fff', border: 'none',
              borderRadius: 8, padding: '0 14px', fontSize: 13,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.7 : 1, whiteSpace: 'nowrap',
            }}
          >
            {isSaving ? '...' : 'Salvar'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 800,
      display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
      background: 'rgba(0,0,0,0.5)',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="clientes-drawer" style={{
        width: '100%', maxWidth: 520,
        background: '#0f0f14',
        border: `1px solid ${C.border}`,
        borderRight: 'none',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header drawer */}
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <div style={{ flex: 1 }}>
            {loading ? (
              <div style={{ height: 20, background: 'rgba(255,255,255,0.05)', borderRadius: 4, width: 200 }} />
            ) : (
              <>
                <h2 style={{ margin: 0, fontSize: 17, color: C.text, fontWeight: 700 }}>
                  {cliente?.nome_completo}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: C.textMuted }}>
                  {cliente?.whatsapp_number}
                  {cliente && <>&ensp;<EtapaBadge etapa={cliente.funil_etapa} /></>}
                </p>
              </>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.08)', border: 'none',
            borderRadius: 8, color: C.textSec, cursor: 'pointer',
            width: 36, height: 36, fontSize: 18, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>✕</button>
        </div>

        {/* Abas */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${C.border}`,
          padding: '0 24px',
          overflowX: 'auto',
        }}>
          {abas.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)} style={{
              background: 'none', border: 'none',
              borderBottom: aba === a.key ? `2px solid ${C.violet}` : '2px solid transparent',
              color: aba === a.key ? C.text : C.textMuted,
              padding: '12px 16px',
              fontSize: 13, fontWeight: aba === a.key ? 600 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}>{a.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ height: 56, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }} />
              ))}
            </div>
          ) : cliente ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {aba === 'basico' && (
                <>
                  <InputField label="Nome completo" value={val('nome_completo')} onChange={v => set('nome_completo', v)} />
                  <InputField label="WhatsApp" value={val('whatsapp_number')} onChange={v => set('whatsapp_number', v)} />
                  <InputField label="E-mail" value={val('email')} onChange={v => set('email', v)} />
                  <InputField label="CPF" value={val('cpf')} onChange={v => set('cpf', v)} />
                  <InputField label="Data de nascimento" value={val('data_nascimento')} onChange={v => set('data_nascimento', v)} type="date" />
                  <InputField label="Telefone secundário" value={val('telefone_secundario')} onChange={v => set('telefone_secundario', v)} />
                  <InputField label="Cidade" value={val('cidade')} onChange={v => set('cidade', v)} />
                  <InputField label="Estado" value={val('estado')} onChange={v => set('estado', v)} />
                  <InputField label="CEP" value={val('cep')} onChange={v => set('cep', v)} />
                  <InputField label="Endereço" value={val('endereco_residencial')} onChange={v => set('endereco_residencial', v)} />
                  <InputField label="Complemento" value={val('complemento')} onChange={v => set('complemento', v)} />
                </>
              )}
              {aba === 'profissional' && (
                <>
                  <InputField label="Profissão" value={val('profissao')} onChange={v => set('profissao', v)} />
                  <InputField label="Empresa" value={val('empresa_cliente')} onChange={v => set('empresa_cliente', v)} />
                  <InputField label="Chave PIX" value={val('chave_pix')} onChange={v => set('chave_pix', v)} />
                </>
              )}
              {aba === 'crm' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>Etapa do funil</label>
                    <select
                      value={val('funil_etapa') || 'novo_lead'}
                      onChange={e => set('funil_etapa', e.target.value)}
                      style={{
                        ...inputStyle,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8, padding: '8px 12px',
                        color: C.text, fontSize: 14, cursor: 'pointer',
                      }}
                    >
                      {Object.entries(ETAPAS_FUNIL).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <InputField label="Valor estimado (R$)" value={val('valor_estimado')} onChange={v => set('valor_estimado', v)} type="number" />
                  <InputField label="Observações CRM" value={val('observacoes_crm')} onChange={v => set('observacoes_crm', v)} textarea />
                  <InputField label="Resumo da conversa" value={val('resumo_conversa')} onChange={v => set('resumo_conversa', v)} textarea />
                </>
              )}
              {aba === 'custom' && (
                <>
                  {cliente.campos_custom.length === 0 ? (
                    <div style={{
                      textAlign: 'center', padding: '40px 20px',
                      color: C.textMuted, fontSize: 14,
                    }}>
                      <p style={{ margin: 0 }}>Nenhum campo customizado criado.</p>
                      <p style={{ margin: '8px 0 0', fontSize: 12 }}>
                        Use "Gerenciar Campos" para criar campos para sua empresa.
                      </p>
                    </div>
                  ) : (
                    cliente.campos_custom.map(renderCampoCustom)
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>

        {/* Rodapé com botão salvar (abas exceto custom) */}
        {aba !== 'custom' && (
          <div style={{
            padding: '16px 24px',
            borderTop: `1px solid ${C.border}`,
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <button
              onClick={salvarBasico}
              disabled={saving || !temEdicoes}
              style={{
                background: temEdicoes ? C.violet : 'rgba(255,255,255,0.06)',
                color: temEdicoes ? '#fff' : C.textMuted,
                border: 'none', borderRadius: 8,
                padding: '10px 24px', fontSize: 14, fontWeight: 600,
                cursor: saving || !temEdicoes ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
            {temEdicoes && (
              <button
                onClick={() => setEditado({})}
                style={{
                  background: 'rgba(255,255,255,0.06)', color: C.textSec,
                  border: 'none', borderRadius: 8, padding: '10px 16px',
                  fontSize: 14, cursor: 'pointer',
                }}
              >
                Descartar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Página Principal ──────────────────────────────────────────────────────────

const ClientesPage: React.FC = () => {
  useTheme();

  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [camposCustom, setCamposCustom] = useState<CampoCustomDef[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<number | null>(null);
  const [modalCampos, setModalCampos] = useState(false);
  const LIMIT = 50;

  const carregarCamposCustom = useCallback(async () => {
    try {
      const { data } = await api.get<CampoCustomDef[]>('/clientes/campos-custom/', {
        params: { incluir_inativos: true },
      });
      setCamposCustom(data);
    } catch {
      // ignore
    }
  }, []);

  const carregarClientes = useCallback(async (novaBusca?: string, novoOffset?: number) => {
    setLoading(true);
    const buscaParam = novaBusca !== undefined ? novaBusca : busca;
    const offsetParam = novoOffset !== undefined ? novoOffset : offset;
    try {
      const { data } = await api.get('/clientes/', {
        params: {
          busca: buscaParam || undefined,
          limit: LIMIT,
          offset: offsetParam,
        },
      });
      setClientes(data.items);
      setTotal(data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [busca, offset]);

  useEffect(() => {
    carregarClientes();
    carregarCamposCustom();
  }, [carregarClientes, carregarCamposCustom]);

  const handleBusca = (valor: string) => {
    setBusca(valor);
    setOffset(0);
    carregarClientes(valor, 0);
  };

  const totalPaginas = Math.ceil(total / LIMIT);
  const paginaAtual = Math.floor(offset / LIMIT) + 1;

  return (
    <>
      <style>{CSS_ANIM}</style>

      <div className="clientes-page" style={{
        minHeight: '100vh',
        background: C.bg,
        padding: '32px 28px',
        color: C.text,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>
              Clientes
            </h1>
            <p style={{ margin: '6px 0 0', color: C.textMuted, fontSize: 14 }}>
              {total} cliente{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setModalCampos(true)}
              style={{
                background: 'rgba(139,92,246,0.15)',
                border: `1px solid rgba(139,92,246,0.3)`,
                borderRadius: 10,
                color: C.violet, padding: '10px 18px',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              ⚙ Gerenciar Campos
            </button>
          </div>
        </div>

        {/* Barra de busca */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            value={busca}
            onChange={e => handleBusca(e.target.value)}
            placeholder="Buscar por nome, número ou e-mail..."
            style={{
              width: '100%', maxWidth: 480,
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '11px 16px',
              color: C.text, fontSize: 14, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Tabela */}
        <div style={{ ...GLASS, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.textMuted }}>
              Carregando clientes...
            </div>
          ) : clientes.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: C.textMuted }}>
              <p style={{ margin: 0, fontSize: 16 }}>Nenhum cliente encontrado.</p>
              {busca && (
                <p style={{ margin: '8px 0 0', fontSize: 13 }}>
                  Tente uma busca diferente.
                </p>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Cliente', 'WhatsApp', 'Cidade / Estado', 'Etapa', 'Última atualização'].map(h => (
                      <th key={h} style={{
                        padding: '14px 16px', textAlign: 'left',
                        fontSize: 12, color: C.textMuted, fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c, idx) => (
                    <tr
                      key={c.id}
                      onClick={() => setClienteSelecionado(c.id)}
                      style={{
                        borderBottom: idx < clientes.length - 1 ? `1px solid ${C.border}` : 'none',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: `linear-gradient(135deg, ${C.violet}, ${C.cyan})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
                            overflow: 'hidden',
                          }}>
                            {c.foto_url
                              ? <img src={c.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : c.nome_completo.charAt(0).toUpperCase()
                            }
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{c.nome_completo}</div>
                            {c.email && <div style={{ fontSize: 12, color: C.textMuted }}>{c.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 14, color: C.textSec }}>
                        {c.whatsapp_number}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 14, color: C.textSec }}>
                        {[c.cidade, c.estado].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <EtapaBadge etapa={c.funil_etapa} />
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: C.textMuted }}>
                        {c.atualizado_em_crm
                          ? new Date(c.atualizado_em_crm).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div style={{
            marginTop: 20, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 12,
          }}>
            <button
              onClick={() => { const no = Math.max(0, offset - LIMIT); setOffset(no); carregarClientes(busca, no); }}
              disabled={offset === 0}
              style={{
                background: 'rgba(255,255,255,0.08)', color: C.textSec,
                border: 'none', borderRadius: 8, padding: '8px 16px',
                cursor: offset === 0 ? 'not-allowed' : 'pointer',
                opacity: offset === 0 ? 0.4 : 1, fontSize: 14,
              }}
            >← Anterior</button>
            <span style={{ fontSize: 14, color: C.textMuted }}>
              Página {paginaAtual} de {totalPaginas}
            </span>
            <button
              onClick={() => { const no = offset + LIMIT; setOffset(no); carregarClientes(busca, no); }}
              disabled={paginaAtual >= totalPaginas}
              style={{
                background: 'rgba(255,255,255,0.08)', color: C.textSec,
                border: 'none', borderRadius: 8, padding: '8px 16px',
                cursor: paginaAtual >= totalPaginas ? 'not-allowed' : 'pointer',
                opacity: paginaAtual >= totalPaginas ? 0.4 : 1, fontSize: 14,
              }}
            >Próxima →</button>
          </div>
        )}
      </div>

      {/* Drawer de detalhe */}
      {clienteSelecionado !== null && (
        <DrawerCliente
          clienteId={clienteSelecionado}
          onClose={() => setClienteSelecionado(null)}
          onSaved={() => { carregarClientes(); }}
        />
      )}

      {/* Modal gerenciar campos */}
      {modalCampos && (
        <ModalGerenciarCampos
          campos={camposCustom}
          onClose={() => setModalCampos(false)}
          onRefresh={carregarCamposCustom}
        />
      )}
    </>
  );
};

export default ClientesPage;
