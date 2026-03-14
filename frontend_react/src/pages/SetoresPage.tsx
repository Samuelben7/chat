import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

interface AtendenteSimples {
  id: number;
  nome_exibicao: string;
  status: string;
}

interface Setor {
  id: number;
  nome: string;
  descricao?: string;
  ativo: boolean;
  ordem: number;
  atendentes: AtendenteSimples[];
}

interface AtendenteDisponivel {
  id: number;
  nome_exibicao: string;
  status: string;
}

interface Especialidade {
  id: number;
  nome: string;
  descricao?: string;
  valor?: number;
  duracao_minutos?: number;
  ativo: boolean;
}

const SetoresPage: React.FC = () => {
  const navigate = useNavigate();
  const { colors } = useTheme();

  const [aba, setAba] = useState<'setores' | 'especialidades'>('setores');

  // Setores
  const [setores, setSetores] = useState<Setor[]>([]);
  const [atendentesDisponiveis, setAtendentesDisponiveis] = useState<AtendenteDisponivel[]>([]);
  const [loadingSetores, setLoadingSetores] = useState(false);
  const [novoSetor, setNovoSetor] = useState({ nome: '', descricao: '', ordem: 0 });
  const [criandoSetor, setCriandoSetor] = useState(false);
  const [setorExpandido, setSetorExpandido] = useState<number | null>(null);

  // Especialidades
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [loadingEsp, setLoadingEsp] = useState(false);
  const [novaEsp, setNovaEsp] = useState({ nome: '', descricao: '', valor: '', duracao_minutos: '' });
  const [criandoEsp, setCriandoEsp] = useState(false);

  useEffect(() => {
    carregarSetores();
    carregarAtendentes();
    carregarEspecialidades();
  }, []);

  const carregarSetores = async () => {
    setLoadingSetores(true);
    try {
      const res = await api.get('/setores');
      setSetores(res.data);
    } catch {}
    setLoadingSetores(false);
  };

  const carregarAtendentes = async () => {
    try {
      const res = await api.get('/atendentes');
      setAtendentesDisponiveis(res.data.map((a: any) => ({
        id: a.id,
        nome_exibicao: a.nome_exibicao || a.nome,
        status: a.status,
      })));
    } catch {}
  };

  const carregarEspecialidades = async () => {
    setLoadingEsp(true);
    try {
      const res = await api.get('/especialidades');
      setEspecialidades(res.data);
    } catch {}
    setLoadingEsp(false);
  };

  const criarSetor = async () => {
    if (!novoSetor.nome.trim()) return;
    setCriandoSetor(true);
    try {
      await api.post('/setores', { nome: novoSetor.nome, descricao: novoSetor.descricao || undefined, ordem: novoSetor.ordem });
      setNovoSetor({ nome: '', descricao: '', ordem: 0 });
      await carregarSetores();
    } catch {}
    setCriandoSetor(false);
  };

  const deletarSetor = async (id: number) => {
    if (!window.confirm('Deletar este setor?')) return;
    try {
      await api.delete(`/setores/${id}`);
      await carregarSetores();
    } catch {}
  };

  const adicionarAtendente = async (setorId: number, atendenteId: number) => {
    try {
      await api.post(`/setores/${setorId}/atendentes/${atendenteId}`);
      await carregarSetores();
    } catch (e: any) {
      if (e.response?.status === 409) alert('Atendente já está neste setor');
    }
  };

  const removerAtendente = async (setorId: number, atendenteId: number) => {
    try {
      await api.delete(`/setores/${setorId}/atendentes/${atendenteId}`);
      await carregarSetores();
    } catch {}
  };

  const criarEspecialidade = async () => {
    if (!novaEsp.nome.trim()) return;
    setCriandoEsp(true);
    try {
      await api.post('/especialidades', {
        nome: novaEsp.nome,
        descricao: novaEsp.descricao || undefined,
        valor: novaEsp.valor ? parseFloat(novaEsp.valor) : undefined,
        duracao_minutos: novaEsp.duracao_minutos ? parseInt(novaEsp.duracao_minutos) : undefined,
      });
      setNovaEsp({ nome: '', descricao: '', valor: '', duracao_minutos: '' });
      await carregarEspecialidades();
    } catch {}
    setCriandoEsp(false);
  };

  const deletarEspecialidade = async (id: number) => {
    if (!window.confirm('Deletar esta especialidade?')) return;
    try {
      await api.delete(`/especialidades/${id}`);
      await carregarEspecialidades();
    } catch {}
  };

  const g = {
    background: colors.cardBg,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
  };

  return (
    <div style={{ minHeight: '100vh', background: colors.bg, color: colors.textPrimary }}>
      {/* Header */}
      <div style={{
        background: colors.cardBg,
        borderBottom: `1px solid ${colors.border}`,
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <button
          onClick={() => navigate('/empresa/dashboard')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary, fontSize: 20 }}
        >
          ←
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Setores & Especialidades</h1>
          <p style={{ margin: 0, fontSize: 13, color: colors.textSecondary }}>Gerencie departamentos e serviços da sua empresa</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['setores', 'especialidades'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setAba(tab)}
              style={{
                padding: '8px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                background: aba === tab ? colors.primary : 'transparent',
                color: aba === tab ? '#fff' : colors.textSecondary,
                border: `1px solid ${aba === tab ? colors.primary : colors.border}`,
              }}
            >
              {tab === 'setores' ? '🗂️ Setores' : '⭐ Especialidades'}
            </button>
          ))}
        </div>

        {/* ─── SETORES ─── */}
        {aba === 'setores' && (
          <div style={{ maxWidth: 700 }}>
            {/* Criar setor */}
            <div style={{ ...g, padding: 20, marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>Novo Setor</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  value={novoSetor.nome}
                  onChange={(e) => setNovoSetor({ ...novoSetor, nome: e.target.value })}
                  placeholder="Nome do setor (ex: Loja 1, Financeiro...)"
                  style={{
                    flex: 2, padding: '9px 12px', borderRadius: 8, border: `1px solid ${colors.border}`,
                    background: colors.inputBg, color: colors.textPrimary, fontSize: 14,
                  }}
                />
                <input
                  value={novoSetor.descricao}
                  onChange={(e) => setNovoSetor({ ...novoSetor, descricao: e.target.value })}
                  placeholder="Descrição (opcional)"
                  style={{
                    flex: 2, padding: '9px 12px', borderRadius: 8, border: `1px solid ${colors.border}`,
                    background: colors.inputBg, color: colors.textPrimary, fontSize: 14,
                  }}
                />
                <button
                  onClick={criarSetor}
                  disabled={criandoSetor || !novoSetor.nome.trim()}
                  style={{
                    padding: '9px 20px', borderRadius: 8, background: colors.primary,
                    color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
                    opacity: criandoSetor || !novoSetor.nome.trim() ? 0.5 : 1,
                  }}
                >
                  {criandoSetor ? '...' : '+ Criar'}
                </button>
              </div>
            </div>

            {/* Lista de setores */}
            {loadingSetores ? (
              <div style={{ textAlign: 'center', padding: 40, color: colors.textSecondary }}>Carregando...</div>
            ) : setores.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: colors.textSecondary }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>🗂️</p>
                <p>Nenhum setor criado ainda. Crie o primeiro acima!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {setores.map((setor) => {
                  const expanded = setorExpandido === setor.id;
                  const idsNoSetor = new Set(setor.atendentes.map((a) => a.id));
                  const disponiveis = atendentesDisponiveis.filter((a) => !idsNoSetor.has(a.id));

                  return (
                    <div key={setor.id} style={g}>
                      {/* Header setor */}
                      <div
                        onClick={() => setSetorExpandido(expanded ? null : setor.id)}
                        style={{
                          padding: '14px 18px', display: 'flex', alignItems: 'center',
                          justifyContent: 'space-between', cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 20 }}>🗂️</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{setor.nome}</div>
                            {setor.descricao && <div style={{ fontSize: 12, color: colors.textSecondary }}>{setor.descricao}</div>}
                          </div>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 20,
                            background: colors.inputBg, color: colors.textSecondary,
                          }}>
                            {setor.atendentes.length} atendente{setor.atendentes.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color: colors.textSecondary, fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); deletarSetor(setor.id); }}
                            style={{
                              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                              borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                              color: '#ef4444', fontSize: 12, fontWeight: 600,
                            }}
                          >
                            Deletar
                          </button>
                        </div>
                      </div>

                      {/* Conteúdo expandido */}
                      {expanded && (
                        <div style={{ padding: '0 18px 16px', borderTop: `1px solid ${colors.border}` }}>
                          {/* Atendentes do setor */}
                          <div style={{ marginTop: 14 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, marginBottom: 8 }}>
                              ATENDENTES NESTE SETOR
                            </p>
                            {setor.atendentes.length === 0 ? (
                              <p style={{ fontSize: 13, color: colors.textSecondary }}>Nenhum atendente. Adicione abaixo.</p>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                                {setor.atendentes.map((at) => (
                                  <div
                                    key={at.id}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 6,
                                      padding: '5px 10px', borderRadius: 20,
                                      background: colors.inputBg, border: `1px solid ${colors.border}`,
                                    }}
                                  >
                                    <div style={{
                                      width: 7, height: 7, borderRadius: '50%',
                                      background: at.status === 'online' ? '#22c55e' : '#9ca3af',
                                    }} />
                                    <span style={{ fontSize: 13, color: colors.textPrimary }}>{at.nome_exibicao}</span>
                                    <button
                                      onClick={() => removerAtendente(setor.id, at.id)}
                                      style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: '#ef4444', fontSize: 14, padding: '0 2px',
                                      }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Adicionar atendente */}
                            {disponiveis.length > 0 && (
                              <div>
                                <p style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, marginBottom: 6 }}>
                                  ADICIONAR ATENDENTE
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {disponiveis.map((at) => (
                                    <button
                                      key={at.id}
                                      onClick={() => adicionarAtendente(setor.id, at.id)}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                                        background: 'transparent',
                                        border: `1px dashed ${colors.primary}`,
                                        color: colors.primary, fontSize: 13,
                                      }}
                                    >
                                      + {at.nome_exibicao}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── ESPECIALIDADES ─── */}
        {aba === 'especialidades' && (
          <div style={{ maxWidth: 700 }}>
            {/* Criar especialidade */}
            <div style={{ ...g, padding: 20, marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>Nova Especialidade</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <input
                  value={novaEsp.nome}
                  onChange={(e) => setNovaEsp({ ...novaEsp, nome: e.target.value })}
                  placeholder="Nome (ex: Canal, Limpeza, Previdenciário...)"
                  style={{
                    padding: '9px 12px', borderRadius: 8, border: `1px solid ${colors.border}`,
                    background: colors.inputBg, color: colors.textPrimary, fontSize: 14,
                    gridColumn: '1 / -1',
                  }}
                />
                <input
                  value={novaEsp.descricao}
                  onChange={(e) => setNovaEsp({ ...novaEsp, descricao: e.target.value })}
                  placeholder="Descrição do procedimento (opcional)"
                  style={{
                    padding: '9px 12px', borderRadius: 8, border: `1px solid ${colors.border}`,
                    background: colors.inputBg, color: colors.textPrimary, fontSize: 14,
                    gridColumn: '1 / -1',
                  }}
                />
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                    color: colors.textSecondary, fontSize: 13,
                  }}>R$</span>
                  <input
                    type="number"
                    value={novaEsp.valor}
                    onChange={(e) => setNovaEsp({ ...novaEsp, valor: e.target.value })}
                    placeholder="0,00"
                    style={{
                      width: '100%', padding: '9px 12px 9px 28px', borderRadius: 8,
                      border: `1px solid ${colors.border}`, background: colors.inputBg,
                      color: colors.textPrimary, fontSize: 14, boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    value={novaEsp.duracao_minutos}
                    onChange={(e) => setNovaEsp({ ...novaEsp, duracao_minutos: e.target.value })}
                    placeholder="Duração (min)"
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: 8,
                      border: `1px solid ${colors.border}`, background: colors.inputBg,
                      color: colors.textPrimary, fontSize: 14, boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
              <button
                onClick={criarEspecialidade}
                disabled={criandoEsp || !novaEsp.nome.trim()}
                style={{
                  padding: '9px 24px', borderRadius: 8, background: colors.primary,
                  color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
                  opacity: criandoEsp || !novaEsp.nome.trim() ? 0.5 : 1,
                }}
              >
                {criandoEsp ? '...' : '+ Criar Especialidade'}
              </button>
            </div>

            {/* Lista especialidades */}
            {loadingEsp ? (
              <div style={{ textAlign: 'center', padding: 40, color: colors.textSecondary }}>Carregando...</div>
            ) : especialidades.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: colors.textSecondary }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>⭐</p>
                <p>Nenhuma especialidade cadastrada ainda.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {especialidades.map((esp) => (
                  <div key={esp.id} style={{ ...g, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{esp.nome}</div>
                      {esp.descricao && <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{esp.descricao}</div>}
                      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                        {esp.valor !== undefined && esp.valor !== null && (
                          <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
                            R$ {Number(esp.valor).toFixed(2)}
                          </span>
                        )}
                        {esp.duracao_minutos && (
                          <span style={{ fontSize: 13, color: colors.textSecondary }}>
                            ⏱ {esp.duracao_minutos} min
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => deletarEspecialidade(esp.id)}
                      style={{
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                        color: '#ef4444', fontSize: 12, fontWeight: 600,
                      }}
                    >
                      Deletar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SetoresPage;
