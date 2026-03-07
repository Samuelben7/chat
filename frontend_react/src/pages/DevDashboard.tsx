import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { devAuthApi, devApiKeysApi, devUsageApi, devWebhookApi, assinaturaApi } from '../services/devApi';

const META_APP_ID = '1456160206025148';
const META_CONFIG_ID = '26272726135679222';

interface ApiKey {
  id: number;
  key_prefix: string;
  nome: string | null;
  ativa: boolean;
  ultima_utilizacao: string | null;
  criada_em: string;
}

interface DevProfile {
  id: number;
  nome: string;
  email: string;
  status: string;
  trial_inicio: string | null;
  trial_fim: string | null;
  whatsapp_conectado: boolean;
  phone_number_id: string | null;
  webhook_url: string | null;
  criado_em: string;
  phone_quality_rating: string | null;
  phone_account_mode: string | null;
  phone_display_number: string | null;
  phone_verified_name: string | null;
  phone_verified: boolean | null;
}

const DevDashboard: React.FC = () => {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'keys' | 'webhook' | 'docs'>('overview');
  const [profile, setProfile] = useState<DevProfile | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [assinatura, setAssinatura] = useState<any>(null);
  const [connectingWA, setConnectingWA] = useState<'idle'|'loading'|'connecting'|'error'>('idle');
  const [connectError, setConnectError] = useState('');
  const signupDataRef = useRef<{ phone_number_id: string; waba_id: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [profileRes, keysRes, usageRes] = await Promise.all([
        devAuthApi.getPerfil(),
        devApiKeysApi.listar(),
        devUsageApi.getUsage(),
      ]);
      setProfile(profileRes);
      setApiKeys(keysRes);
      setUsage(usageRes);

      if (profileRes.webhook_url) setWebhookUrl(profileRes.webhook_url);

      try {
        const ass = await assinaturaApi.getMinha();
        setAssinatura(ass);
      } catch { /* sem assinatura */ }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Embedded Signup Meta ──
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          const ok = ['FINISH','FINISH_ONLY_WABA','FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'];
          if (ok.includes(data.event) && data.data?.phone_number_id && data.data?.waba_id) {
            signupDataRef.current = { phone_number_id: data.data.phone_number_id, waba_id: data.data.waba_id };
          } else if (data.event === 'CANCEL') {
            setConnectingWA('idle');
          }
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectWhatsApp = () => {
    setConnectError('');
    setConnectingWA('loading');
    signupDataRef.current = null;

    const initAndLogin = () => {
      window.FB.init({ appId: META_APP_ID, cookie: true, xfbml: true, version: 'v25.0' });
      setConnectingWA('connecting');
      window.FB.login(
        (response: any) => {
          if (response.authResponse?.code) {
            const code = response.authResponse.code;
            let attempts = 0;
            const interval = setInterval(async () => {
              attempts++;
              const cur = signupDataRef.current;
              if (cur) {
                clearInterval(interval);
                try {
                  await devAuthApi.connectWhatsApp({ code, phone_number_id: cur.phone_number_id, waba_id: cur.waba_id });
                  await loadData();
                  setConnectingWA('idle');
                } catch (err: any) {
                  setConnectingWA('error');
                  setConnectError(err.response?.data?.detail || 'Erro ao conectar WhatsApp.');
                }
              } else if (attempts > 30) {
                clearInterval(interval);
                setConnectingWA('error');
                setConnectError('Timeout: dados do WhatsApp não recebidos. Tente novamente.');
              }
            }, 500);
          } else {
            setConnectingWA('idle');
          }
        },
        {
          config_id: META_CONFIG_ID,
          response_type: 'code',
          override_default_response_type: true,
          extras: { version: 'v3', setup: {} },
        }
      );
    };

    if (window.FB) {
      initAndLogin();
    } else {
      window.fbAsyncInit = initAndLogin;
      if (!document.getElementById('facebook-jssdk')) {
        const s = document.createElement('script');
        s.id = 'facebook-jssdk';
        s.src = 'https://connect.facebook.net/en_US/sdk.js';
        s.async = true; s.defer = true;
        document.body.appendChild(s);
      }
    }
  };

  const handleCreateKey = async () => {
    try {
      const result = await devApiKeysApi.criar(newKeyName || undefined);
      setCreatedKey(result.key);
      setNewKeyName('');
      const keys = await devApiKeysApi.listar();
      setApiKeys(keys);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao criar API key');
    }
  };

  const handleRevokeKey = async (id: number) => {
    if (!window.confirm('Revogar esta API key? Esta acao nao pode ser desfeita.')) return;
    try {
      await devApiKeysApi.revogar(id);
      setApiKeys(prev => prev.filter(k => k.id !== id));
    } catch { alert('Erro ao revogar key'); }
  };

  const handleSaveWebhook = async () => {
    try {
      const result = await devWebhookApi.setConfig(webhookUrl);
      setWebhookSecret(result.webhook_secret);
      alert('Webhook configurado!');
    } catch { alert('Erro ao salvar webhook'); }
  };

  const handleTestWebhook = async () => {
    try {
      const result = await devWebhookApi.test();
      alert(result.message);
    } catch { alert('Erro ao testar webhook'); }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0e27' }}>
        <p style={{ color: '#fff' }}>Carregando...</p>
      </div>
    );
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff', borderRadius: '12px', padding: '24px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: '16px',
  };

  const statusColor = {
    trial: '#f59e0b',
    active: '#22c55e',
    overdue: '#f97316',
    blocked: '#ef4444',
  }[profile?.status || 'trial'];

  const trialDaysLeft = profile?.trial_fim
    ? Math.max(0, Math.ceil((new Date(profile.trial_fim).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)',
        padding: '16px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px', color: '#00d4ff' }}>{'</>'}</span>
          <span style={{ color: '#fff', fontSize: '18px', fontWeight: 700 }}>Dev Portal</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: '#b8c1ec', fontSize: '14px' }}>{profile?.email}</span>
          <span style={{
            background: statusColor, color: '#fff', padding: '4px 12px',
            borderRadius: '12px', fontSize: '12px', fontWeight: 700,
          }}>
            {profile?.status?.toUpperCase()}
          </span>
          <button onClick={logout} style={{
            background: 'transparent', border: '1px solid #555', color: '#b8c1ec',
            padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
          }}>
            Sair
          </button>
        </div>
      </header>

      {/* Trial Banner */}
      {profile?.status === 'trial' && (
        <div style={{
          background: 'linear-gradient(90deg, #f59e0b, #f97316)',
          color: '#fff', padding: '10px 24px', textAlign: 'center', fontSize: '14px', fontWeight: 600,
        }}>
          Trial gratuito: {trialDaysLeft} dias restantes.
          <a href="/planos" style={{ color: '#fff', marginLeft: '12px', textDecoration: 'underline' }}>
            Assinar agora
          </a>
        </div>
      )}

      {/* Blocked Banner */}
      {profile?.status === 'blocked' && (
        <div style={{
          background: '#ef4444', color: '#fff', padding: '10px 24px', textAlign: 'center', fontSize: '14px', fontWeight: 600,
        }}>
          Sua conta esta bloqueada.
          <a href="/planos" style={{ color: '#fff', marginLeft: '12px', textDecoration: 'underline' }}>
            Renovar assinatura
          </a>
        </div>
      )}

      {/* Nav Tabs */}
      <nav style={{
        display: 'flex', gap: '0', background: '#fff', borderBottom: '1px solid #eee',
        padding: '0 24px',
      }}>
        {(['overview', 'keys', 'webhook', 'docs'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '14px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: '14px', fontWeight: 600,
              color: activeTab === tab ? '#00d4ff' : '#888',
              borderBottom: activeTab === tab ? '2px solid #00d4ff' : '2px solid transparent',
            }}
          >
            {tab === 'overview' ? 'Visao Geral' : tab === 'keys' ? 'API Keys' : tab === 'webhook' ? 'Webhook' : 'Docs'}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px' }}>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <>
            {/* Usage Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
              <div style={cardStyle}>
                <p style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>Mensagens este mes</p>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#1a1f3a', margin: 0 }}>
                  {usage?.messages_this_month || 0}
                  <span style={{ fontSize: '14px', color: '#888', fontWeight: 400 }}> / {usage?.limits?.mensagens_mes || 1000}</span>
                </p>
                <div style={{ marginTop: '8px', background: '#eee', borderRadius: '4px', height: '6px' }}>
                  <div style={{
                    width: `${Math.min(usage?.percentage?.messages || 0, 100)}%`,
                    background: (usage?.percentage?.messages || 0) > 80 ? '#ef4444' : '#00d4ff',
                    height: '100%', borderRadius: '4px',
                  }} />
                </div>
              </div>

              <div style={cardStyle}>
                <p style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>Requests hoje</p>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#1a1f3a', margin: 0 }}>
                  {usage?.requests_today || 0}
                </p>
              </div>

              <div style={cardStyle}>
                <p style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>API Keys ativas</p>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#1a1f3a', margin: 0 }}>
                  {apiKeys.length}
                </p>
              </div>
            </div>

            {/* WhatsApp Status */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', color: '#1a1f3a', marginBottom: '16px' }}>WhatsApp Business</h3>
              {profile?.whatsapp_conectado ? (
                <div>
                  {/* Linha principal: conectado */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', flexShrink: 0,
                    }}>✓</div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#166534', fontSize: '14px' }}>Conectado</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>
                        {profile.phone_display_number || profile.phone_number_id}
                        {profile.phone_verified_name && ` · ${profile.phone_verified_name}`}
                      </div>
                    </div>
                    {/* Badge modo: LIVE ou SANDBOX */}
                    {profile.phone_account_mode && (
                      <span style={{
                        marginLeft: 'auto',
                        padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                        background: profile.phone_account_mode === 'LIVE' ? '#dcfce7' : '#fef9c3',
                        color: profile.phone_account_mode === 'LIVE' ? '#166534' : '#854d0e',
                      }}>
                        {profile.phone_account_mode}
                      </span>
                    )}
                  </div>

                  {/* Grid de detalhes */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Qualidade */}
                    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                        Qualidade do Número
                      </div>
                      {profile.phone_quality_rating ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: profile.phone_quality_rating === 'GREEN' ? '#22c55e'
                              : profile.phone_quality_rating === 'YELLOW' ? '#f59e0b'
                              : profile.phone_quality_rating === 'RED' ? '#ef4444' : '#94a3b8',
                          }} />
                          <span style={{
                            fontSize: '13px', fontWeight: 700,
                            color: profile.phone_quality_rating === 'GREEN' ? '#166534'
                              : profile.phone_quality_rating === 'YELLOW' ? '#854d0e'
                              : profile.phone_quality_rating === 'RED' ? '#991b1b' : '#64748b',
                          }}>
                            {profile.phone_quality_rating === 'GREEN' ? 'Alta' :
                             profile.phone_quality_rating === 'YELLOW' ? 'Média' :
                             profile.phone_quality_rating === 'RED' ? 'Baixa' : 'Desconhecida'}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>—</span>
                      )}
                    </div>

                    {/* Verificação */}
                    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                        Verificação
                      </div>
                      {profile.phone_verified !== null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14px' }}>{profile.phone_verified ? '✅' : '⏳'}</span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: profile.phone_verified ? '#166534' : '#92400e' }}>
                            {profile.phone_verified ? 'Verificado' : 'Pendente'}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>—</span>
                      )}
                    </div>

                    {/* Phone Number ID */}
                    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '11px', color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                        Phone Number ID
                      </div>
                      <code style={{ fontSize: '12px', color: '#334155', wordBreak: 'break-all' }}>
                        {profile.phone_number_id}
                      </code>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ color: '#888', marginBottom: '12px' }}>WhatsApp não conectado. Configure via Embedded Signup da Meta.</p>
                  {connectError && <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '10px' }}>{connectError}</p>}
                  <button
                    onClick={handleConnectWhatsApp}
                    disabled={connectingWA === 'connecting' || connectingWA === 'loading'}
                    style={{
                      padding: '10px 24px', background: '#25D366', color: '#fff',
                      border: 'none', borderRadius: '8px', fontWeight: 600,
                      cursor: connectingWA !== 'idle' && connectingWA !== 'error' ? 'wait' : 'pointer',
                      opacity: connectingWA === 'connecting' || connectingWA === 'loading' ? 0.7 : 1,
                    }}
                  >
                    {connectingWA === 'loading' ? 'Carregando SDK…' : connectingWA === 'connecting' ? 'Conectando…' : '🔗 Conectar WhatsApp'}
                  </button>
                </div>
              )}
            </div>

            {/* Assinatura */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', color: '#1a1f3a', marginBottom: '12px' }}>Assinatura</h3>
              {assinatura ? (
                <div>
                  <p style={{ color: '#333' }}>Plano: <strong>{assinatura.plano_nome}</strong></p>
                  <p style={{ color: '#888', fontSize: '14px' }}>
                    Proximo vencimento: {new Date(assinatura.data_proximo_vencimento).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ color: '#888', marginBottom: '12px' }}>
                    {profile?.status === 'trial' ? `Trial gratuito: ${trialDaysLeft} dias restantes` : 'Sem assinatura ativa'}
                  </p>
                  <a href="/planos" style={{
                    display: 'inline-block', padding: '10px 24px',
                    background: 'linear-gradient(135deg, #00d4ff, #7b2cbf)', color: '#fff',
                    textDecoration: 'none', borderRadius: '8px', fontWeight: 600,
                  }}>
                    Ver Planos
                  </a>
                </div>
              )}
            </div>
          </>
        )}

        {/* API KEYS TAB */}
        {activeTab === 'keys' && (
          <>
            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', color: '#1a1f3a', marginBottom: '16px' }}>Criar Nova API Key</h3>
              <div style={{ display: 'flex', gap: '12px' }}>
                <input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Nome (opcional, ex: Producao)"
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '8px',
                    border: '1px solid #ddd', fontSize: '14px', outline: 'none',
                  }}
                />
                <button onClick={handleCreateKey} style={{
                  padding: '10px 24px', background: '#00d4ff', color: '#fff',
                  border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                }}>
                  Gerar Key
                </button>
              </div>

              {createdKey && (
                <div style={{
                  marginTop: '16px', background: '#f0fdf4', border: '1px solid #22c55e',
                  borderRadius: '8px', padding: '16px',
                }}>
                  <p style={{ color: '#166534', fontWeight: 600, marginBottom: '8px' }}>
                    API Key criada! Copie agora - ela nao sera exibida novamente.
                  </p>
                  <code style={{
                    display: 'block', background: '#fff', padding: '12px',
                    borderRadius: '6px', fontSize: '13px', wordBreak: 'break-all',
                    border: '1px solid #ddd',
                  }}>
                    {createdKey}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(createdKey); alert('Copiado!'); }}
                    style={{
                      marginTop: '8px', padding: '6px 16px', background: '#22c55e', color: '#fff',
                      border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                    }}
                  >
                    Copiar
                  </button>
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', color: '#1a1f3a', marginBottom: '16px' }}>Suas API Keys</h3>
              {apiKeys.length === 0 ? (
                <p style={{ color: '#888' }}>Nenhuma API key criada ainda.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #eee' }}>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#888', fontSize: '13px' }}>Prefixo</th>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#888', fontSize: '13px' }}>Nome</th>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#888', fontSize: '13px' }}>Ultimo Uso</th>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#888', fontSize: '13px' }}>Criada</th>
                      <th style={{ textAlign: 'right', padding: '8px', color: '#888', fontSize: '13px' }}>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map(key => (
                      <tr key={key.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '10px 8px' }}>
                          <code style={{ background: '#f5f5f5', padding: '2px 8px', borderRadius: '4px', fontSize: '13px' }}>
                            {key.key_prefix}...
                          </code>
                        </td>
                        <td style={{ padding: '10px 8px', color: '#333' }}>{key.nome || '-'}</td>
                        <td style={{ padding: '10px 8px', color: '#888', fontSize: '13px' }}>
                          {key.ultima_utilizacao ? new Date(key.ultima_utilizacao).toLocaleString('pt-BR') : 'Nunca'}
                        </td>
                        <td style={{ padding: '10px 8px', color: '#888', fontSize: '13px' }}>
                          {new Date(key.criada_em).toLocaleDateString('pt-BR')}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleRevokeKey(key.id)}
                            style={{
                              padding: '4px 12px', background: '#fee2e2', color: '#dc2626',
                              border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                            }}
                          >
                            Revogar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* WEBHOOK TAB */}
        {activeTab === 'webhook' && (
          <div style={cardStyle}>
            <h3 style={{ fontSize: '16px', color: '#1a1f3a', marginBottom: '16px' }}>Configuracao de Webhook</h3>
            <p style={{ color: '#888', fontSize: '14px', marginBottom: '16px' }}>
              Configure a URL para onde enviaremos as mensagens recebidas no seu numero WhatsApp.
              Cada request inclui um header X-Webhook-Signature com HMAC-SHA256 para verificacao.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                Webhook URL
              </label>
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://seu-servidor.com/webhook"
                style={{
                  width: '100%', padding: '10px 16px', borderRadius: '8px',
                  border: '1px solid #ddd', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {webhookSecret && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                  Webhook Secret (para verificar assinaturas)
                </label>
                <code style={{
                  display: 'block', background: '#f5f5f5', padding: '10px 16px',
                  borderRadius: '8px', fontSize: '13px', wordBreak: 'break-all',
                }}>
                  {webhookSecret}
                </code>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleSaveWebhook} style={{
                padding: '10px 24px', background: '#00d4ff', color: '#fff',
                border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
              }}>
                Salvar
              </button>
              <button onClick={handleTestWebhook} style={{
                padding: '10px 24px', background: '#f5f5f5', color: '#333',
                border: '1px solid #ddd', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
              }}>
                Enviar Teste
              </button>
            </div>
          </div>
        )}

        {/* DOCS TAB */}
        {activeTab === 'docs' && (
          <div style={cardStyle}>
            <h3 style={{ fontSize: '16px', color: '#1a1f3a', marginBottom: '16px' }}>Documentacao da API</h3>
            <p style={{ color: '#888', fontSize: '14px', marginBottom: '20px' }}>
              Use o API Gateway para enviar mensagens WhatsApp diretamente pela API da Meta,
              sem precisar de servidor proprio.
            </p>

            <h4 style={{ fontSize: '14px', color: '#1a1f3a', marginTop: '20px', marginBottom: '8px' }}>
              Base URL
            </h4>
            <code style={{
              display: 'block', background: '#1a1f3a', color: '#00d4ff', padding: '12px 16px',
              borderRadius: '8px', fontSize: '14px', marginBottom: '16px',
            }}>
              https://api.yoursystem.dev.br/gateway
            </code>

            <h4 style={{ fontSize: '14px', color: '#1a1f3a', marginTop: '20px', marginBottom: '8px' }}>
              Autenticacao
            </h4>
            <p style={{ color: '#555', fontSize: '14px', marginBottom: '8px' }}>
              Envie sua API key no header <code>X-Api-Key</code>:
            </p>
            <pre style={{
              background: '#1a1f3a', color: '#e2e8f0', padding: '16px',
              borderRadius: '8px', fontSize: '13px', overflow: 'auto',
            }}>{`curl -X POST https://api.yoursystem.dev.br/gateway/messages \\
  -H "X-Api-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messaging_product": "whatsapp",
    "to": "5511999999999",
    "type": "text",
    "text": { "body": "Ola! Mensagem via API Gateway." }
  }'`}</pre>

            <h4 style={{ fontSize: '14px', color: '#1a1f3a', marginTop: '24px', marginBottom: '8px' }}>
              Enviar midia
            </h4>
            <pre style={{
              background: '#1a1f3a', color: '#e2e8f0', padding: '16px',
              borderRadius: '8px', fontSize: '13px', overflow: 'auto',
            }}>{`POST /gateway/media
Content-Type: multipart/form-data
X-Api-Key: SUA_API_KEY

# Upload de imagem, video, audio ou documento
# Max: 100MB`}</pre>

            <h4 style={{ fontSize: '14px', color: '#1a1f3a', marginTop: '24px', marginBottom: '8px' }}>
              Limites
            </h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px', color: '#555' }}>Rate limit</td>
                  <td style={{ padding: '8px', color: '#333', fontWeight: 600 }}>{usage?.limits?.requests_min || 60} requests/min</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px', color: '#555' }}>Mensagens/mes</td>
                  <td style={{ padding: '8px', color: '#333', fontWeight: 600 }}>{usage?.limits?.mensagens_mes || 1000}</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px', color: '#555' }}>Upload maximo</td>
                  <td style={{ padding: '8px', color: '#333', fontWeight: 600 }}>100MB</td>
                </tr>
              </tbody>
            </table>

            <h4 style={{ fontSize: '14px', color: '#1a1f3a', marginTop: '24px', marginBottom: '8px' }}>
              Codigos de resposta
            </h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}><code>200</code></td>
                  <td style={{ padding: '8px', color: '#555' }}>Mensagem enviada com sucesso</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}><code>401</code></td>
                  <td style={{ padding: '8px', color: '#555' }}>API key invalida</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}><code>403</code></td>
                  <td style={{ padding: '8px', color: '#555' }}>Conta bloqueada ou trial expirado</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px' }}><code>429</code></td>
                  <td style={{ padding: '8px', color: '#555' }}>Rate limit excedido (veja header Retry-After)</td>
                </tr>
              </tbody>
            </table>

            <h4 style={{ fontSize: '14px', color: '#1a1f3a', marginTop: '24px', marginBottom: '8px' }}>
              Webhook (mensagens recebidas)
            </h4>
            <p style={{ color: '#555', fontSize: '14px', lineHeight: 1.6 }}>
              Quando alguem envia mensagem para seu numero WhatsApp, encaminhamos o payload
              para a URL configurada na aba Webhook. O header <code>X-Webhook-Signature</code> contem
              a assinatura HMAC-SHA256 do body usando seu webhook_secret.
            </p>
            <p style={{ color: '#555', fontSize: '14px', lineHeight: 1.6, marginTop: '8px' }}>
              <strong>Importante:</strong> A regra de negocio (bot, respostas automaticas, etc.)
              fica por sua conta no seu servidor. A plataforma apenas roteia as mensagens.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DevDashboard;
