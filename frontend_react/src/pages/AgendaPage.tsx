import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggle from '../components/ThemeToggle/ThemeToggle';
import api from '../services/api';

// ─── Design System (igual ao DashboardEmpresa) ───────────────────────────────

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
@keyframes agendaFadeIn {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes slidePanel {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}
.agenda-page { animation: agendaFadeIn 0.4s ease; }
.agenda-kpi  { transition: transform 0.2s ease, box-shadow 0.2s ease; }
.agenda-kpi:hover { transform: translateY(-4px); box-shadow: 0 16px 40px rgba(139,92,246,0.15) !important; }
.agenda-day  { transition: all 0.18s ease; }
.agenda-day:hover { transform: translateY(-3px) scale(1.04); }
.agenda-panel { animation: slidePanel 0.25s ease; }
`;

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DiaCalendario {
  data: string;
  dia_semana: number;
  total_slots: number;
  disponiveis: number;
  ocupados: number;
}

interface Slot {
  id: number;
  hora_inicio: string;
  hora_fim: string;
  vagas_total: number;
  vagas_ocupadas: number;
  vagas_livres: number;
  status: string;
  agendamentos: { id: number; nome_cliente?: string; whatsapp_number: string; status: string }[];
}

interface Horario {
  id: number;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  intervalo_minutos: number;
  vagas_por_slot: number;
  ativo: boolean;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_LONGO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function timeToMin(h: string) { const [hh, mm] = h.split(':').map(Number); return hh * 60 + mm; }
function minToTime(m: number) { return `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`; }

function gerarHorasDoHorario(h: Horario) {
  const slots: { hora: string; horaFim: string; vagas: number }[] = [];
  let cur = timeToMin(h.hora_inicio);
  const fim = timeToMin(h.hora_fim);
  const iv = h.intervalo_minutos || 60;
  while (cur + iv <= fim) {
    slots.push({ hora: minToTime(cur), horaFim: minToTime(cur + iv), vagas: h.vagas_por_slot || 1 });
    cur += iv;
  }
  return slots;
}

// ─── Componente ───────────────────────────────────────────────────────────────

const AgendaPage: React.FC = () => {
  const navigate = useNavigate();
  const { colors, theme } = useTheme();
  const dark = theme === 'yoursystem';

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [mes, setMes] = useState(today.getMonth() + 1);
  const [ano, setAno] = useState(today.getFullYear());
  const [dias, setDias] = useState<DiaCalendario[]>([]);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [slotsDodia, setSlotsDodia] = useState<Slot[]>([]);
  const [loadingCal, setLoadingCal] = useState(false);
  const [loadingDia, setLoadingDia] = useState(false);
  const [ativandoDia, setAtivandoDia] = useState(false);
  const [salvandoSlot, setSalvandoSlot] = useState<number | null>(null);

  // ── Modal Configuração de Horários ──
  const [modalConfig, setModalConfig] = useState(false);
  const [todosHorarios, setTodosHorarios] = useState<Horario[]>([]);
  const [formDia, setFormDia] = useState<number | null>(null); // dia_semana em edição
  const [formEdit, setFormEdit] = useState<Horario | null>(null); // horario em edição
  const [formValores, setFormValores] = useState({ hora_inicio: '08:00', hora_fim: '18:00', intervalo_minutos: 60, vagas_por_slot: 1 });
  const [salvandoHorario, setSalvandoHorario] = useState(false);
  const [deletandoHorario, setDeletandoHorario] = useState<number | null>(null);
  const [modalSlot, setModalSlot] = useState<Slot | null>(null);
  const [removendoAg, setRemovendoAg] = useState<number | null>(null);

  // CSS injetado uma vez
  useEffect(() => {
    const id = 'agenda-space-css';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id; s.textContent = CSS_ANIM;
      document.head.appendChild(s);
    }
  }, []);

  // ─── Carregar dados ───────────────────────────────────────────────────────

  const carregarCal = useCallback(async () => {
    setLoadingCal(true);
    try {
      const { data } = await api.get(`/agenda/calendario?mes=${mes}&ano=${ano}`);
      setDias(data);
    } finally { setLoadingCal(false); }
  }, [mes, ano]);

  const carregarHorarios = useCallback(async () => {
    try {
      const { data } = await api.get('/agenda/horarios');
      setTodosHorarios(data);
      setHorarios(data.filter((h: Horario) => h.ativo));
    } catch { /* silent */ }
  }, []);

  const abrirFormDia = (diaSemana: number, horario?: Horario) => {
    setFormDia(diaSemana);
    setFormEdit(horario || null);
    setFormValores(horario
      ? { hora_inicio: horario.hora_inicio, hora_fim: horario.hora_fim, intervalo_minutos: horario.intervalo_minutos, vagas_por_slot: horario.vagas_por_slot }
      : { hora_inicio: '08:00', hora_fim: '18:00', intervalo_minutos: 60, vagas_por_slot: 1 }
    );
  };

  const salvarHorario = async () => {
    if (formDia === null) return;
    setSalvandoHorario(true);
    try {
      if (formEdit) {
        await api.put(`/agenda/horarios/${formEdit.id}`, { ...formValores, ativo: formEdit.ativo });
      } else {
        await api.post('/agenda/horarios', { dia_semana: formDia, ...formValores, ativo: true });
      }
      await carregarHorarios();
      setFormDia(null);
      setFormEdit(null);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Erro ao salvar horário');
    } finally {
      setSalvandoHorario(false);
    }
  };

  const deletarHorario = async (id: number) => {
    if (!window.confirm('Remover este horário de funcionamento?')) return;
    setDeletandoHorario(id);
    try {
      await api.delete(`/agenda/horarios/${id}`);
      await carregarHorarios();
      if (formEdit?.id === id) { setFormDia(null); setFormEdit(null); }
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Erro ao remover horário');
    } finally {
      setDeletandoHorario(null);
    }
  };

  const toggleAtivoHorario = async (h: Horario) => {
    try {
      await api.put(`/agenda/horarios/${h.id}`, { ativo: !h.ativo });
      await carregarHorarios();
    } catch { /* silent */ }
  };

  const carregarSlotsDodia = useCallback(async (data: string) => {
    setLoadingDia(true);
    try {
      const { data: d } = await api.get(`/agenda/slots?data=${data}`);
      setSlotsDodia(d);
    } finally { setLoadingDia(false); }
  }, []);

  useEffect(() => { carregarCal(); }, [carregarCal]);
  useEffect(() => { carregarHorarios(); }, [carregarHorarios]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const navMes = (d: number) => {
    let nm = mes + d, na = ano;
    if (nm > 12) { nm = 1; na++; }
    if (nm < 1) { nm = 12; na--; }
    setMes(nm); setAno(na);
    setDiaSelecionado(null); setSlotsDodia([]);
  };

  const clicarDia = (dataStr: string, passado: boolean) => {
    if (passado) return;
    setDiaSelecionado(dataStr);
    carregarSlotsDodia(dataStr);
  };

  const isDiaAtivo = diaSelecionado
    ? (dias.find(d => d.data === diaSelecionado)?.total_slots || 0) > 0 || slotsDodia.length > 0
    : false;

  const toggleDia = async () => {
    if (!diaSelecionado || ativandoDia) return;
    setAtivandoDia(true);
    try {
      if (isDiaAtivo) {
        // Desativar: remover todos os slots do dia
        await api.delete(`/agenda/slots?data=${diaSelecionado}`);
        setSlotsDodia([]);
      } else {
        // Ativar: gerar slots com base nos horários configurados
        await api.post('/agenda/slots/gerar', {
          data_inicio: diaSelecionado,
          data_fim: diaSelecionado,
        });
        await carregarSlotsDodia(diaSelecionado);
      }
      await carregarCal();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Erro ao alterar dia');
    } finally {
      setAtivandoDia(false);
    }
  };

  const removerAgendamento = async (agId: number, nome: string) => {
    if (!window.confirm(`Remover o agendamento de "${nome}"?\nO horário será liberado.`)) return;
    setRemovendoAg(agId);
    try {
      await api.patch(`/agenda/agendamentos/${agId}`, { status: 'cancelado' });
      if (diaSelecionado) await carregarSlotsDodia(diaSelecionado);
      await carregarCal();
      // Atualizar o modal com dados frescos
      if (modalSlot && diaSelecionado) {
        const { data } = await api.get(`/agenda/slots?data=${diaSelecionado}`);
        const slotAtualizado = data.find((s: Slot) => s.id === modalSlot.id);
        setModalSlot(slotAtualizado || null);
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Erro ao remover agendamento');
    } finally {
      setRemovendoAg(null);
    }
  };

  const alterarVagas = async (slot: Slot, delta: number) => {
    const novas = slot.vagas_total + delta;
    if (novas < 1) return;
    if (novas < slot.vagas_ocupadas) return; // não pode ser menor que agendados
    setSalvandoSlot(slot.id);
    try {
      await api.patch(`/agenda/slots/${slot.id}`, { vagas_total: novas });
      if (diaSelecionado) await carregarSlotsDodia(diaSelecionado);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Erro ao atualizar vagas');
    } finally {
      setSalvandoSlot(null);
    }
  };

  // ─── Computados ───────────────────────────────────────────────────────────

  const primeiroDia = new Date(ano, mes - 1, 1).getDay();
  const diasNoMes = new Date(ano, mes, 0).getDate();

  const totalDisponiveis = dias.reduce((a, d) => a + (d.disponiveis || 0), 0);
  const totalAgendados = dias.reduce((a, d) => a + (d.ocupados || 0), 0);
  const diasAtivos = dias.filter(d => d.total_slots > 0).length;

  const horarioDia = (() => {
    if (!diaSelecionado) return null;
    const ds = new Date(diaSelecionado + 'T12:00:00').getDay();
    return horarios.find(h => h.dia_semana === ds) || null;
  })();

  const horasEsperadas = horarioDia ? gerarHorasDoHorario(horarioDia) : [];

  const nomeDiaSel = (() => {
    if (!diaSelecionado) return '';
    const d = new Date(diaSelecionado + 'T12:00:00');
    return `${DIAS_LONGO[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  })();

  // ─── Estilos adaptativos (dark/light) ─────────────────────────────────────

  const card = (accent: string): React.CSSProperties => dark
    ? { ...GLASS, background: `linear-gradient(135deg, ${accent}14 0%, ${accent}07 100%)`, border: `1px solid ${accent}28`, padding: '18px 20px' }
    : { background: colors.cardBg, border: `1px solid ${colors.border}`, borderLeft: `3px solid ${accent}`, borderRadius: '12px', padding: '18px 20px', boxShadow: colors.cardShadow };

  const mainBg = dark ? C.bg : colors.dashboardBg;
  const cardBase = dark ? GLASS : { background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '16px', boxShadow: colors.cardShadow };
  const txt = dark ? C.text : colors.textPrimary;
  const txtSec = dark ? C.textSec : colors.textSecondary;
  const txtMuted = dark ? C.textMuted : colors.textSecondary;
  const accent = dark ? C.violet : '#25D366';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="agenda-page" style={{ minHeight: '100vh', background: mainBg, padding: '24px 28px' }}>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: dark ? 'rgba(255,255,255,0.06)' : colors.inputBg, border: `1px solid ${dark ? C.border : colors.border}`, color: txt, borderRadius: 10, width: 38, height: 38, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}
            title="Voltar"
          >‹</button>
          <div>
            <h1 style={{ color: txt, fontSize: 24, fontWeight: 800, margin: 0 }}>Agenda</h1>
            <p style={{ color: txtSec, fontSize: 13, marginTop: 4 }}>
              Controle de disponibilidade e agendamentos
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => { setModalConfig(true); setFormDia(null); setFormEdit(null); }}
            title="Configurar horários de funcionamento"
            style={{ background: dark ? 'rgba(139,92,246,0.15)' : '#f3f4f6', border: `1px solid ${dark ? 'rgba(139,92,246,0.4)' : '#e5e7eb'}`, color: dark ? C.violet : '#6b7280', borderRadius: 10, width: 38, height: 38, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}
          >⚙</button>
          <ThemeToggle />
        </div>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Vagas disponíveis', value: totalDisponiveis, sub: `neste mês`, icon: '🎯', color: dark ? C.violet : '#25D366' },
          { label: 'Agendamentos',      value: totalAgendados,   sub: 'confirmados',  icon: '📝', color: dark ? C.amber  : '#f59e0b' },
          { label: 'Dias ativos',       value: diasAtivos,       sub: `em ${MESES[mes-1]}`, icon: '📅', color: dark ? C.cyan  : '#3b82f6' },
        ].map((k, i) => (
          <div key={i} className="agenda-kpi" style={card(k.color)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: txtMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>{k.label}</span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg,${k.color}30,${k.color}12)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{k.icon}</div>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: txtMuted, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Layout (calendário + painel) ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: diaSelecionado ? '1fr 360px' : '1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Calendário ──────────────────────────────────────────────── */}
        <div style={{ ...cardBase, padding: 24 }}>

          {/* Navegação */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <button
              onClick={() => navMes(-1)}
              style={{ background: dark ? 'rgba(255,255,255,0.06)' : colors.inputBg, border: `1px solid ${dark ? C.border : colors.border}`, color: txt, borderRadius: 10, width: 38, height: 38, cursor: 'pointer', fontSize: 18, transition: 'all .15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.12)' : colors.border)}
              onMouseLeave={e => (e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.06)' : colors.inputBg)}
            >‹</button>

            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: txt, fontSize: 17, fontWeight: 700, margin: 0 }}>
                {MESES[mes - 1].toUpperCase()} {ano}
              </h2>
              {loadingCal && <span style={{ color: txtMuted, fontSize: 11 }}>Carregando...</span>}
            </div>

            <button
              onClick={() => navMes(1)}
              style={{ background: dark ? 'rgba(255,255,255,0.06)' : colors.inputBg, border: `1px solid ${dark ? C.border : colors.border}`, color: txt, borderRadius: 10, width: 38, height: 38, cursor: 'pointer', fontSize: 18, transition: 'all .15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.12)' : colors.border)}
              onMouseLeave={e => (e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.06)' : colors.inputBg)}
            >›</button>
          </div>

          {/* Cabeçalho dias */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 8 }}>
            {DIAS_CURTO.map((d, i) => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: i === 0 ? '#ef4444' : txtMuted, letterSpacing: '.05em', padding: '4px 0' }}>{d}</div>
            ))}
          </div>

          {/* Grade de dias */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
            {Array.from({ length: primeiroDia }).map((_, i) => <div key={`v${i}`} />)}

            {Array.from({ length: diasNoMes }).map((_, i) => {
              const dia = i + 1;
              const ds = `${ano}-${pad(mes)}-${pad(dia)}`;
              const info = dias.find(d => d.data === ds);
              const isToday = ds === todayStr;
              const isPast = ds < todayStr;
              const isSel = ds === diaSelecionado;
              const ativo = (info?.total_slots || 0) > 0;
              const diaSemJs = new Date(ds + 'T12:00:00').getDay();
              const temHorario = horarios.some(h => h.dia_semana === diaSemJs);

              // Cor do dia
              let bg = 'transparent', borderColor = 'transparent', numColor = txtSec;
              if (isSel) {
                bg = dark ? `${accent}22` : `${accent}18`;
                borderColor = accent;
                numColor = accent;
              } else if (isToday) {
                bg = dark ? `${accent}14` : `${accent}12`;
                borderColor = accent;
                numColor = accent;
              } else if (ativo && !isPast) {
                bg = dark ? `${C.cyan}12` : '#e6fff3';
                borderColor = dark ? `${C.cyan}40` : '#25D36650';
                numColor = txt;
              }

              return (
                <div
                  key={ds}
                  className={!isPast ? 'agenda-day' : ''}
                  onClick={() => clicarDia(ds, isPast)}
                  style={{
                    borderRadius: 10,
                    padding: '10px 4px',
                    cursor: isPast ? 'default' : 'pointer',
                    opacity: isPast ? 0.3 : temHorario || ativo ? 1 : 0.5,
                    background: bg,
                    border: `1px solid ${borderColor}`,
                    minHeight: 64,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    boxShadow: isSel ? `0 4px 16px ${accent}33` : 'none',
                  }}
                >
                  <span style={{ fontSize: isSel || isToday ? 17 : 14, fontWeight: isSel || isToday ? 800 : 500, color: numColor, lineHeight: 1 }}>{dia}</span>

                  {ativo && !isPast && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: dark ? C.cyan : '#25D366', background: dark ? `${C.cyan}18` : '#e6fff3', borderRadius: 20, padding: '2px 6px' }}>
                      {info!.disponiveis}v
                    </span>
                  )}

                  {!isPast && info && info.ocupados > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: dark ? C.amber : '#b45309', background: dark ? `${C.amber}20` : '#fef3c7', borderRadius: 20, padding: '2px 6px' }}>
                      +{info.ocupados}
                    </span>
                  )}

                  {isToday && (
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: accent, display: 'block' }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Legenda */}
          <div style={{ display: 'flex', gap: 16, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${dark ? C.border : colors.border}`, flexWrap: 'wrap' }}>
            {[
              { cor: accent, label: 'Hoje / Selecionado' },
              { cor: dark ? C.cyan : '#25D366', label: 'Dia ativo (com horários)' },
              { cor: txtMuted, label: 'Sem configuração' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.cor, display: 'inline-block' }} />
                <span style={{ color: txtMuted, fontSize: 11 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Painel do dia selecionado ───────────────────────────────── */}
        {diaSelecionado && (
          <div className="agenda-panel" style={{ ...cardBase, overflow: 'hidden' }}>

            {/* Header do painel */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${dark ? C.border : colors.border}`, background: dark ? `${accent}0A` : `${accent}08` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ color: txtSec, fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                    {diaSelecionado}
                  </p>
                  <h3 style={{ color: txt, fontSize: 14, fontWeight: 700, margin: '4px 0 0' }}>{nomeDiaSel}</h3>
                  {horarioDia && (
                    <p style={{ color: txtMuted, fontSize: 11, margin: '2px 0 0' }}>
                      {horarioDia.hora_inicio}–{horarioDia.hora_fim} · {horasEsperadas.length} horários
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { setDiaSelecionado(null); setSlotsDodia([]); }}
                  style={{ background: 'transparent', border: 'none', color: txtSec, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}
                >×</button>
              </div>

              {/* Toggle ativo/inativo */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, padding: '10px 14px', borderRadius: 10, background: dark ? 'rgba(255,255,255,0.04)' : colors.inputBg, border: `1px solid ${dark ? C.border : colors.border}` }}>
                <div>
                  <p style={{ color: txt, fontSize: 13, fontWeight: 600, margin: 0 }}>
                    {isDiaAtivo ? '✅ Dia ativo' : '⭕ Dia inativo'}
                  </p>
                  <p style={{ color: txtMuted, fontSize: 11, margin: '2px 0 0' }}>
                    {!horarioDia && !isDiaAtivo
                      ? 'Configure os horários de funcionamento primeiro'
                      : isDiaAtivo ? 'Aceita agendamentos' : 'Não aparece para clientes'}
                  </p>
                </div>
                <button
                  onClick={toggleDia}
                  disabled={ativandoDia || (!horarioDia && !isDiaAtivo)}
                  title={!horarioDia && !isDiaAtivo ? 'Configure os horários de funcionamento primeiro' : undefined}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none',
                    cursor: ativandoDia || (!horarioDia && !isDiaAtivo) ? 'not-allowed' : 'pointer',
                    background: isDiaAtivo ? accent : (dark ? 'rgba(255,255,255,0.12)' : '#ccc'),
                    position: 'relative', transition: 'background .3s',
                    opacity: ativandoDia || (!horarioDia && !isDiaAtivo) ? 0.4 : 1,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3,
                    left: isDiaAtivo ? '22px' : '3px',
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#fff', transition: 'left .3s',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                    display: 'block',
                  }} />
                </button>
              </div>
            </div>

            {/* Lista de horários + vagas */}
            <div style={{ padding: '14px 20px', maxHeight: 500, overflowY: 'auto' }}>

              {loadingDia ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: txtMuted, fontSize: 13 }}>
                  Carregando horários...
                </div>
              ) : !horarioDia ? (
                <div style={{ textAlign: 'center', padding: '28px 16px', color: txtSec, fontSize: 13, background: dark ? 'rgba(255,255,255,0.02)' : colors.inputBg, borderRadius: 10 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🚫</div>
                  <p style={{ margin: 0, fontWeight: 600 }}>Sem horário configurado para este dia.</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: txtMuted }}>Configure em Configurações → Agenda.</p>
                </div>
              ) : !isDiaAtivo ? (
                <div style={{ textAlign: 'center', padding: '28px 16px', color: txtMuted, fontSize: 13 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📴</div>
                  <p style={{ margin: 0 }}>Dia inativo. Ative o toggle acima para liberar horários.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ color: txtMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 4px' }}>
                    Horários e vagas
                  </p>

                  {horasEsperadas.map(({ hora, horaFim }) => {
                    const slot = slotsDodia.find(s => s.hora_inicio === hora);
                    if (!slot) return null; // slot não criado (dia foi ativado mas hora específica não existe)

                    const isSaving = salvandoSlot === slot.id;
                    const pct = slot.vagas_total > 0 ? (slot.vagas_ocupadas / slot.vagas_total) * 100 : 0;
                    const lotado = slot.vagas_ocupadas >= slot.vagas_total;

                    return (
                      <div key={hora} style={{
                        padding: '12px 14px', borderRadius: 10,
                        background: dark ? `${accent}0A` : `${accent}08`,
                        border: `1px solid ${dark ? `${accent}25` : `${accent}30`}`,
                      }}>
                        {/* Linha principal: hora + controle de vagas */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ minWidth: 90 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>{hora}</span>
                            <span style={{ color: txtMuted, fontSize: 11 }}> – {horaFim}</span>
                          </div>

                          {/* Barra de ocupação */}
                          <div style={{ flex: 1, height: 5, borderRadius: 3, background: dark ? 'rgba(255,255,255,0.08)' : '#e5e7eb', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: lotado ? '#ef4444' : accent, borderRadius: 3, transition: 'width .3s' }} />
                          </div>

                          {/* Controle +/- vagas */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={() => alterarVagas(slot, -1)}
                              disabled={isSaving || slot.vagas_total <= slot.vagas_ocupadas || slot.vagas_total <= 1}
                              style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${dark ? C.border : colors.border}`, background: dark ? 'rgba(255,255,255,0.06)' : colors.inputBg, color: txt, cursor: 'pointer', fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: slot.vagas_total <= 1 ? 0.3 : 1 }}
                            >−</button>

                            <span style={{ minWidth: 24, textAlign: 'center', fontSize: 13, fontWeight: 700, color: lotado ? '#ef4444' : txt }}>
                              {isSaving ? '…' : slot.vagas_total}
                            </span>

                            <button
                              onClick={() => alterarVagas(slot, +1)}
                              disabled={isSaving}
                              style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${dark ? C.border : colors.border}`, background: dark ? 'rgba(255,255,255,0.06)' : colors.inputBg, color: txt, cursor: 'pointer', fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >+</button>

                            <span style={{ fontSize: 11, color: txtMuted, whiteSpace: 'nowrap' }}>
                              {slot.vagas_ocupadas}/{slot.vagas_total}
                            </span>
                          </div>
                        </div>

                        {/* Agendamentos do slot — pills + "+N" */}
                        {slot.agendamentos && slot.agendamentos.length > 0 && (
                          <div
                            style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : colors.border}`, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', cursor: 'pointer' }}
                            onClick={() => setModalSlot(slot)}
                          >
                            {slot.agendamentos.slice(0, 2).map(ag => (
                              <span key={ag.id} style={{ fontSize: 12, fontWeight: 600, color: dark ? C.emerald : '#059669', background: dark ? 'rgba(16,185,129,0.12)' : '#d1fae5', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                                {ag.nome_cliente || ag.whatsapp_number}
                              </span>
                            ))}
                            {slot.agendamentos.length > 2 && (
                              <span style={{ fontSize: 12, fontWeight: 700, color: dark ? C.amber : '#d97706', background: dark ? 'rgba(245,158,11,0.12)' : '#fef3c7', borderRadius: 20, padding: '3px 10px' }}>
                                +{slot.agendamentos.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Rodapé com resumo */}
            {isDiaAtivo && slotsDodia.length > 0 && (
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${dark ? C.border : colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: txtMuted, fontSize: 12 }}>
                  {slotsDodia.reduce((a, s) => a + s.vagas_livres, 0)} vagas livres
                </span>
                <span style={{ color: dark ? C.amber : '#f59e0b', fontSize: 12, fontWeight: 600 }}>
                  {slotsDodia.reduce((a, s) => a + s.vagas_ocupadas, 0)} agendamentos
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal Configuração de Horários ─────────────────────────────── */}
      {modalConfig && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => { setModalConfig(false); setFormDia(null); }}
        >
          <div
            style={{
              ...(dark
                ? { background: 'rgba(13,13,22,0.98)', border: '1px solid rgba(139,92,246,0.25)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }
                : { background: colors.cardBg, border: `1px solid ${colors.border}`, boxShadow: colors.cardShadow }),
              borderRadius: '1.25rem',
              width: '100%',
              maxWidth: 560,
              height: 'min(92vh, 680px)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${dark ? 'rgba(139,92,246,0.2)' : colors.border}`, background: dark ? 'rgba(139,92,246,0.08)' : `${accent}08`, borderRadius: '1.25rem 1.25rem 0 0', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ color: txt, fontSize: 16, fontWeight: 800, margin: 0 }}>⚙ Horários de Funcionamento</h2>
                <p style={{ color: txtMuted, fontSize: 12, margin: '3px 0 0' }}>Configure os dias e horários que sua agenda aceita agendamentos.</p>
              </div>
              <button onClick={() => { setModalConfig(false); setFormDia(null); }} style={{ background: 'transparent', border: 'none', color: txtSec, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
            </div>

            {/* Lista de dias — scroll isolado */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 20px 20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[0,1,2,3,4,5,6].map(ds => {
                  const horario = todosHorarios.find(h => h.dia_semana === ds);
                  const editandoEste = formDia === ds;
                  const isDeleting = horario ? deletandoHorario === horario.id : false;
                  const borda = dark
                    ? (editandoEste ? 'rgba(139,92,246,0.45)' : 'rgba(255,255,255,0.08)')
                    : (editandoEste ? `${accent}50` : colors.border);
                  const bg = dark
                    ? (editandoEste ? 'rgba(139,92,246,0.09)' : 'rgba(255,255,255,0.025)')
                    : (editandoEste ? `${accent}07` : colors.inputBg);

                  return (
                    <div key={ds} style={{ borderRadius: 12, border: `1px solid ${borda}`, background: bg, transition: 'border-color .2s, background .2s' }}>

                      {/* Linha principal do dia */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
                        <div style={{ minWidth: 96 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: horario?.ativo ? (dark ? C.violet : accent) : txt }}>{DIAS_LONGO[ds]}</span>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          {horario ? (
                            <span style={{ fontSize: 12, color: horario.ativo ? (dark ? C.cyan : '#059669') : txtMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {horario.hora_inicio}–{horario.hora_fim} · {horario.intervalo_minutos}min · {horario.vagas_por_slot}v
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: txtMuted, fontStyle: 'italic' }}>Não configurado</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                          {horario && (
                            <button
                              onClick={() => toggleAtivoHorario(horario)}
                              title={horario.ativo ? 'Desativar' : 'Ativar'}
                              style={{ width: 34, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: horario.ativo ? (dark ? C.violet : accent) : (dark ? 'rgba(255,255,255,0.15)' : '#ccc'), position: 'relative', transition: 'background .25s', flexShrink: 0 }}
                            >
                              <span style={{ position: 'absolute', top: 2, left: horario.ativo ? '16px' : '2px', width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .25s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                            </button>
                          )}
                          <button
                            onClick={() => editandoEste ? setFormDia(null) : abrirFormDia(ds, horario)}
                            style={{ padding: '4px 10px', borderRadius: 7, border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : colors.border}`, background: editandoEste ? (dark ? 'rgba(139,92,246,0.2)' : `${accent}15`) : 'transparent', color: editandoEste ? (dark ? C.violet : accent) : txtSec, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                          >{editandoEste ? 'Cancelar' : horario ? 'Editar' : '+ Adicionar'}</button>
                          {horario && !editandoEste && (
                            <button
                              onClick={() => deletarHorario(horario.id)}
                              disabled={isDeleting}
                              style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${dark ? 'rgba(239,68,68,0.3)' : '#fca5a5'}`, background: dark ? 'rgba(239,68,68,0.08)' : '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isDeleting ? 0.5 : 1 }}
                            >{isDeleting ? '…' : '×'}</button>
                          )}
                        </div>
                      </div>

                      {/* Formulário expansível */}
                      {editandoEste && (
                        <div style={{ borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : colors.border}`, padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {(['hora_inicio', 'hora_fim'] as const).map(key => (
                              <div key={key}>
                                <label style={{ display: 'block', color: txtMuted, fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>{key === 'hora_inicio' ? 'Início' : 'Fim'}</label>
                                <input
                                  type="time"
                                  value={formValores[key]}
                                  onChange={e => setFormValores(v => ({ ...v, [key]: e.target.value }))}
                                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${dark ? 'rgba(255,255,255,0.14)' : colors.border}`, background: dark ? 'rgba(255,255,255,0.06)' : '#fff', color: txt, fontSize: 13, boxSizing: 'border-box' }}
                                />
                              </div>
                            ))}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                              <label style={{ display: 'block', color: txtMuted, fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Intervalo</label>
                              <select
                                value={formValores.intervalo_minutos}
                                onChange={e => setFormValores(v => ({ ...v, intervalo_minutos: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${dark ? 'rgba(255,255,255,0.14)' : colors.border}`, background: dark ? 'rgba(255,255,255,0.06)' : '#fff', color: txt, fontSize: 13, boxSizing: 'border-box' }}
                              >
                                {[15,20,30,45,60,90,120].map(v => <option key={v} value={v}>{v} min</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', color: txtMuted, fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Vagas/Slot</label>
                              <input
                                type="number" min={1} max={50}
                                value={formValores.vagas_por_slot}
                                onChange={e => setFormValores(v => ({ ...v, vagas_por_slot: Math.max(1, Number(e.target.value)) }))}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${dark ? 'rgba(255,255,255,0.14)' : colors.border}`, background: dark ? 'rgba(255,255,255,0.06)' : '#fff', color: txt, fontSize: 13, boxSizing: 'border-box' }}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              onClick={salvarHorario}
                              disabled={salvandoHorario}
                              style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: dark ? C.violet : accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: salvandoHorario ? 'wait' : 'pointer', opacity: salvandoHorario ? 0.7 : 1 }}
                            >{salvandoHorario ? 'Salvando…' : formEdit ? '✓ Salvar alterações' : '✓ Criar horário'}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer com Concluir */}
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : colors.border}`, borderRadius: '0 0 1.25rem 1.25rem', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: dark ? 'rgba(255,255,255,0.02)' : colors.inputBg }}>
              <span style={{ color: txtMuted, fontSize: 12 }}>
                {todosHorarios.filter(h => h.ativo).length} de 7 dias ativos
              </span>
              <button
                onClick={() => { setModalConfig(false); setFormDia(null); carregarCal(); }}
                style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: dark ? C.violet : accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >✓ Concluir</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de agendamentos ──────────────────────────────────────── */}
      {modalSlot && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setModalSlot(null)}
        >
          <div
            style={{ ...(dark ? { background: 'rgba(18,18,28,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '1rem', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' } : { background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '1rem', boxShadow: colors.cardShadow }), width: '100%', maxWidth: 420, overflow: 'hidden', animation: 'slidePanel .2s ease' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header do modal */}
            <div style={{ padding: '18px 20px', borderBottom: `1px solid ${dark ? C.border : colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: dark ? `${accent}0A` : `${accent}08` }}>
              <div>
                <p style={{ color: txtMuted, fontSize: 11, margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Agendamentos</p>
                <h3 style={{ color: txt, fontSize: 15, fontWeight: 700, margin: '4px 0 0' }}>
                  {modalSlot.hora_inicio} – {modalSlot.hora_fim}
                </h3>
                <p style={{ color: txtSec, fontSize: 12, margin: '2px 0 0' }}>
                  {diaSelecionado} · {modalSlot.vagas_ocupadas}/{modalSlot.vagas_total} vagas ocupadas
                </p>
              </div>
              <button
                onClick={() => setModalSlot(null)}
                style={{ background: 'transparent', border: 'none', color: txtSec, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 0 }}
              >×</button>
            </div>

            {/* Lista com scroll */}
            <div style={{ maxHeight: 360, overflowY: 'auto', padding: '12px 20px' }}>
              {modalSlot.agendamentos.length === 0 ? (
                <p style={{ color: txtMuted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Nenhum agendamento.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {modalSlot.agendamentos.map((ag, idx) => {
                    const nomeExib = ag.nome_cliente || ag.whatsapp_number;
                    const isRemoving = removendoAg === ag.id;
                    return (
                      <div key={ag.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: dark ? 'rgba(255,255,255,0.03)' : colors.inputBg, border: `1px solid ${dark ? C.border : colors.border}`, opacity: isRemoving ? 0.5 : 1 }}>
                        {/* Avatar inicial */}
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${accent}40, ${dark ? C.cyan : '#25D366'}30)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: accent, flexShrink: 0 }}>
                          {nomeExib.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: txt, fontSize: 14, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {nomeExib}
                          </p>
                          <p style={{ color: txtMuted, fontSize: 11, margin: '2px 0 0' }}>
                            {modalSlot.hora_inicio} – {modalSlot.hora_fim} · #{idx + 1}
                          </p>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: dark ? C.emerald : '#059669', background: dark ? 'rgba(16,185,129,0.12)' : '#d1fae5', borderRadius: 20, padding: '3px 8px', flexShrink: 0 }}>
                          {ag.status}
                        </span>
                        {/* Botão remover */}
                        <button
                          onClick={() => removerAgendamento(ag.id, nomeExib)}
                          disabled={isRemoving}
                          title="Cancelar agendamento"
                          style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${dark ? 'rgba(239,68,68,0.3)' : '#fca5a5'}`, background: dark ? 'rgba(239,68,68,0.1)' : '#fef2f2', color: '#ef4444', cursor: isRemoving ? 'wait' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = dark ? 'rgba(239,68,68,0.1)' : '#fef2f2'; e.currentTarget.style.color = '#ef4444'; }}
                        >
                          {isRemoving ? '…' : '×'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgendaPage;
