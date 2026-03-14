import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { iaBotChamadasApi } from '../services/api';

const CONTEXTO_DEMO = `Você é a assistente virtual de uma clínica odontológica.

PROCEDIMENTOS E VALORES:
- Consulta inicial / avaliação: R$ 100 – R$ 250
- Limpeza / profilaxia: R$ 150 – R$ 300
- Restauração simples: R$ 150 – R$ 400
- Clareamento dental (consultório): R$ 600 – R$ 1.500
- Faceta de resina (por dente): R$ 300 – R$ 800
- Faceta de porcelana (por dente): R$ 1.200 – R$ 3.000+
- Tratamento de canal: R$ 600 – R$ 1.500
- Extração simples: R$ 100 – R$ 400
- Extração de siso: R$ 400 – R$ 1.000
- Implante dentário: R$ 2.500 – R$ 6.000+
- Aparelho fixo metálico: R$ 1.500 – R$ 4.000+
- Alinhadores invisíveis: R$ 5.000 – R$ 12.000+
- Harmonização orofacial (botox): R$ 800 – R$ 2.500

PARCELAMENTO: Procedimentos acima de R$ 500 parcelamos em até 12x no cartão.

HORÁRIOS: Segunda a Sexta das 8h às 18h | Sábado das 8h às 12h

AGENDAMENTO: Para agendar, solicite nome completo, procedimento e horário preferido.`;

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0a0f',
  surface: '#111827',
  surfaceLight: 'rgba(255,255,255,0.05)',
  text: '#f4f4f5',
  textSec: '#a1a1aa',
  textMuted: '#71717a',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  emerald: '#10b981',
  border: 'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.12)',
};

const glass: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: C.textMuted, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6,
};

const inputDark: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '10px 14px',
  color: C.text,
  fontSize: 13,
  width: '100%',
  outline: 'none',
  transition: 'border-color 0.2s',
};

const IAConfigPage: React.FC = () => {
  const navigate = useNavigate();

  const [config, setConfig] = useState({
    ia_ativa: false,
    ia_contexto: '',
    ia_delay_min: 7,
    ia_delay_max: 10,
    ia_nome_assistente: 'Assistente',
  });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  // Bot Chamadas
  const [botChamadas, setBotChamadas] = useState<any[]>([]);
  const [fluxosBot, setFluxosBot] = useState<any[]>([]);
  const [novaChamada, setNovaChamada] = useState({ nome: '', gatilho: 'agendamento', bot_fluxo_id: '', descricao_campos: '' });
  const [criandoChamada, setCriandoChamada] = useState(false);
  const [mostrarFormChamada, setMostrarFormChamada] = useState(false);

  useEffect(() => {
    api.get('/auth/empresa/ia-config')
      .then(r => setConfig(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
    iaBotChamadasApi.listar().then(setBotChamadas).catch(() => {});
    api.get('/bot-builder/fluxos').then(r => setFluxosBot(r.data || [])).catch(() => {});
  }, []);

  const criarChamada = async () => {
    if (!novaChamada.nome || !novaChamada.bot_fluxo_id) return;
    setCriandoChamada(true);
    try {
      await iaBotChamadasApi.criar({ ...novaChamada, bot_fluxo_id: parseInt(novaChamada.bot_fluxo_id) });
      const lista = await iaBotChamadasApi.listar();
      setBotChamadas(lista);
      setNovaChamada({ nome: '', gatilho: 'agendamento', bot_fluxo_id: '', descricao_campos: '' });
      setMostrarFormChamada(false);
    } catch { /* */ }
    setCriandoChamada(false);
  };

  const deletarChamada = async (id: number) => {
    await iaBotChamadasApi.deletar(id);
    setBotChamadas(p => p.filter(c => c.id !== id));
  };

  const salvar = async () => {
    setSalvando(true);
    setSalvo(false);
    try {
      await api.patch('/auth/empresa/ia-config', config);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 3000);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg }}>
      <div style={{ color: C.textSec, fontSize: 14 }}>Carregando...</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, system-ui, sans-serif', position: 'relative', overflow: 'hidden' }}>

      {/* Animated background orbs */}
      <style>{`
        @keyframes ia-orb-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 15px) scale(0.95); }
        }
        .ia-orb {
          position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; opacity: 0.12;
        }
        .ia-input:focus {
          border-color: ${C.violet}60 !important;
          box-shadow: 0 0 0 2px ${C.violet}15;
        }
      `}</style>
      <div className="ia-orb" style={{ width: 400, height: 400, top: -100, right: -80, background: C.violet, animation: 'ia-orb-float 20s ease-in-out infinite' }} />
      <div className="ia-orb" style={{ width: 300, height: 300, bottom: -60, left: -60, background: C.cyan, animation: 'ia-orb-float 25s ease-in-out infinite reverse' }} />

      {/* Header */}
      <div style={{
        padding: '20px 28px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 16,
        background: 'rgba(17,24,39,0.8)',
        backdropFilter: 'blur(12px)',
        position: 'relative', zIndex: 2,
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '8px 14px', color: C.textSec,
          cursor: 'pointer', fontSize: 16, transition: 'all 0.2s',
        }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, background: `linear-gradient(135deg, ${C.violet}, ${C.cyan})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Agente de IA
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textMuted }}>
            Configure o assistente virtual inteligente para atender seus clientes
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 24, position: 'relative', zIndex: 2 }}>

        {/* Toggle principal */}
        <div style={{
          ...glass,
          border: config.ia_ativa ? `1px solid ${C.violet}35` : `1px solid ${C.border}`,
          padding: 24,
          background: config.ia_ativa
            ? `linear-gradient(135deg, ${C.violet}10 0%, ${C.cyan}06 100%)`
            : glass.background,
          transition: 'all 0.4s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: config.ia_ativa ? C.emerald : C.textMuted,
                  boxShadow: config.ia_ativa ? `0 0 8px ${C.emerald}80` : 'none',
                  transition: 'all 0.3s',
                }} />
                {config.ia_ativa ? 'Agente IA Ativo' : 'Agente IA Inativo'}
              </div>
              <div style={{ fontSize: 13, color: C.textSec }}>
                {config.ia_ativa
                  ? 'O assistente está respondendo automaticamente às mensagens'
                  : 'Ative para que a IA responda automaticamente às mensagens do WhatsApp'}
              </div>
            </div>
            {/* Toggle switch */}
            <div
              onClick={() => setConfig(p => ({ ...p, ia_ativa: !p.ia_ativa }))}
              style={{
                width: 52, height: 28, borderRadius: 14, cursor: 'pointer',
                background: config.ia_ativa ? `linear-gradient(135deg, ${C.violet}, ${C.cyan})` : 'rgba(255,255,255,0.12)',
                position: 'relative', transition: 'background 0.3s', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 3,
                left: config.ia_ativa ? 27 : 3,
                width: 22, height: 22, borderRadius: '50%',
                background: '#fff', transition: 'left 0.3s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </div>
          </div>
        </div>

        {/* Configurações — grid 2 colunas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ ...glass, padding: 20 }}>
            <label style={labelStyle}>Nome do Assistente</label>
            <input
              className="ia-input"
              style={inputDark}
              value={config.ia_nome_assistente}
              onChange={e => setConfig(p => ({ ...p, ia_nome_assistente: e.target.value }))}
              placeholder="Ex: Dra. Ana, Sofia, Carla..."
              maxLength={50}
            />
            <p style={{ fontSize: 11, color: C.textMuted, marginTop: 6, margin: '6px 0 0' }}>
              Como o assistente se apresentará aos clientes
            </p>
          </div>

          <div style={{ ...glass, padding: 20 }}>
            <label style={labelStyle}>Delay Médio (segundos)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="ia-input"
                style={{ ...inputDark, width: 90 }}
                type="number" min={2} max={60}
                value={config.ia_delay_min}
                onChange={e => setConfig(p => ({ ...p, ia_delay_min: Number(e.target.value) }))}
              />
              <span style={{ color: C.textMuted, fontSize: 12 }}>seg</span>
            </div>
            <p style={{ fontSize: 11, color: C.textMuted, marginTop: 6, margin: '6px 0 0' }}>
              A IA varia naturalmente em torno desse tempo
            </p>
          </div>
        </div>

        {/* Contexto do negócio */}
        <div style={{ ...glass, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Contexto e Instruções do Negócio</label>
              <p style={{ fontSize: 12, color: C.textSec, margin: '4px 0 0' }}>
                Descreva seu negócio, produtos, preços, horários e qualquer informação que a IA deve usar
              </p>
            </div>
            <button
              onClick={() => setConfig(p => ({ ...p, ia_contexto: CONTEXTO_DEMO }))}
              style={{
                background: `${C.violet}15`, color: C.violet,
                border: `1px solid ${C.violet}30`, borderRadius: 8,
                padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                whiteSpace: 'nowrap', transition: 'all 0.2s',
              }}
            >
              Usar exemplo
            </button>
          </div>
          <textarea
            className="ia-input"
            style={{ ...inputDark, minHeight: 320, resize: 'vertical', lineHeight: 1.6, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
            value={config.ia_contexto}
            onChange={e => setConfig(p => ({ ...p, ia_contexto: e.target.value }))}
            placeholder={`Cole aqui as instruções do seu negócio. Por exemplo:

Somos a Clínica Sorrir Bem, especializada em estética dental.

PROCEDIMENTOS:
- Limpeza: R$ 200
- Clareamento: R$ 800
...

HORÁRIOS: Segunda a Sexta, 8h às 18h

Instruções especiais para o assistente:
- Sempre perguntar o nome do paciente primeiro
- Oferecer consulta gratuita para novos pacientes`}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>
              {config.ia_contexto?.length || 0} caracteres
            </span>
            <span style={{ fontSize: 11, color: C.textMuted }}>
              Quanto mais detalhado, melhor a IA responde
            </span>
          </div>
        </div>

        {/* Info box */}
        <div style={{
          ...glass,
          background: `linear-gradient(135deg, ${C.violet}08 0%, ${C.cyan}05 100%)`,
          border: `1px solid ${C.violet}18`,
          padding: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: C.text }}>Como funciona</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: C.textSec, display: 'flex', flexDirection: 'column', gap: 6, lineHeight: 1.5 }}>
            <li>A IA usa inteligência artificial avançada para gerar respostas personalizadas</li>
            <li>As mensagens vão direto para a Meta — sem sobrecarga no seu servidor</li>
            <li>Quando um atendente humano clicar em <strong style={{ color: C.text }}>"Assumir"</strong> no chat, a IA pausa automaticamente nessa conversa</li>
            <li>Toda conversa fica salva no banco e aparece no chat normalmente</li>
            <li><strong style={{ color: C.violet }}>Bot automático e Agente IA são mutuamente exclusivos</strong> — quando a IA está ativa, o bot é ignorado automaticamente</li>
            <li>Você pode desativar o agente a qualquer momento com o botão acima</li>
          </ul>
        </div>

        {/* Botão salvar */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={salvar}
            disabled={salvando}
            style={{
              background: salvo
                ? `linear-gradient(135deg, ${C.emerald} 0%, #16a34a 100%)`
                : `linear-gradient(135deg, ${C.violet} 0%, ${C.cyan} 100%)`,
              color: '#fff', border: 'none', borderRadius: 12,
              padding: '12px 32px', cursor: salvando ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 700, opacity: salvando ? 0.7 : 1,
              transition: 'all 0.3s',
              boxShadow: salvo ? `0 4px 20px ${C.emerald}30` : `0 4px 20px ${C.violet}25`,
            }}
          >
            {salvando ? 'Salvando...' : salvo ? '✓ Configurações salvas!' : 'Salvar configurações'}
          </button>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'rgba(255,255,255,0.04)', color: C.textSec,
              border: `1px solid ${C.border}`, borderRadius: 12,
              padding: '12px 24px', cursor: 'pointer', fontSize: 14,
              transition: 'all 0.2s',
            }}
          >
            Cancelar
          </button>
        </div>

        {/* ── Seção Bot Chamadas ── */}
        <div style={{ ...glass, padding: 28, marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>🤖 Chamadas de Bot para Coleta de Dados</h2>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: C.textSec }}>
                A IA ativa um fluxo do Bot Builder para coletar dados estruturados (nome, CPF, etc.) sem risco de alucinação.
              </p>
            </div>
            <button onClick={() => setMostrarFormChamada(v => !v)}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              + Nova Chamada
            </button>
          </div>

          {mostrarFormChamada && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 16, marginBottom: 16, display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Nome da chamada</label>
                  <input style={inputDark} placeholder="Ex: Cadastro inicial" value={novaChamada.nome}
                    onChange={e => setNovaChamada(p => ({ ...p, nome: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Gatilho</label>
                  <select style={{ ...inputDark, boxSizing: 'border-box' }} value={novaChamada.gatilho}
                    onChange={e => setNovaChamada(p => ({ ...p, gatilho: e.target.value }))}>
                    <option value="agendamento">Agendamento</option>
                    <option value="cadastro">Cadastro</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Fluxo do Bot Builder</label>
                <select style={{ ...inputDark, boxSizing: 'border-box' }} value={novaChamada.bot_fluxo_id}
                  onChange={e => setNovaChamada(p => ({ ...p, bot_fluxo_id: e.target.value }))}>
                  <option value="">Selecione um fluxo...</option>
                  {fluxosBot.map((f: any) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Descrição dos campos coletados (injeta na IA)</label>
                <input style={inputDark} placeholder="Ex: Coleta nome completo, CPF e e-mail"
                  value={novaChamada.descricao_campos}
                  onChange={e => setNovaChamada(p => ({ ...p, descricao_campos: e.target.value }))} />
              </div>
              <button onClick={criarChamada} disabled={criandoChamada || !novaChamada.nome || !novaChamada.bot_fluxo_id}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: C.emerald, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, width: 'fit-content' }}>
                {criandoChamada ? 'Criando...' : 'Criar Chamada'}
              </button>
            </div>
          )}

          {botChamadas.length === 0 ? (
            <div style={{ color: C.textSec, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
              Nenhuma chamada configurada. Configure um fluxo do Bot Builder e adicione aqui.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {botChamadas.map((c: any) => (
                <div key={c.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${C.border}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.nome}</div>
                    <div style={{ fontSize: 11, color: C.textSec }}>
                      Fluxo: <strong>{c.bot_fluxo_nome}</strong> • Gatilho: {c.gatilho}
                      {c.descricao_campos && ` • ${c.descricao_campos}`}
                    </div>
                    <div style={{ fontSize: 10, color: C.violet, marginTop: 2, fontFamily: 'monospace' }}>
                      [COLETAR_DADOS:{c.bot_fluxo_id}]
                    </div>
                  </div>
                  <button onClick={() => deletarChamada(c.id)}
                    style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 16 }}>🗑</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IAConfigPage;
