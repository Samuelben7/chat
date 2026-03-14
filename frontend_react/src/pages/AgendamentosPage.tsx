import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { agendamentosApi, agendaLembretesApi } from '../services/api';

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
  mensagem_interativa?: any;
  mensagem_interativa_nome?: string;
  template_nome?: string;
  template_idioma?: string;
  template_componentes?: any[];
  ativo?: boolean;
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
  const [lembreteConfig, setLembreteConfig] = useState<LembreteConfig>({});
  const [salvandoConfig, setSalvandoConfig] = useState(false);

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

  const carregarConfig = async () => {
    try {
      const data = await agendaLembretesApi.getConfig();
      setLembreteConfig(data);
    } catch { /* */ }
  };

  useEffect(() => {
    if (abaPainel === 'lembrete') carregarConfig();
  }, [abaPainel]);

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
          <div style={{ ...GLASS, padding: 28 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>⏰ Configurar Lembrete Automático</h2>
            <p style={{ margin: '0 0 24px', color: C.textSec, fontSize: 13 }}>
              Enviado automaticamente 1 dia antes do agendamento às 10h.
              Se o cliente estiver na janela de 24h, usa mensagem interativa; caso contrário, usa template aprovado da Meta.
            </p>

            {/* Mensagem Interativa (janela 24h) */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.cyan, marginBottom: 8 }}>
                📱 Mensagem Interativa (janela 24h aberta)
              </div>
              <div style={{ fontSize: 12, color: C.textSec, marginBottom: 8 }}>
                Payload JSON da mensagem interativa (type, body, action...). Deixe vazio para não usar.
              </div>
              <input
                placeholder="Nome da mensagem (ex: Lembrete de consulta)"
                value={lembreteConfig.mensagem_interativa_nome || ''}
                onChange={e => setLembreteConfig(p => ({ ...p, mensagem_interativa_nome: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }}
              />
              <textarea
                rows={5}
                placeholder={'{\n  "type": "text",\n  "text": {"body": "Olá {nome_cliente}, lembrando seu agendamento amanhã às {hora_agendamento}!"}\n}'}
                value={lembreteConfig.mensagem_interativa ? JSON.stringify(lembreteConfig.mensagem_interativa, null, 2) : ''}
                onChange={e => {
                  try { setLembreteConfig(p => ({ ...p, mensagem_interativa: JSON.parse(e.target.value) })); }
                  catch { /* JSON inválido ainda sendo editado */ }
                }}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            {/* Template Meta (fora da janela) */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.amber, marginBottom: 8 }}>
                📨 Template Aprovado (fora da janela 24h)
              </div>
              <div style={{ fontSize: 12, color: C.textSec, marginBottom: 12 }}>
                Parâmetros disponíveis: {'{nome_cliente}'}, {'{hora_agendamento}'}, {'{data_agendamento}'}, {'{especialidade}'}, {'{valor}'}, {'{campo_custom:X}'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.textSec, display: 'block', marginBottom: 4 }}>Nome do template</label>
                  <input
                    placeholder="ex: lembrete_agendamento"
                    value={lembreteConfig.template_nome || ''}
                    onChange={e => setLembreteConfig(p => ({ ...p, template_nome: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: C.textSec, display: 'block', marginBottom: 4 }}>Idioma</label>
                  <input
                    placeholder="pt_BR"
                    value={lembreteConfig.template_idioma || 'pt_BR'}
                    onChange={e => setLembreteConfig(p => ({ ...p, template_idioma: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.textSec, display: 'block', marginBottom: 4 }}>
                  Componentes (JSON) — parâmetros serão substituídos automaticamente
                </label>
                <textarea
                  rows={6}
                  placeholder={`[\n  {\n    "type": "body",\n    "parameters": [\n      {"type": "text", "text": "{nome_cliente}"},\n      {"type": "text", "text": "{hora_agendamento}"}\n    ]\n  }\n]`}
                  value={lembreteConfig.template_componentes ? JSON.stringify(lembreteConfig.template_componentes, null, 2) : ''}
                  onChange={e => {
                    try { setLembreteConfig(p => ({ ...p, template_componentes: JSON.parse(e.target.value) })); }
                    catch { /* ainda editando */ }
                  }}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <button
              onClick={salvarConfig}
              disabled={salvandoConfig}
              style={{ padding: '10px 28px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${C.violet}, ${C.cyan})`, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              {salvandoConfig ? 'Salvando...' : '💾 Salvar Configuração'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
