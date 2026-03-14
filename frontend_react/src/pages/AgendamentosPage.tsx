import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api, { agendamentosApi, agendaLembretesApi } from '../services/api';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Agendamento {
  id: number;
  slot_id: number;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  whatsapp_number: string;
  nome_cliente: string | null;
  cliente_id: number | null;
  status: string;
  compareceu: boolean | null;
  observacoes: string | null;
  especialidade_id: number | null;
  especialidade_nome: string | null;
  especialidade_valor: number | null;
  lembrete_enviado: boolean;
  criado_em: string | null;
}

interface LembreteConfig {
  modelo_id?: number | null;
  modelo_params?: string[];
  template_id?: number | null;
  template_params?: Record<string, string>;
  ativo?: boolean;
}

interface ModeloOpcao {
  id: number;
  nome: string;
  tipo: string;
  mensagem: string;
  num_variaveis: number;
}

interface TemplateOpcao {
  id: number;
  name: string;
  language: string;
  body_text: string;
  params: string[];
}

interface CampoOpcao {
  value: string;
  label: string;
}

// ─── Constantes de estilo ──────────────────────────────────────────────────────

const C = {
  bg: '#0a0a0f',
  card: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.08)',
  text: '#f4f4f5',
  textSec: '#a1a1aa',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
};

const GLASS: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  border: `1px solid ${C.border}`,
  borderRadius: '1rem',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

const statusCor: Record<string, string> = {
  confirmado: C.cyan,
  pendente: C.amber,
  cancelado: C.red,
  realizado: C.emerald,
};

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function AgendamentosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hoje = new Date();

  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroEsp, setFiltroEsp] = useState('');
  const [marcandoId, setMarcandoId] = useState<number | null>(null);
  const [enviandoLembrete, setEnviandoLembrete] = useState<number | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // Configuração de lembrete
  const [abaPainel, setAbaPainel] = useState<'lista' | 'lembrete'>('lista');
  const [lembreteConfig, setLembreteConfig] = useState<LembreteConfig>({ modelo_params: [], template_params: {} });
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  // Opções disponíveis para seleção
  const [modelos, setModelos] = useState<ModeloOpcao[]>([]);
  const [templates, setTemplates] = useState<TemplateOpcao[]>([]);
  const [camposDisp, setCamposDisp] = useState<CampoOpcao[]>([]);
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(false);

  // ── Navegação de mês ───────────────────────────────────────────────────────
  const navMes = (delta: number) => {
    const d = new Date(ano, mes - 1 + delta, 1);
    setMes(d.getMonth() + 1);
    setAno(d.getFullYear());
  };

  // ── Carregar dados ─────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await agendamentosApi.listarMes(mes, ano);
      setAgendamentos(data);
    } catch { /* */ }
    setLoading(false);
  }, [mes, ano]);

  useEffect(() => { carregar(); }, [carregar]);

  const carregarConfigLembrete = useCallback(async () => {
    setCarregandoOpcoes(true);
    try {
      const [cfg, opcoes] = await Promise.all([
        agendaLembretesApi.getConfig(),
        api.get('/agenda/lembrete-opcoes').then(r => r.data),
      ]);
      setLembreteConfig({
        modelo_id: cfg.modelo_id ?? null,
        modelo_params: cfg.modelo_params ?? [],
        template_id: cfg.template_id ?? null,
        template_params: cfg.template_params ?? {},
        ativo: cfg.ativo ?? true,
      });
      setModelos(opcoes.modelos || []);
      setTemplates(opcoes.templates || []);
      setCamposDisp(opcoes.campos_disponiveis || []);
    } catch { /* */ }
    setCarregandoOpcoes(false);
  }, []);

  useEffect(() => {
    if (abaPainel === 'lembrete') carregarConfigLembrete();
  }, [abaPainel, carregarConfigLembrete]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = {
    total: agendamentos.filter(a => a.status !== 'cancelado').length,
    confirmados: agendamentos.filter(a => a.status === 'confirmado').length,
    realizados: agendamentos.filter(a => a.status === 'realizado').length,
    compareceram: agendamentos.filter(a => a.compareceu === true).length,
    faltaram: agendamentos.filter(a => a.compareceu === false).length,
    receita: agendamentos
      .filter(a => a.status !== 'cancelado' && a.especialidade_valor)
      .reduce((s, a) => s + (a.especialidade_valor || 0), 0),
  };

  // ── Marcar comparecimento ──────────────────────────────────────────────────
  const marcarComparecimento = async (id: number, compareceu: boolean) => {
    setMarcandoId(id);
    try {
      await agendamentosApi.marcarComparecimento(id, compareceu);
      setFeedbackMsg(compareceu ? '✅ Presença confirmada! CRM atualizado.' : '❌ Falta registrada.');
      carregar();
    } catch (e: any) {
      setFeedbackMsg('Erro ao marcar: ' + (e.response?.data?.detail || 'tente novamente'));
    }
    setMarcandoId(null);
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  // ── Cancelar ──────────────────────────────────────────────────────────────
  const cancelarAgendamento = async (id: number) => {
    if (!window.confirm('Cancelar este agendamento?')) return;
    try {
      await agendamentosApi.atualizar(id, { status: 'cancelado' });
      carregar();
    } catch { /* */ }
  };

  // ── Lembrete manual ───────────────────────────────────────────────────────
  const enviarLembrete = async (id: number) => {
    setEnviandoLembrete(id);
    try {
      const r = await agendaLembretesApi.enviarLembreteManual(id);
      setFeedbackMsg(r.enviado
        ? `✅ Lembrete enviado via ${r.canal}`
        : '⚠️ Não foi possível enviar (configure o lembrete primeiro)');
      carregar();
    } catch (e: any) {
      setFeedbackMsg(e.response?.data?.detail || 'Erro ao enviar lembrete');
    }
    setEnviandoLembrete(null);
    setTimeout(() => setFeedbackMsg(''), 4000);
  };

  // ── Salvar config de lembrete ─────────────────────────────────────────────
  const salvarConfig = async () => {
    setSalvandoConfig(true);
    try {
      await agendaLembretesApi.salvarConfig({ ...lembreteConfig, ativo: true });
      setFeedbackMsg('✅ Configuração salva!');
    } catch { setFeedbackMsg('Erro ao salvar'); }
    setSalvandoConfig(false);
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  // ── Helpers de preview ────────────────────────────────────────────────────
  const modeloSelecionado = modelos.find(m => m.id === lembreteConfig.modelo_id) ?? null;
  const templateSelecionado = templates.find(t => t.id === lembreteConfig.template_id) ?? null;

  const previewModelo = () => {
    if (!modeloSelecionado) return '';
    let txt = modeloSelecionado.mensagem;
    (lembreteConfig.modelo_params || []).forEach(campo => {
      const lbl = camposDisp.find(c => c.value === campo)?.label || campo;
      txt = txt.replace('{}', `[${lbl}]`);
    });
    return txt;
  };

  const previewTemplate = () => {
    if (!templateSelecionado) return '';
    let txt = templateSelecionado.body_text;
    templateSelecionado.params.forEach(n => {
      const campo = (lembreteConfig.template_params || {})[n] || '';
      const lbl = camposDisp.find(c => c.value === campo)?.label || `campo ${n}`;
      txt = txt.replace(`{{${n}}}`, `[${lbl}]`);
    });
    return txt;
  };

  // ── Filtros ──────────────────────────────────────────────────────────────
  const ags = agendamentos.filter(a => {
    if (filtroStatus && a.status !== filtroStatus) return false;
    if (filtroEsp && a.especialidade_nome !== filtroEsp) return false;
    return true;
  });

  const especialidades = [...new Set(agendamentos.map(a => a.especialidade_nome).filter(Boolean))];

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/empresa/agenda')}
            style={{ background: 'none', border: 'none', color: C.textSec, cursor: 'pointer', fontSize: 20 }}>←</button>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>📋 Acompanhamento de Agendamentos</h1>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => navMes(-1)}
              style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>‹</button>
            <span style={{ lineHeight: '34px', minWidth: 140, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
              {MESES[mes - 1]} {ano}
            </span>
            <button onClick={() => navMes(1)}
              style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>›</button>
          </div>
        </div>

        {/* Feedback */}
        {feedbackMsg && (
          <div style={{ ...GLASS, padding: '10px 16px', marginBottom: 16, color: feedbackMsg.startsWith('✅') ? C.emerald : C.amber, fontSize: 13 }}>
            {feedbackMsg}
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total', valor: kpis.total, cor: C.violet },
            { label: 'Confirmados', valor: kpis.confirmados, cor: C.cyan },
            { label: 'Realizados', valor: kpis.realizados, cor: C.emerald },
            { label: 'Compareceram', valor: kpis.compareceram, cor: C.emerald },
            { label: 'Faltaram', valor: kpis.faltaram, cor: C.red },
            { label: 'Receita Est.', valor: `R$ ${kpis.receita.toFixed(2).replace('.', ',')}`, cor: C.amber },
          ].map(k => (
            <div key={k.label} style={{ ...GLASS, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.cor }}>{k.valor}</div>
              <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { key: 'lista', label: '📋 Lista de Agendamentos' },
            { key: 'lembrete', label: '⏰ Configurar Lembrete' },
          ].map(t => (
            <button key={t.key} onClick={() => setAbaPainel(t.key as any)}
              style={{
                padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: abaPainel === t.key ? C.violet : 'rgba(255,255,255,0.04)',
                border: `1px solid ${abaPainel === t.key ? C.violet : C.border}`,
                color: abaPainel === t.key ? '#fff' : C.textSec,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Aba: Lista ── */}
        {abaPainel === 'lista' && (
          <>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: 8, background: '#1a1a2e', border: `1px solid ${C.border}`, color: C.text, fontSize: 13 }}>
                <option value="">Todos os status</option>
                <option value="confirmado">Confirmado</option>
                <option value="realizado">Realizado</option>
                <option value="cancelado">Cancelado</option>
                <option value="pendente">Pendente</option>
              </select>
              {especialidades.length > 0 && (
                <select value={filtroEsp} onChange={e => setFiltroEsp(e.target.value)}
                  style={{ padding: '7px 12px', borderRadius: 8, background: '#1a1a2e', border: `1px solid ${C.border}`, color: C.text, fontSize: 13 }}>
                  <option value="">Todas as especialidades</option>
                  {especialidades.map(e => <option key={e!} value={e!}>{e}</option>)}
                </select>
              )}
              <span style={{ lineHeight: '36px', color: C.textSec, fontSize: 12 }}>
                {loading ? 'Carregando...' : `${ags.length} agendamento(s)`}
              </span>
            </div>

            {/* Tabela / Cards */}
            {ags.length === 0 ? (
              <div style={{ ...GLASS, padding: 48, textAlign: 'center', color: C.textSec }}>
                Nenhum agendamento encontrado para {MESES[mes - 1]} {ano}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ags.map(ag => (
                  <div key={ag.id} style={{
                    ...GLASS,
                    padding: '14px 18px',
                    borderLeft: `3px solid ${statusCor[ag.status] || C.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>

                      {/* Data/Hora */}
                      <div style={{ minWidth: 100 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.cyan }}>
                          {new Date(ag.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </div>
                        <div style={{ fontSize: 12, color: C.textSec }}>{ag.hora_inicio}</div>
                      </div>

                      {/* Cliente */}
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{ag.nome_cliente || ag.whatsapp_number}</div>
                        <div style={{ fontSize: 11, color: C.textSec }}>{ag.whatsapp_number}</div>
                      </div>

                      {/* Especialidade */}
                      {ag.especialidade_nome && (
                        <div style={{ minWidth: 120 }}>
                          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: `${C.violet}22`, color: C.violet, fontWeight: 600 }}>
                            {ag.especialidade_nome}
                          </span>
                          {ag.especialidade_valor && (
                            <div style={{ fontSize: 11, color: C.amber, marginTop: 2 }}>
                              R$ {ag.especialidade_valor.toFixed(2).replace('.', ',')}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status */}
                      <span style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 20, fontWeight: 600,
                        background: `${statusCor[ag.status] || C.border}22`,
                        color: statusCor[ag.status] || C.textSec,
                      }}>
                        {ag.status}
                      </span>

                      {/* Compareceu */}
                      <div style={{ display: 'flex', gap: 4 }}>
                        {ag.compareceu === true && (
                          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: `${C.emerald}22`, color: C.emerald }}>✅ Foi</span>
                        )}
                        {ag.compareceu === false && (
                          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: `${C.red}22`, color: C.red }}>❌ Faltou</span>
                        )}
                      </div>

                      {/* Ações */}
                      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                        {ag.status !== 'cancelado' && ag.compareceu === null && (
                          <>
                            <button
                              onClick={() => marcarComparecimento(ag.id, true)}
                              disabled={marcandoId === ag.id}
                              style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.emerald}`, background: 'transparent', color: C.emerald, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                              {marcandoId === ag.id ? '...' : '✅ Foi'}
                            </button>
                            <button
                              onClick={() => marcarComparecimento(ag.id, false)}
                              disabled={marcandoId === ag.id}
                              style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.red}`, background: 'transparent', color: C.red, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                              {marcandoId === ag.id ? '...' : '❌ Faltou'}
                            </button>
                          </>
                        )}

                        {!ag.lembrete_enviado && ag.status === 'confirmado' && (
                          <button
                            onClick={() => enviarLembrete(ag.id)}
                            disabled={enviandoLembrete === ag.id}
                            style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.amber}`, background: 'transparent', color: C.amber, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                            {enviandoLembrete === ag.id ? '...' : '📩 Lembrete'}
                          </button>
                        )}
                        {ag.lembrete_enviado && (
                          <span style={{ fontSize: 10, color: C.textSec, lineHeight: '28px' }}>📩 enviado</span>
                        )}

                        {ag.status === 'confirmado' && (
                          <button
                            onClick={() => cancelarAgendamento(ag.id)}
                            style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.red}33`, background: 'transparent', color: `${C.red}aa`, cursor: 'pointer', fontSize: 11 }}>
                            🗑
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Aba: Configurar Lembrete ── */}
        {abaPainel === 'lembrete' && (
          <div>
            {carregandoOpcoes ? (
              <div style={{ ...GLASS, padding: 48, textAlign: 'center', color: C.textSec }}>Carregando opções...</div>
            ) : (
              <>
                {/* ── Mensagem Interativa (janela 24h) ── */}
                <div style={{ ...GLASS, padding: 24, marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.cyan, marginBottom: 4 }}>
                    📱 Mensagem Interativa <span style={{ fontSize: 11, fontWeight: 400, color: C.textSec }}>(usada quando o cliente está na janela de 24h)</span>
                  </div>
                  <p style={{ margin: '0 0 16px', fontSize: 12, color: C.textSec }}>
                    Crie sua mensagem em <strong>Envios em Massa</strong>, salve como modelo e selecione aqui. Use <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>{'{}'}</code> onde quiser inserir dados do agendamento.
                  </p>

                  {/* Seletor de modelo */}
                  <label style={{ fontSize: 11, color: C.textSec, display: 'block', marginBottom: 6 }}>Selecionar modelo salvo</label>
                  <select
                    value={lembreteConfig.modelo_id ?? ''}
                    onChange={e => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      const mdl = modelos.find(m => m.id === id);
                      const numVars = mdl ? mdl.num_variaveis : 0;
                      setLembreteConfig(p => ({ ...p, modelo_id: id, modelo_params: Array(numVars).fill('') }));
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#1a1a2e', color: C.text, fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
                  >
                    <option value="">— Selecione um modelo —</option>
                    {modelos.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.nome} ({m.tipo}{m.num_variaveis > 0 ? ` · ${m.num_variaveis} variável(is)` : ''})
                      </option>
                    ))}
                  </select>

                  {modelos.length === 0 && (
                    <div style={{ fontSize: 12, color: C.amber, marginBottom: 10 }}>
                      ⚠️ Nenhum modelo salvo. Crie um em <strong>Envios em Massa → Modelos</strong>.
                    </div>
                  )}

                  {/* Mapeamento de variáveis */}
                  {modeloSelecionado && modeloSelecionado.num_variaveis > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 12 }}>
                        Mapear variáveis <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>{'{}'}</code> para campos do agendamento:
                      </div>
                      {Array.from({ length: modeloSelecionado.num_variaveis }).map((_, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span style={{ fontSize: 12, color: C.cyan, minWidth: 80, fontFamily: 'monospace' }}>
                            {`{}`} #{i + 1}
                          </span>
                          <select
                            value={(lembreteConfig.modelo_params || [])[i] || ''}
                            onChange={e => {
                              const params = [...(lembreteConfig.modelo_params || [])];
                              params[i] = e.target.value;
                              setLembreteConfig(p => ({ ...p, modelo_params: params }));
                            }}
                            style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#1a1a2e', color: C.text, fontSize: 12 }}
                          >
                            <option value="">— Selecione o dado —</option>
                            {camposDisp.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Preview */}
                  {modeloSelecionado && (
                    <div style={{ background: 'rgba(6,182,212,0.06)', border: `1px solid ${C.cyan}33`, borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ fontSize: 10, color: C.cyan, fontWeight: 600, marginBottom: 4 }}>PRÉVIA DA MENSAGEM</div>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{previewModelo()}</div>
                    </div>
                  )}
                </div>

                {/* ── Template Meta (fora da janela) ── */}
                <div style={{ ...GLASS, padding: 24, marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.amber, marginBottom: 4 }}>
                    📨 Template Aprovado <span style={{ fontSize: 11, fontWeight: 400, color: C.textSec }}>(usado quando o cliente está fora da janela de 24h)</span>
                  </div>
                  <p style={{ margin: '0 0 16px', fontSize: 12, color: C.textSec }}>
                    Crie o template em <strong>Templates</strong>, aguarde aprovação da Meta e selecione aqui. Cada <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>{'{{N}}'}</code> vira um campo de dado do agendamento.
                  </p>

                  {/* Seletor de template */}
                  <label style={{ fontSize: 11, color: C.textSec, display: 'block', marginBottom: 6 }}>Selecionar template aprovado</label>
                  <select
                    value={lembreteConfig.template_id ?? ''}
                    onChange={e => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      setLembreteConfig(p => ({ ...p, template_id: id, template_params: {} }));
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#1a1a2e', color: C.text, fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
                  >
                    <option value="">— Selecione um template aprovado —</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.language}{t.params.length > 0 ? ` · ${t.params.length} parâm.` : ''})
                      </option>
                    ))}
                  </select>

                  {templates.length === 0 && (
                    <div style={{ fontSize: 12, color: C.amber, marginBottom: 10 }}>
                      ⚠️ Nenhum template aprovado. Crie e aguarde aprovação em <strong>Templates</strong>.
                    </div>
                  )}

                  {/* Mapeamento de parâmetros {{N}} */}
                  {templateSelecionado && templateSelecionado.params.length > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 12 }}>
                        Mapear parâmetros para campos do agendamento:
                      </div>
                      {templateSelecionado.params.map(n => (
                        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span style={{ fontSize: 12, color: C.amber, minWidth: 48, fontFamily: 'monospace' }}>
                            {`{{${n}}}`}
                          </span>
                          <select
                            value={(lembreteConfig.template_params || {})[n] || ''}
                            onChange={e => setLembreteConfig(p => ({
                              ...p,
                              template_params: { ...(p.template_params || {}), [n]: e.target.value }
                            }))}
                            style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#1a1a2e', color: C.text, fontSize: 12 }}
                          >
                            <option value="">— Selecione o dado —</option>
                            {camposDisp.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Preview */}
                  {templateSelecionado && (
                    <div style={{ background: 'rgba(245,158,11,0.06)', border: `1px solid ${C.amber}33`, borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ fontSize: 10, color: C.amber, fontWeight: 600, marginBottom: 4 }}>PRÉVIA DO TEMPLATE</div>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{previewTemplate()}</div>
                    </div>
                  )}
                </div>

                <button
                  onClick={salvarConfig}
                  disabled={salvandoConfig}
                  style={{ padding: '11px 32px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${C.violet}, ${C.cyan})`, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  {salvandoConfig ? 'Salvando...' : '💾 Salvar Configuração'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
